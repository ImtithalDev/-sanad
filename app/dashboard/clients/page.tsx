import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import ClientSearchBar from "@/components/ClientSearchBar";

export default async function ClientsPage({ searchParams }: { searchParams: { q?: string } }) {
  const t = getDictionary("ar");
  const supabase = createClient();
  const q = searchParams.q?.trim();

  // No explicit .eq("user_id", ...) needed to be *safe* — RLS enforces that on
  // every query regardless — but Postgres still needs the predicate for the
  // search itself, so we filter on the searchable columns only.
  let query = supabase
    .from("clients")
    .select("id, name, email, phone, company")
    .order("name", { ascending: true });

  if (q) {
    const escaped = q.replace(/[%_]/g, "\\$&");
    query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%,company.ilike.%${escaped}%`);
  }

  const { data: clients, error } = await query;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{t.clients}</h1>
        <Link href="/dashboard/clients/new" className="btn-primary" style={{ width: "auto", padding: "10px 18px", textDecoration: "none", display: "inline-block" }}>
          {t.newClient}
        </Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <ClientSearchBar placeholder={t.searchPlaceholder} />
      </div>

      {error && <div className="alert-error">{t.genericError}</div>}

      {!error && clients && clients.length === 0 && !q && (
        <div className="empty-state">
          <p>{t.noClientsYet}</p>
          <Link href="/dashboard/clients/new" className="btn-primary" style={{ maxWidth: 220, margin: "12px auto 0", display: "block", textDecoration: "none", textAlign: "center" }}>
            {t.addFirstClient}
          </Link>
        </div>
      )}

      {!error && clients && clients.length === 0 && q && (
        <div className="empty-state">
          <p>{t.noResultsForSearch}</p>
        </div>
      )}

      {!error && clients && clients.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/clients/${c.id}`}
              style={{
                display: "block",
                padding: "14px 16px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                textDecoration: "none",
                color: "var(--text)",
              }}
            >
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {[c.company, c.email, c.phone].filter(Boolean).join(" · ")}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
