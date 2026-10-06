import Link from "next/link";
import { getDictionary } from "@/lib/i18n";

export default function NotFound() {
  const t = getDictionary("ar");
  return (
    <div className="empty-state">
      <p>{t.invoiceNotFound}</p>
      <Link href="/dashboard/invoices">{t.backToInvoices}</Link>
    </div>
  );
}
