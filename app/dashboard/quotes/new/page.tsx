import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import QuoteForm from "@/components/QuoteForm";
import { createQuote } from "@/app/dashboard/quotes/actions";

export default async function NewQuotePage({ searchParams }: { searchParams: { clientId?: string } }) {
  const t = getDictionary("ar");
  const supabase = createClient();

  const { data: clients, error } = await supabase.from("clients").select("id, name").order("name");

  if (error) {
    return <div className="alert-error">{t.genericError}</div>;
  }

  if (!clients || clients.length === 0) {
    return (
      <div className="empty-state">
        <p>{t.needClientFirst}</p>
        <Link href="/dashboard/clients/new" className="btn-primary" style={{ maxWidth: 220, margin: "12px auto 0", display: "block", textDecoration: "none", textAlign: "center" }}>
          {t.newClient}
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1>{t.newQuote}</h1>
      <QuoteForm
        clients={clients}
        initialHeader={{ client_id: searchParams.clientId ?? "" }}
        onSubmit={createQuote}
        submitLabel={t.saveDraft}
        expiryLabel={t.expiryDate}
      />
    </div>
  );
}
