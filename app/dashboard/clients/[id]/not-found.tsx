import Link from "next/link";
import { getDictionary } from "@/lib/i18n";

export default function NotFound() {
  const t = getDictionary("ar");
  return (
    <div className="empty-state">
      <p>{t.clientNotFound}</p>
      <Link href="/dashboard/clients">{t.backToClients}</Link>
    </div>
  );
}
