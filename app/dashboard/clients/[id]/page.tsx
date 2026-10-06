import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import DeleteClientButton from "@/components/DeleteClientButton";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const t = getDictionary("ar");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="alert-error">{t.genericError}</div>;
  }

  // RLS already guarantees this row can't belong to another user, but we still
  // scope explicitly — a query with no matching row (wrong id, or someone
  // else's client) returns null either way, so we can't leak existence.
  const { data: clientRecord, error: clientError } = await supabase
    .from("clients")
    .select("id, name, email, phone, company, address, notes")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (clientError) {
    return <div className="alert-error">{t.genericError}</div>;
  }
  if (!clientRecord) {
    notFound();
  }

  // Real queries against Phase 1's schema. These tables exist now; the UI to
  // *create* quotes/invoices lands in Phase 4/5, so today this list will
  // genuinely be empty for every client — that's a correct empty state, not a
  // placeholder standing in for missing data.
  const [{ data: quotes, error: quotesError }, { data: invoices, error: invoicesError }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, document_number, status, issue_date, total_cents, currency")
      .eq("client_id", clientRecord.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, document_number, status, issue_date, total_cents, currency")
      .eq("client_id", clientRecord.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const documents = [
    ...(quotes ?? []).map((q) => ({ ...q, kind: "quote" as const })),
    ...(invoices ?? []).map((i) => ({ ...i, kind: "invoice" as const })),
  ].sort((a, b) => (a.issue_date < b.issue_date ? 1 : -1));

  return (
    <div style={{ maxWidth: 640 }}>
      <p>
        <Link href="/dashboard/clients">← {t.backToClients}</Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{clientRecord.name}</h1>
          <p style={{ color: "var(--muted)", margin: "4px 0" }}>
            {[clientRecord.company, clientRecord.email, clientRecord.phone].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/dashboard/clients/${clientRecord.id}/edit`} className="btn-secondary" style={{ width: "auto", padding: "8px 16px", textDecoration: "none" }}>
            {t.editClient}
          </Link>
          <DeleteClientButton clientId={clientRecord.id} />
        </div>
      </div>

      {clientRecord.address && (
        <p>
          <strong>{t.address}:</strong> {clientRecord.address}
        </p>
      )}
      {clientRecord.notes && (
        <p>
          <strong>{t.notes}:</strong> {clientRecord.notes}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, margin: "20px 0" }}>
        <Link
          href={`/dashboard/quotes/new?clientId=${clientRecord.id}`}
          className="btn-primary"
          style={{ width: "auto", padding: "10px 16px", textDecoration: "none", display: "inline-block" }}
        >
          {t.createQuote}
        </Link>
        <Link
          href={`/dashboard/invoices/new?clientId=${clientRecord.id}`}
          className="btn-secondary"
          style={{ width: "auto", padding: "10px 16px", textDecoration: "none", display: "inline-block" }}
        >
          {t.createInvoice}
        </Link>
      </div>

      <h2>{t.documentHistory}</h2>

      {(quotesError || invoicesError) && <div className="alert-error">{t.genericError}</div>}

      {!quotesError && !invoicesError && documents.length === 0 && (
        <div className="empty-state">
          <p>{t.noDocumentsYet}</p>
        </div>
      )}

      {documents.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {documents.map((doc) => (
            <div key={`${doc.kind}-${doc.id}`} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{doc.document_number}</span>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>{doc.status}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {doc.issue_date} · {(doc.total_cents / 100).toFixed(2)} {doc.currency}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
