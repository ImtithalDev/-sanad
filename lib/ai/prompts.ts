type Locale = "ar" | "en";

const JSON_ONLY_RULE =
  "Respond with ONLY a single JSON object matching the schema described. No markdown, no code fences, no commentary before or after the JSON.";

function languageInstruction(locale: Locale): string {
  return locale === "ar"
    ? "Write all natural-language content in professional Modern Standard Arabic."
    : "Write all natural-language content in professional business English.";
}

export function buildQuoteDraftPrompt(jobDescription: string, locale: Locale) {
  const system = `You help a small business owner draft a price quote from a plain description of a job. ${languageInstruction(
    locale
  )} ${JSON_ONLY_RULE}
Schema: { "items": [{ "description": string, "quantity": number, "suggested_unit_price_cents": number|null, "tax_rate": number }], "notes": string|null, "terms": string|null }
Rules:
- "suggested_unit_price_cents" is an integer number of minor currency units (e.g. halalas/cents). Use null if you have no reasonable basis to suggest a price for that line — do not invent a number just to fill the field.
- "tax_rate" is a percentage (e.g. 15 for 15%). Use 0 if unknown.
- Break the job into 2-6 realistic line items, not one giant line.
- Every price you DO suggest is a rough starting point the user will review and edit — never state or imply it is final.`;

  const prompt = `Job description from the business owner:\n"""${jobDescription}"""\n\nProduce the JSON quote draft now.`;

  return { system, prompt };
}

export function buildImproveDescriptionPrompt(roughText: string, locale: Locale) {
  const system = `You turn a business owner's rough, casual line-item description into a single professional sentence suitable for a quote or invoice. ${languageInstruction(
    locale
  )} ${JSON_ONLY_RULE}
Schema: { "description": string }
Rules:
- One sentence, specific, no fluff, no exclamation marks, no emoji.
- Do not invent scope, quantities, or prices that weren't implied by the input.`;

  const prompt = `Rough description: "${roughText}"\n\nProduce the JSON now.`;

  return { system, prompt };
}

export type ClientMessageKind = "send_quote" | "follow_up_quote" | "send_invoice" | "payment_reminder";

export function buildClientMessagePrompt(
  kind: ClientMessageKind,
  context: { clientName: string; documentNumber: string; totalDisplay: string; currency: string; dueOrExpiryDate: string | null },
  locale: Locale
) {
  const kindInstruction: Record<ClientMessageKind, string> = {
    send_quote: "Write a short message to send a new price quote to the client, ready to attach a PDF link to.",
    follow_up_quote: "Write a short, polite follow-up message about a quote the client hasn't responded to yet.",
    send_invoice: "Write a short message to send a new invoice to the client, ready to attach a PDF link to.",
    payment_reminder: "Write a short, polite payment reminder for an invoice that is due or overdue.",
  };

  const system = `You write short, professional client messages for a small business, suitable for WhatsApp or email. ${languageInstruction(
    locale
  )} ${JSON_ONLY_RULE}
Schema: { "message": string }
Rules:
- 2-4 sentences maximum. No subject line, no signature block, no placeholders like "[Your Name]".
- Friendly but professional tone. Do not pressure or guilt the client, especially for payment reminders.
- Only reference the specific details given below — never invent amounts, dates, or names.`;

  const prompt = `${kindInstruction[kind]}
Client name: ${context.clientName}
Document number: ${context.documentNumber}
Total: ${context.totalDisplay} ${context.currency}
${context.dueOrExpiryDate ? `Relevant date: ${context.dueOrExpiryDate}` : ""}

Produce the JSON now.`;

  return { system, prompt };
}

export type BusinessTermsKind = "payment_terms" | "quote_terms" | "delivery_terms" | "service_notes";

export function buildBusinessTermsPrompt(kind: BusinessTermsKind, businessType: string | null, locale: Locale) {
  const kindInstruction: Record<BusinessTermsKind, string> = {
    payment_terms: "Suggest a short, standard payment-terms clause (e.g. when payment is due, accepted methods in general terms).",
    quote_terms: "Suggest a short, standard quote-validity/terms clause (e.g. how long the quote is valid for).",
    delivery_terms: "Suggest a short, standard delivery/timeline terms clause.",
    service_notes: "Suggest a short, standard service-scope note (what is and isn't included, in general terms).",
  };

  const system = `You write short, standard boilerplate clauses for small-business quotes and invoices. ${languageInstruction(
    locale
  )} ${JSON_ONLY_RULE}
Schema: { "text": string }
Rules:
- 1-3 sentences. Generic and safe — this is a starting point the business owner will edit, not legal advice.
- Do not state specific prices, dates, or legal claims specific to any jurisdiction.`;

  const prompt = `${kindInstruction[kind]}${businessType ? `\nBusiness type: ${businessType}` : ""}\n\nProduce the JSON now.`;

  return { system, prompt };
}
