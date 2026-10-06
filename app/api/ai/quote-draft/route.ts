import { NextResponse } from "next/server";
import { z } from "zod";
import { runStructuredAIFeature } from "@/lib/ai/service";
import { buildQuoteDraftPrompt } from "@/lib/ai/prompts";
import { quoteDraftSchema } from "@/lib/ai/schemas";
import { aiErrorToResponse } from "@/lib/ai/http";

// Only ever sends the free-text job description the user typed plus the
// chosen locale to the AI provider — no client name, contact info, business
// data, or anything else from the account is included in this request.
const requestSchema = z.object({
  description: z.string().min(3).max(1000),
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

  const { system, prompt } = buildQuoteDraftPrompt(parsed.data.description, parsed.data.locale);

  try {
    const draft = await runStructuredAIFeature({ system, prompt, schema: quoteDraftSchema, maxTokens: 1200 });
    // This is a DRAFT the client reviews/edits in the UI — nothing here has
    // touched the quotes/quote_items tables. Saving still goes exclusively
    // through the existing createQuote Server Action (Phase 4), which
    // re-validates and computes totals itself regardless of what the AI said.
    return NextResponse.json({ draft });
  } catch (err) {
    return aiErrorToResponse(err);
  }
}
