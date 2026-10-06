import { NextResponse } from "next/server";
import { z } from "zod";
import { runStructuredAIFeature } from "@/lib/ai/service";
import { buildClientMessagePrompt, type ClientMessageKind } from "@/lib/ai/prompts";
import { clientMessageSchema } from "@/lib/ai/schemas";
import { aiErrorToResponse } from "@/lib/ai/http";
import { fetchOwnedQuoteForDocument, fetchOwnedInvoiceForDocument } from "@/lib/pdf/fetch-owned-document";
import { centsToDisplay } from "@/lib/money";
import { AIUnauthenticatedError } from "@/lib/ai/errors";

const requestSchema = z.object({
  documentType: z.enum(["quote", "invoice"]),
  documentId: z.string().uuid(),
  kind: z.enum(["send_quote", "follow_up_quote", "send_invoice", "payment_reminder"]),
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

  const { documentType, documentId, kind, locale } = parsed.data;

  // The document is fetched server-side through the SAME owner-scoped,
  // RLS-backed query the PDF/print routes use (Phase 6) — never from
  // client-supplied name/amount fields. This is what makes "AI cannot be
  // used to pull another user's data" true here: there is no code path in
  // this route that accepts a client name or total as input.
  const data =
    documentType === "quote"
      ? await fetchOwnedQuoteForDocument(documentId, locale)
      : await fetchOwnedInvoiceForDocument(documentId, locale);

  if (!data) {
    // Covers "not authenticated", "not found", and "belongs to someone
    // else" with the same response — no distinction leaked either way.
    return aiErrorToResponse(new AIUnauthenticatedError());
  }

  // Privacy minimization: only name, document number, total, currency, and
  // the relevant date are sent to the AI provider. Email, phone, and address
  // are read above (they're part of DocumentTemplateData) but deliberately
  // left out of what actually reaches buildClientMessagePrompt.
  const { system, prompt } = buildClientMessagePrompt(
    kind as ClientMessageKind,
    {
      clientName: data.client?.name ?? (locale === "ar" ? "العميل" : "the client"),
      documentNumber: data.document_number,
      totalDisplay: centsToDisplay(data.total_cents),
      currency: data.currency,
      dueOrExpiryDate: data.due_or_expiry_date,
    },
    locale
  );

  try {
    const result = await runStructuredAIFeature({ system, prompt, schema: clientMessageSchema, maxTokens: 400 });
    return NextResponse.json(result);
  } catch (err) {
    return aiErrorToResponse(err);
  }
}
