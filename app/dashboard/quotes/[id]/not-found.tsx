import Link from "next/link";
import { getDictionary } from "@/lib/i18n";

export default function NotFound() {
  const t = getDictionary("ar");
  return (
    <div className="empty-state">
      <p>{t.quoteNotFound}</p>
      <Link href="/dashboard/quotes">{t.backToQuotes}</Link>
    </div>
  );
}
