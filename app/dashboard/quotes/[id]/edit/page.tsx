import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import QuoteForm from "@/components/QuoteForm";
import { updateQuote } from "@/app/dashboard/quotes/actions";

export default async function EditQuotePage({ params }: { params: { id: string } }) {
  const t = getDictionary("ar");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <div className="alert-error">{t.genericError}</div>;

  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, client_id, status, issue_date, expiry_date, currency, notes, terms")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return <div className="alert-error">{t.genericError}</div>;
  if (!quote) notFound();

  // Enforced again here in the UI (the RPC also refuses server-side) so the
  // person gets an explanation instead of a raw error after submitting.
  if (quote.status !== "draft") {
    return (
      <div className="empty-state">
        <p>{t.editLockedNotice}</p>
        <Link href={`/dashboard/quotes/${quote.id}`}>{t.backToQuotes}</Link>
      </div>
    );
  }

  const [{ data: clients, error: clientsError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase
      .from("quote_items")
      .select("description, quantity, unit_price_cents, discount_cents, tax_rate, product_id")
      .eq("quote_id", quote.id)
      .order("sort_order"),
  ]);

  if (clientsError || itemsError) return <div className="alert-error">{t.genericError}</div>;

  const boundUpdate = updateQuote.bind(null, quote.id);

  return (
    <div style={{ maxWidth: 760 }}>
      <h1>{t.editQuote}</h1>
      <QuoteForm
        clients={clients ?? []}
        initialHeader={{
          client_id: quote.client_id ?? "",
          issue_date: quote.issue_date,
          expiry_or_due_date: quote.expiry_date ?? "",
          currency: quote.currency,
          notes: quote.notes ?? "",
          terms: quote.terms ?? "",
        }}
        initialItems={(items ?? []).map((i) => ({
          description: i.description,
          quantity: String(i.quantity),
          unit_price: (i.unit_price_cents / 100).toString(),
          discount: (i.discount_cents / 100).toString(),
          tax_rate: String(i.tax_rate),
          product_id: i.product_id ?? undefined,
        }))}
        onSubmit={boundUpdate}
        submitLabel={t.save}
        expiryLabel={t.expiryDate}
      />
    </div>
  );
}
