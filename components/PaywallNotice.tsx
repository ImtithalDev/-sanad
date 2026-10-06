import Link from "next/link";
import { getDictionary } from "@/lib/i18n";

export default function PaywallNotice({ kind }: { kind: "document" | "client" }) {
  const t = getDictionary("ar");
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, background: "var(--card)", textAlign: "center" }}>
      <h3 style={{ marginTop: 0 }}>{t.quotaReachedTitle}</h3>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>{kind === "document" ? t.quotaReachedDocDesc : t.quotaReachedClientDesc}</p>
      <Link href="/dashboard/billing" className="btn-primary" style={{ maxWidth: 220, margin: "8px auto 0", display: "block", textDecoration: "none", textAlign: "center" }}>
        {t.quotaReachedCTA}
      </Link>
    </div>
  );
}
