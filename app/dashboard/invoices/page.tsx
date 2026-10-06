import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import { centsToDisplay } from "@/lib/money";
import ClientSearchBar from "@/components/ClientSearchBar";

const STATUS_LABEL_KEY = {
  draft: "statusDraft",
  sent: "statusSent",
  paid: "statusPaid",
  overdue: "statusOverdue",
  cancelled: "statusCancelled",
} as const;

export default async function InvoicesPage({ searchParams }: { searchParams: { q?: string } }) {
  const t = getDictionary("ar");
  const supabase = createClient();
  const q = searchParams.q?.trim();

  const { data: allInvoices, error } = await supabase
    .from("invoices")
    .select("id, document_number, status, issue_date, total_cents, currency, clients(name)")
    .order("created_at", { ascending: false });

  // Filtered in JS rather than in the query: PostgREST can't filter on a
  // joined table's column (client name) in the same .or() as a local column
  // (document_number) in one request. Per-user invoice volume in this product
  // is small enough that fetching the page's rows and filtering here is fine;
  // this is revisited if/when a user's invoice count grows large.
  const invoices = q
    ? (allInvoices ?? []).filter((inv: any) => {
        const haystack = `${inv.document_number} ${inv.clients?.name ?? ""}`.toLowerCase();
        return haystack.includes(q.toLowerCase());
      })
    : allInvoices;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{t.invoices}</h1>
        <Link href="/dashboard/invoices/new" className="btn-primary" style={{ width: "auto", padding: "10px 18px", textDecoration: "none", display: "inline-block" }}>
          {t.newInvoice}
        </Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <ClientSearchBar placeholder={t.searchDocsPlaceholder} />
      </div>

      {error && <div className="alert-error">{t.genericError}</div>}

      {!error && invoices && invoices.length === 0 && !q && (
        <div className="empty-state">
          <p>{t.invoicesEmpty}</p>
          <Link href="/dashboard/invoices/new" className="btn-primary" style={{ maxWidth: 220, margin: "12px auto 0", display: "block", textDecoration: "none", textAlign: "center" }}>
            {t.addFirstInvoice}
          </Link>
        </div>
      )}

      {!error && invoices && invoices.length === 0 && q && (
        <div className="empty-state">
          <p>{t.noResultsForSearchDocs}</p>
        </div>
      )}

      {!error && invoices && invoices.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {invoices.map((inv: any) => (
            <Link
              key={inv.id}
              href={`/dashboard/invoices/${inv.id}`}
              style={{ display: "block", padding: "14px 16px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, textDecoration: "none", color: "var(--text)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{inv.document_number}</strong>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{t[STATUS_LABEL_KEY[inv.status as keyof typeof STATUS_LABEL_KEY]]}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {inv.clients?.name ?? t.noClientOption} · {inv.issue_date} · {centsToDisplay(inv.total_cents)} {inv.currency}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
