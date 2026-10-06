"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import type { LineItemDraft, DocumentHeaderDraft } from "@/lib/validation/document";
import { validateDocument, hasErrors } from "@/lib/validation/document";

export type InvoiceActionResult = { success: boolean; error?: string; quotaExceeded?: boolean };

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

export async function createInvoice(header: DocumentHeaderDraft, items: LineItemDraft[]): Promise<InvoiceActionResult> {
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

  const { data: invoiceId, error } = await supabase.rpc("create_invoice_with_items", {
    p_client_id: header.client_id || null,
    p_issue_date: header.issue_date,
    p_due_date: header.expiry_or_due_date || null,
    p_currency: header.currency || "SAR",
    p_notes: header.notes || null,
    p_terms: header.terms || null,
    p_items: itemsToRpcPayload(items),
  });

  if (error || !invoiceId) {
    if (error?.message?.includes("document_quota_exceeded")) {
      return { success: false, quotaExceeded: true };
    }
    return { success: false, error: error?.message ?? t.genericError };
  }

  revalidatePath("/dashboard/invoices");
  redirect(`/dashboard/invoices/${invoiceId}`); // throws internally; nothing below runs
  return { success: true }; // unreachable — satisfies the Promise<InvoiceActionResult> return type
}

export async function updateInvoice(
  invoiceId: string,
  header: DocumentHeaderDraft,
  items: LineItemDraft[]
): Promise<InvoiceActionResult> {
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

  const { error } = await supabase.rpc("update_invoice_with_items", {
    p_invoice_id: invoiceId,
    p_client_id: header.client_id || null,
    p_issue_date: header.issue_date,
    p_due_date: header.expiry_or_due_date || null,
    p_currency: header.currency || "SAR",
    p_notes: header.notes || null,
    p_terms: header.terms || null,
    p_items: itemsToRpcPayload(items),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  redirect(`/dashboard/invoices/${invoiceId}`); // throws internally; nothing below runs
  return { success: true }; // unreachable — satisfies the Promise<InvoiceActionResult> return type
}

export async function setInvoiceStatus(
  invoiceId: string,
  status: "sent" | "paid" | "overdue" | "cancelled"
): Promise<InvoiceActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const { error } = await supabase.rpc("set_invoice_status", { p_invoice_id: invoiceId, p_status: status });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { success: true };
}

export async function duplicateInvoice(invoiceId: string): Promise<InvoiceActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const { data: newId, error } = await supabase.rpc("duplicate_invoice", { p_invoice_id: invoiceId });
  if (error || !newId) return { success: false, error: error?.message ?? t.genericError };

  revalidatePath("/dashboard/invoices");
  redirect(`/dashboard/invoices/${newId}`); // throws internally; nothing below runs
  return { success: true }; // unreachable — satisfies the Promise<InvoiceActionResult> return type
}

export async function deleteDraftInvoice(invoiceId: string): Promise<InvoiceActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const { error } = await supabase.rpc("delete_draft_invoice", { p_invoice_id: invoiceId });
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/invoices");
  return { success: true };
}
