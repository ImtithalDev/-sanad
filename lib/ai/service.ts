import type { ZodSchema } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "./get-provider";
import { AIQuotaExceededError, AIUnauthenticatedError, AIMalformedResponseError } from "./errors";

// Strips a ```json ... ``` fence if the model wraps its output in one despite
// being told not to — defensive, not a substitute for the JSON_ONLY_RULE
// instruction in prompts.ts.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

// Generic executor for every AI feature in the app:
// 1. Confirm there's a real authenticated session (defense in depth — the
//    RPC below re-checks auth.uid() itself regardless of what this does).
// 2. Reserve one unit of usage atomically. Throws AIQuotaExceededError if
//    the plan's monthly limit is already hit — the provider is never even
//    called in that case.
// 3. Call the provider. On ANY failure past this point (provider error,
//    timeout, malformed JSON, schema validation failure), refund the
//    reserved usage before rethrowing — a failed request costs the user
//    nothing.
// 4. Parse and validate the response against the caller's zod schema.
//    An AI response that doesn't match the schema is never passed through
//    to the client "as is" — it's treated as a failure, refunded, and
//    reported as AIMalformedResponseError.
export async function runStructuredAIFeature<T>(params: {
  system: string;
  prompt: string;
  schema: ZodSchema<T>;
  maxTokens?: number;
}): Promise<T> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new AIUnauthenticatedError();
  }

  const { error: reserveError } = await supabase.rpc("reserve_ai_usage");
  if (reserveError) {
    if (reserveError.message?.includes("ai_quota_exceeded")) {
      throw new AIQuotaExceededError();
    }
    throw new AIUnauthenticatedError(reserveError.message);
  }

  try {
    const provider = getAIProvider();
    const rawText = await provider.generateText({
      system: params.system,
      prompt: params.prompt,
      maxTokens: params.maxTokens,
    });

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJson(rawText));
    } catch {
      throw new AIMalformedResponseError("AI response was not valid JSON");
    }

    const validation = params.schema.safeParse(parsedJson);
    if (!validation.success) {
      throw new AIMalformedResponseError(validation.error.message);
    }

    return validation.data;
  } catch (err) {
    // Refund on every failure path above — provider errors/timeouts thrown
    // by the provider class, and the malformed-response cases thrown here,
    // both land in this catch.
   try {
  await supabase.rpc("refund_ai_usage");
} catch {
  // Non-fatal: refund failure should not replace the original AI error.
}
    throw err;
  }
}
