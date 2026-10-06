import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import { centsToDisplay } from "@/lib/money";
import InvoiceActions from "@/components/InvoiceActions";
import ShareDialog from "@/components/ShareDialog";

const STATUS_LABEL_KEY = {
  draft: "statusDraft",
  sent: "statusSent",
  paid: "statusPaid",
  overdue: "statusOverdue",
  cancelled: "statusCancelled",
} as const;

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const t = getDictionary("ar");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <div className="alert-error">{t.genericError}</div>;

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      "id, document_number, status, issue_date, due_date, currency, subtotal_cents, discount_cents, tax_cents, total_cents, notes, terms, quote_id, clients(id, name, email, phone, address)"
    )
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return <div className="alert-error">{t.genericError}</div>;
  if (!invoice) notFound();

  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("id, description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents")
    .eq("invoice_id", invoice.id)
    .order("sort_order");

  const { data: activeShareLink } = await supabase
    .from("share_tokens")
    .select("token")
    .eq("document_type", "invoice")
    .eq("document_id", invoice.id)
    .is("revoked_at", null)
    .maybeSingle();

  const client = Array.isArray((invoice as any).clients) ? (invoice as any).clients[0] : (invoice as any).clients;

  return (
    <div style={{ maxWidth: 760 }}>
      <p>
        <Link href="/dashboard/invoices">← {t.backToInvoices}</Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{invoice.document_number}</h1>
          <p style={{ color: "var(--muted)", margin: "4px 0" }}>
            {client?.name ?? t.noClientOption} · {invoice.issue_date}
            {invoice.due_date ? ` · ${t.dueDate}: ${invoice.due_date}` : ""}
          </p>
        </div>
        <span style={{ alignSelf: "start", padding: "4px 10px", background: "var(--border)", borderRadius: 20, fontSize: 13 }}>
          {t[STATUS_LABEL_KEY[invoice.status as keyof typeof STATUS_LABEL_KEY]]}
        </span>
      </div>

      <div style={{ margin: "16px 0" }}>
        <InvoiceActions invoiceId={invoice.id} status={invoice.status} />
      </div>

      {invoice.status === "draft" ? (
        <p>
          <Link href={`/dashboard/invoices/${invoice.id}/edit`}>{t.editInvoice}</Link>
        </p>
      ) : (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>{t.editInvoiceLockedNotice}</p>
      )}

      {invoice.quote_id && (
        <p className="alert-success">
          {t.convertedFromQuote} —{" "}
          <Link href={`/dashboard/quotes/${invoice.quote_id}`} style={{ color: "inherit", fontWeight: 600 }}>
            {t.viewQuote}
          </Link>
        </p>
      )}

      {itemsError && <div className="alert-error">{t.genericError}</div>}

      {items && (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr style={{ textAlign: "start", fontSize: 13, color: "var(--muted)" }}>
                <th style={{ padding: 6 }}>{t.itemDescription}</th>
                <th style={{ padding: 6 }}>{t.itemQuantity}</th>
                <th style={{ padding: 6 }}>{t.itemUnitPrice}</th>
                <th style={{ padding: 6 }}>{t.itemLineTotal}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: 8 }}>{item.description}</td>
                  <td style={{ padding: 8 }}>{item.quantity}</td>
                  <td style={{ padding: 8 }}>{centsToDisplay(item.unit_price_cents)}</td>
                  <td style={{ padding: 8 }}>{centsToDisplay(item.line_total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, marginInlineStart: "auto", maxWidth: 260 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>{t.subtotal}</span>
          <span>{centsToDisplay(invoice.subtotal_cents)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>{t.totalDiscount}</span>
          <span>{centsToDisplay(invoice.discount_cents)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>{t.totalTax}</span>
          <span>{centsToDisplay(invoice.tax_cents)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6 }}>
          <span>{t.grandTotal}</span>
          <span>
            {centsToDisplay(invoice.total_cents)} {invoice.currency}
          </span>
        </div>
      </div>

      {invoice.notes && (
        <p>
          <strong>{t.notes}:</strong> {invoice.notes}
        </p>
      )}
      {invoice.terms && (
        <p>
          <strong>{t.terms}:</strong> {invoice.terms}
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        <ShareDialog documentType="invoice" documentId={invoice.id} documentNumber={invoice.document_number} existingToken={activeShareLink?.token ?? null} />
      </div>

      {/*
        This page's data (business info via a future business_profiles join,
        client info, line items, totals, notes, terms, document number) is
        exactly the shape the Phase 10 PDF renderer will consume — no
        restructuring will be needed when PDF export is built, only a new
        rendering target for the same query.
      */}
    </div>
  );
}
