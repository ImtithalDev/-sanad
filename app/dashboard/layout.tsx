import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import LogoutButton from "@/components/LogoutButton";

// Note: this layout does NOT re-check auth — middleware.ts already redirects
// unauthenticated requests to /login before this ever renders. That keeps
// the protection in one place instead of duplicated per page.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = getDictionary("ar");

  return (
    <div>
      <header className="dashboard-header">
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <strong>{t.appName}</strong>
          <nav className="dashboard-nav">
            <Link href="/dashboard" style={{ color: "var(--text)", textDecoration: "none", fontSize: 14 }}>
              {t.dashboardNav}
            </Link>
            <Link href="/dashboard/clients" style={{ color: "var(--text)", textDecoration: "none", fontSize: 14 }}>
              {t.clients}
            </Link>
            <Link href="/dashboard/quotes" style={{ color: "var(--text)", textDecoration: "none", fontSize: 14 }}>
              {t.quotes}
            </Link>
            <Link href="/dashboard/invoices" style={{ color: "var(--text)", textDecoration: "none", fontSize: 14 }}>
              {t.invoices}
            </Link>
            <Link href="/dashboard/billing" style={{ color: "var(--text)", textDecoration: "none", fontSize: 14 }}>
              {t.billing}
            </Link>
          </nav>
        </div>
        <LogoutButton label={t.logout} />
      </header>
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
