import { NextResponse } from "next/server";
import { z } from "zod";
import { runStructuredAIFeature } from "@/lib/ai/service";
import { buildBusinessTermsPrompt, type BusinessTermsKind } from "@/lib/ai/prompts";
import { businessTermsSchema } from "@/lib/ai/schemas";
import { aiErrorToResponse } from "@/lib/ai/http";
import { createClient } from "@/lib/supabase/server";
import { AIUnauthenticatedError } from "@/lib/ai/errors";

const requestSchema = z.object({
  kind: z.enum(["payment_terms", "quote_terms", "delivery_terms", "service_notes"]),
  locale: z.enum(["ar", "en"]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error_code: "invalid_request" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error_code: "invalid_request" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return aiErrorToResponse(new AIUnauthenticatedError());
  }

  // business_type only — never sends the business name, address, tax number,
  // or anything else identifying to the AI provider for this feature, since
  // none of it is needed to suggest a generic boilerplate clause.
  const { data: business } = await supabase
    .from("business_profiles")
    .select("business_type")
    .eq("user_id", user.id)
    .maybeSingle();

  const { system, prompt } = buildBusinessTermsPrompt(parsed.data.kind as BusinessTermsKind, business?.business_type ?? null, parsed.data.locale);

  try {
    const result = await runStructuredAIFeature({ system, prompt, schema: businessTermsSchema, maxTokens: 300 });
    return NextResponse.json(result);
  } catch (err) {
    return aiErrorToResponse(err);
  }
}
