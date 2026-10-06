"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import type { LineItemDraft, DocumentHeaderDraft } from "@/lib/validation/document";
import { validateDocument, hasErrors } from "@/lib/validation/document";

export type QuoteActionResult = { success: boolean; error?: string; quotaExceeded?: boolean };

function itemsToRpcPayload(items: LineItemDraft[]) {
  return items.map((item, idx) => ({
    description: item.description.trim(),
    quantity: Number(item.quantity),
    unit_price_cents: Math.round(Number(item.unit_price) * 100),
    discount_cents: item.discount ? Math.round(Number(item.discount) * 100) : 0,
    tax_rate: item.tax_rate ? Number(item.tax_rate) : 0,
    product_id: item.product_id || null,
    sort_order: idx,
  }));
}

// The RPC itself (create_quote_with_items / update_quote_with_items) re-checks
// that client_id and every product_id actually belong to the caller — this
// action does NOT skip that check just because it's "just the UI layer".
export async function createQuote(header: DocumentHeaderDraft, items: LineItemDraft[]): Promise<QuoteActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const errors = validateDocument(header, items, t);
  if (hasErrors(errors)) {
    return { success: false, error: errors.general === "at_least_one_item" ? t.atLeastOneItem : t.genericError };
  }

  const { data: quoteId, error } = await supabase.rpc("create_quote_with_items", {
    p_client_id: header.client_id || null,
    p_issue_date: header.issue_date,
    p_expiry_date: header.expiry_or_due_date || null,
    p_currency: header.currency || "SAR",
    p_notes: header.notes || null,
    p_terms: header.terms || null,
    p_items: itemsToRpcPayload(items),
  });

  if (error || !quoteId) {
    if (error?.message?.includes("document_quota_exceeded")) {
      return { success: false, quotaExceeded: true };
    }
    return { success: false, error: error?.message ?? t.genericError };
  }

  revalidatePath("/dashboard/quotes");
  redirect(`/dashboard/quotes/${quoteId}`); // throws internally; nothing below runs
  return { success: true }; // unreachable — satisfies the Promise<QuoteActionResult> return type
}

export async function updateQuote(
  quoteId: string,
  header: DocumentHeaderDraft,
  items: LineItemDraft[]
): Promise<QuoteActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const errors = validateDocument(header, items, t);
  if (hasErrors(errors)) {
    return { success: false, error: errors.general === "at_least_one_item" ? t.atLeastOneItem : t.genericError };
  }

  const { error } = await supabase.rpc("update_quote_with_items", {
    p_quote_id: quoteId,
    p_client_id: header.client_id || null,
    p_issue_date: header.issue_date,
    p_expiry_date: header.expiry_or_due_date || null,
    p_currency: header.currency || "SAR",
    p_notes: header.notes || null,
    p_terms: header.terms || null,
    p_items: itemsToRpcPayload(items),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/quotes");
  revalidatePath(`/dashboard/quotes/${quoteId}`);
  redirect(`/dashboard/quotes/${quoteId}`); // throws internally; nothing below runs
  return { success: true }; // unreachable — satisfies the Promise<QuoteActionResult> return type
}

export async function setQuoteStatus(
  quoteId: string,
  status: "sent" | "accepted" | "rejected" | "expired"
): Promise<QuoteActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const { error } = await supabase.rpc("set_quote_status", { p_quote_id: quoteId, p_status: status });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/quotes/${quoteId}`);
  return { success: true };
}

export async function duplicateQuote(quoteId: string): Promise<QuoteActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const { data: newId, error } = await supabase.rpc("duplicate_quote", { p_quote_id: quoteId });
  if (error || !newId) return { success: false, error: error?.message ?? t.genericError };

  revalidatePath("/dashboard/quotes");
  redirect(`/dashboard/quotes/${newId}`); // throws internally; nothing below runs
  return { success: true }; // unreachable — satisfies the Promise<QuoteActionResult> return type
}

export async function convertQuoteToInvoice(quoteId: string, dueDate: string): Promise<QuoteActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const { data: invoiceId, error } = await supabase.rpc("convert_quote_to_invoice", {
    p_quote_id: quoteId,
    p_due_date: dueDate || null,
  });
  if (error || !invoiceId) return { success: false, error: error?.message ?? t.genericError };

  revalidatePath(`/dashboard/quotes/${quoteId}`);
  redirect(`/dashboard/invoices/${invoiceId}`); // throws internally; nothing below runs
  return { success: true }; // unreachable — satisfies the Promise<QuoteActionResult> return type
}
