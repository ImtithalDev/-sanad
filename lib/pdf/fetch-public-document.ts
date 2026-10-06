import { createClient } from "@/lib/supabase/server";
import type { DocumentTemplateData } from "./types";

// Deliberately the ONLY way the public share page/PDF route reads a document.
// It calls get_public_document(token), a security-definer RPC that itself
// checks the token is valid and not revoked before returning anything — this
// function does not and must not read quotes/invoices tables directly, or it
// would bypass the whole point of gating access by token.
export async function fetchPublicDocument(token: string, locale: "ar" | "en"): Promise<DocumentTemplateData | null> {
  const supabase = createClient(); // anon-key client is fine here: no session needed or used

  const { data, error } = await supabase.rpc("get_public_document", { p_token: token });
  if (error || !data) return null;

  const raw = data as any;

  return {
    kind: raw.kind,
    locale,
    document_number: raw.document_number,
    status: raw.status,
    issue_date: raw.issue_date,
    due_or_expiry_date: raw.due_date ?? raw.expiry_date ?? null,
    currency: raw.currency,
    subtotal_cents: raw.subtotal_cents,
    discount_cents: raw.discount_cents,
    tax_cents: raw.tax_cents,
    total_cents: raw.total_cents,
    notes: raw.notes,
    terms: raw.terms,
    client: raw.client?.name ? raw.client : null,
    business: raw.business?.name ? raw.business : null,
    items: raw.items ?? [],
  };
}
