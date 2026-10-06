export type DocumentLineItem = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  tax_rate: number;
  line_total_cents: number;
};

export type DocumentTemplateData = {
  kind: "quote" | "invoice";
  locale: "ar" | "en";
  document_number: string;
  status: string;
  issue_date: string;
  due_or_expiry_date: string | null; // due_date for invoices, expiry_date for quotes
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  terms: string | null;
  client: { name: string; email: string | null; phone: string | null; address: string | null } | null;
  // Nullable as a whole: a brand-new user may not have completed the business
  // profile / onboarding (Phase 19) yet. The template renders a real empty
  // state for this section rather than fabricating a business name.
  business: {
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    tax_number: string | null;
    logo_url: string | null;
  } | null;
  items: DocumentLineItem[];
};
