import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import { centsToDisplay } from "@/lib/money";
import QuoteActions from "@/components/QuoteActions";
import ShareDialog from "@/components/ShareDialog";

const STATUS_LABEL_KEY = {
  draft: "statusDraft",
  sent: "statusSent",
  accepted: "statusAccepted",
  rejected: "statusRejected",
  expired: "statusExpired",
} as const;

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const t = getDictionary("ar");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <div className="alert-error">{t.genericError}</div>;

  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, document_number, status, issue_date, expiry_date, currency, subtotal_cents, discount_cents, tax_cents, total_cents, notes, terms, converted_to_invoice_id, clients(id, name, email, phone)")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return <div className="alert-error">{t.genericError}</div>;
  if (!quote) notFound();

  const { data: items, error: itemsError } = await supabase
    .from("quote_items")
    .select("id, description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents")
    .eq("quote_id", quote.id)
    .order("sort_order");

  const { data: activeShareLink } = await supabase
    .from("share_tokens")
    .select("token")
    .eq("document_type", "quote")
    .eq("document_id", quote.id)
    .is("revoked_at", null)
    .maybeSingle();

  const client = Array.isArray((quote as any).clients) ? (quote as any).clients[0] : (quote as any).clients;

  return (
    <div style={{ maxWidth: 760 }}>
      <p>
        <Link href="/dashboard/quotes">← {t.backToQuotes}</Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{quote.document_number}</h1>
          <p style={{ color: "var(--muted)", margin: "4px 0" }}>
            {client?.name ?? t.noClientOption} · {quote.issue_date}
          </p>
        </div>
        <span style={{ alignSelf: "start", padding: "4px 10px", background: "var(--border)", borderRadius: 20, fontSize: 13 }}>
          {t[STATUS_LABEL_KEY[quote.status as keyof typeof STATUS_LABEL_KEY]]}
        </span>
      </div>

      <div style={{ margin: "16px 0" }}>
        <QuoteActions quoteId={quote.id} status={quote.status} convertedToInvoiceId={quote.converted_to_invoice_id} />
      </div>

      {quote.status === "draft" ? (
        <p>
          <Link href={`/dashboard/quotes/${quote.id}/edit`}>{t.editQuote}</Link>
        </p>
      ) : (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>{t.editLockedNotice}</p>
      )}

      {quote.converted_to_invoice_id && <div className="alert-success">{t.alreadyConverted}</div>}

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
          <span>{centsToDisplay(quote.subtotal_cents)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>{t.totalDiscount}</span>
          <span>{centsToDisplay(quote.discount_cents)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>{t.totalTax}</span>
          <span>{centsToDisplay(quote.tax_cents)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6 }}>
          <span>{t.grandTotal}</span>
          <span>
            {centsToDisplay(quote.total_cents)} {quote.currency}
          </span>
        </div>
      </div>

      {quote.notes && (
        <p>
          <strong>{t.notes}:</strong> {quote.notes}
        </p>
      )}
      {quote.terms && (
        <p>
          <strong>{t.terms}:</strong> {quote.terms}
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        <ShareDialog documentType="quote" documentId={quote.id} documentNumber={quote.document_number} existingToken={activeShareLink?.token ?? null} />
      </div>
    </div>
  );
}
