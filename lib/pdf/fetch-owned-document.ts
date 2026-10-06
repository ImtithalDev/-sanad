import { createClient } from "@/lib/supabase/server";
import type { DocumentTemplateData } from "./types";

// This is the owner-authenticated path: it relies on RLS (every query is
// scoped to the logged-in user via the session-bound Supabase client) plus
// an explicit .eq("user_id", ...) as defense in depth, same pattern as every
// other read in this codebase. The public path (share links) is a completely
// separate function — see lib/pdf/fetch-public-document.ts — precisely so
// this one is never accidentally reachable without a session.
export async function fetchOwnedQuoteForDocument(quoteId: string, locale: "ar" | "en"): Promise<DocumentTemplateData | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: quote } = await supabase
    .from("quotes")
    .select("document_number, status, issue_date, expiry_date, currency, subtotal_cents, discount_cents, tax_cents, total_cents, notes, terms, clients(name, email, phone, address)")
    .eq("id", quoteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!quote) return null;

  const { data: items } = await supabase
    .from("quote_items")
    .select("description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents")
    .eq("quote_id", quoteId)
    .order("sort_order");

  const { data: business } = await supabase
    .from("business_profiles")
    .select("business_name, email, phone, address, tax_number, logo_url")
    .eq("user_id", user.id)
    .maybeSingle();

  const client = Array.isArray((quote as any).clients) ? (quote as any).clients[0] : (quote as any).clients;

  return {
    kind: "quote",
    locale,
    document_number: quote.document_number,
    status: quote.status,
    issue_date: quote.issue_date,
    due_or_expiry_date: quote.expiry_date,
    currency: quote.currency,
    subtotal_cents: quote.subtotal_cents,
    discount_cents: quote.discount_cents,
    tax_cents: quote.tax_cents,
    total_cents: quote.total_cents,
    notes: quote.notes,
    terms: quote.terms,
    client: client ? { name: client.name, email: client.email, phone: client.phone, address: client.address } : null,
    business: business
      ? { name: business.business_name, email: business.email, phone: business.phone, address: business.address, tax_number: business.tax_number, logo_url: business.logo_url }
      : null,
    items: items ?? [],
  };
}

export async function fetchOwnedInvoiceForDocument(invoiceId: string, locale: "ar" | "en"): Promise<DocumentTemplateData | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: invoice } = await supabase
    .from("invoices")
    .select("document_number, status, issue_date, due_date, currency, subtotal_cents, discount_cents, tax_cents, total_cents, notes, terms, clients(name, email, phone, address)")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!invoice) return null;

  const { data: items } = await supabase
    .from("invoice_items")
    .select("description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents")
    .eq("invoice_id", invoiceId)
    .order("sort_order");

  const { data: business } = await supabase
    .from("business_profiles")
    .select("business_name, email, phone, address, tax_number, logo_url")
    .eq("user_id", user.id)
    .maybeSingle();

  const client = Array.isArray((invoice as any).clients) ? (invoice as any).clients[0] : (invoice as any).clients;

  return {
    kind: "invoice",
    locale,
    document_number: invoice.document_number,
    status: invoice.status,
    issue_date: invoice.issue_date,
    due_or_expiry_date: invoice.due_date,
    currency: invoice.currency,
    subtotal_cents: invoice.subtotal_cents,
    discount_cents: invoice.discount_cents,
    tax_cents: invoice.tax_cents,
    total_cents: invoice.total_cents,
    notes: invoice.notes,
    terms: invoice.terms,
    client: client ? { name: client.name, email: client.email, phone: client.phone, address: client.address } : null,
    business: business
      ? { name: business.business_name, email: business.email, phone: business.phone, address: business.address, tax_number: business.tax_number, logo_url: business.logo_url }
      : null,
    items: items ?? [],
  };
}
