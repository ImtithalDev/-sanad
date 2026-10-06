import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import { centsToDisplay } from "@/lib/money";
import OnboardingChecklist from "@/components/OnboardingChecklist";

export default async function DashboardPage() {
  const t = getDictionary("ar");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="alert-error">{t.genericError}</div>;
  }

  const { data: businessProfile, error: bpError } = await supabase
    .from("business_profiles")
    .select("business_name, currency")
    .eq("user_id", user.id)
    .maybeSingle();

  if (bpError) {
    return <div className="alert-error">{t.genericError}</div>;
  }

  // Every number below is a real, RLS-scoped aggregate for this user —
  // there is no fabricated "sample" dashboard data at any point, new
  // account or not. A brand-new account simply shows zeros / the onboarding
  // checklist below, which is the correct empty state.
  const [
    { data: paidInvoices },
    { count: outstandingCount },
    { count: overdueCount },
    { count: quotesCount },
    { data: recentClients },
    { data: recentQuotes },
    { count: clientsCount },
    { count: sentDocsCount },
    { count: shareLinksCount },
    { data: usageRow },
  ] = await Promise.all([
    supabase.from("invoices").select("total_cents, currency").eq("status", "paid"),
    supabase.from("invoices").select("id", { count: "exact", head: true }).in("status", ["sent", "overdue"]),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "overdue"),
    supabase.from("quotes").select("id", { count: "exact", head: true }),
    supabase.from("clients").select("id, name, company").order("created_at", { ascending: false }).limit(5),
    supabase.from("quotes").select("id, document_number, status, total_cents, currency").order("created_at", { ascending: false }).limit(5),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("invoices").select("id", { count: "exact", head: true }).neq("status", "draft"),
    supabase.from("share_tokens").select("id", { count: "exact", head: true }),
    supabase.from("usage").select("ai_requests_used").eq("user_id", user.id).gte("period_start", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)).maybeSingle(),
  ]);

  const totalRevenueCents = (paidInvoices ?? []).reduce((sum, inv) => sum + inv.total_cents, 0);
  const currency = businessProfile?.currency ?? "SAR";

  const isNewAccount = !businessProfile && (clientsCount ?? 0) === 0;

  return (
    <div>
      <h1>{t.dashboardWelcome}</h1>

      {!isNewAccount && (
        <OnboardingChecklist
          steps={{
            hasClient: (clientsCount ?? 0) > 0,
            hasQuote: (quotesCount ?? 0) > 0,
            hasSentDocument: (sentDocsCount ?? 0) > 0,
            usedAI: (usageRow?.ai_requests_used ?? 0) > 0,
            hasShareLink: (shareLinksCount ?? 0) > 0,
          }}
        />
      )}

      {isNewAccount ? (
        <div className="empty-state">
          <p>{t.emptyStateQuote}</p>
          <Link href="/dashboard/clients/new" className="btn-primary" style={{ maxWidth: 220, margin: "12px auto 0", display: "block", textDecoration: "none", textAlign: "center" }}>
            {t.newClient}
          </Link>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginBottom: 20 }}>
            {[
              { label: t.grandTotal, value: `${centsToDisplay(totalRevenueCents)} ${currency}` },
              { label: t.statusSent, value: String(outstandingCount ?? 0) },
              { label: t.statusOverdue, value: String(overdueCount ?? 0) },
              { label: t.quotes, value: String(quotesCount ?? 0) },
            ].map((stat) => (
              <div key={stat.label} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, background: "var(--card)" }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{stat.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
            <Link href="/dashboard/clients/new" className="btn-primary" style={{ width: "auto", padding: "10px 16px", textDecoration: "none" }}>
              + {t.newClient}
            </Link>
            <Link href="/dashboard/quotes/new" className="btn-secondary" style={{ width: "auto", padding: "10px 16px", textDecoration: "none" }}>
              + {t.newQuote}
            </Link>
            <Link href="/dashboard/invoices/new" className="btn-secondary" style={{ width: "auto", padding: "10px 16px", textDecoration: "none" }}>
              + {t.newInvoice}
            </Link>
          </div>

          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <div>
              <h3>{t.clients}</h3>
              {(recentClients ?? []).length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: 14 }}>{t.noClientsYet}</p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {(recentClients ?? []).map((c) => (
                    <Link key={c.id} href={`/dashboard/clients/${c.id}`} style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", color: "var(--text)", fontSize: 14 }}>
                      {c.name} {c.company ? `· ${c.company}` : ""}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3>{t.quotes}</h3>
              {(recentQuotes ?? []).length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: 14 }}>{t.quotesEmpty}</p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {(recentQuotes ?? []).map((q) => (
                    <Link key={q.id} href={`/dashboard/quotes/${q.id}`} style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", color: "var(--text)", fontSize: 14, display: "flex", justifyContent: "space-between" }}>
                      <span>{q.document_number}</span>
                      <span style={{ color: "var(--muted)" }}>{centsToDisplay(q.total_cents)} {q.currency}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
