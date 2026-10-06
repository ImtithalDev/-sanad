import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import { centsToDisplay } from "@/lib/money";

const STATUS_LABEL_KEY = {
  draft: "statusDraft",
  sent: "statusSent",
  accepted: "statusAccepted",
  rejected: "statusRejected",
  expired: "statusExpired",
} as const;

export default async function QuotesPage() {
  const t = getDictionary("ar");
  const supabase = createClient();

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, document_number, status, issue_date, total_cents, currency, clients(name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{t.quotes}</h1>
        <Link href="/dashboard/quotes/new" className="btn-primary" style={{ width: "auto", padding: "10px 18px", textDecoration: "none", display: "inline-block" }}>
          {t.newQuote}
        </Link>
      </div>

      {error && <div className="alert-error">{t.genericError}</div>}

      {!error && quotes && quotes.length === 0 && (
        <div className="empty-state">
          <p>{t.quotesEmpty}</p>
          <Link href="/dashboard/quotes/new" className="btn-primary" style={{ maxWidth: 220, margin: "12px auto 0", display: "block", textDecoration: "none", textAlign: "center" }}>
            {t.addFirstQuote}
          </Link>
        </div>
      )}

      {!error && quotes && quotes.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {quotes.map((q: any) => (
            <Link
              key={q.id}
              href={`/dashboard/quotes/${q.id}`}
              style={{ display: "block", padding: "14px 16px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, textDecoration: "none", color: "var(--text)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{q.document_number}</strong>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{t[STATUS_LABEL_KEY[q.status as keyof typeof STATUS_LABEL_KEY]]}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {q.clients?.name ?? t.noClientOption} · {q.issue_date} · {centsToDisplay(q.total_cents)} {q.currency}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
