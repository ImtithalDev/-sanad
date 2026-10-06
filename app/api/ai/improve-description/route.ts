import { NextResponse } from "next/server";
import { z } from "zod";
import { runStructuredAIFeature } from "@/lib/ai/service";
import { buildImproveDescriptionPrompt } from "@/lib/ai/prompts";
import { improveDescriptionSchema } from "@/lib/ai/schemas";
import { aiErrorToResponse } from "@/lib/ai/http";

const requestSchema = z.object({
  text: z.string().min(1).max(300),
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

  const { system, prompt } = buildImproveDescriptionPrompt(parsed.data.text, parsed.data.locale);

  try {
    const result = await runStructuredAIFeature({ system, prompt, schema: improveDescriptionSchema, maxTokens: 300 });
    return NextResponse.json(result);
  } catch (err) {
    return aiErrorToResponse(err);
  }
}
