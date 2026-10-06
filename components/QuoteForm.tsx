"use client";

import { useMemo, useState, useTransition } from "react";
import { getDictionary } from "@/lib/i18n";
import { calcQuoteTotals, centsToDisplay } from "@/lib/money";
import { validateDocument, hasErrors, type LineItemDraft, type DocumentHeaderDraft, type DocumentErrors } from "@/lib/validation/document";
import type { QuoteActionResult } from "@/app/dashboard/quotes/actions";
import AIQuoteAssistant from "@/components/AIQuoteAssistant";
import AIImproveDescriptionButton from "@/components/AIImproveDescriptionButton";
import AITermsSuggestButton from "@/components/AITermsSuggestButton";
import PaywallNotice from "@/components/PaywallNotice";

type ClientOption = { id: string; name: string };

type Props = {
  clients: ClientOption[];
  initialHeader?: Partial<DocumentHeaderDraft>;
  initialItems?: LineItemDraft[];
  onSubmit: (header: DocumentHeaderDraft, items: LineItemDraft[]) => Promise<QuoteActionResult>;
  submitLabel: string;
  expiryLabel: string; // "Expiry date" for quotes, "Due date" for invoices — same shape, different label
};

const emptyItem = (): LineItemDraft => ({
  description: "",
  quantity: "1",
  unit_price: "",
  discount: "0",
  tax_rate: "15",
});

export default function QuoteForm({ clients, initialHeader, initialItems, onSubmit, submitLabel, expiryLabel }: Props) {
  const t = getDictionary("ar");
  const [isPending, startTransition] = useTransition();

  const [header, setHeader] = useState<DocumentHeaderDraft>({
    client_id: initialHeader?.client_id ?? "",
    issue_date: initialHeader?.issue_date ?? new Date().toISOString().slice(0, 10),
    expiry_or_due_date: initialHeader?.expiry_or_due_date ?? "",
    currency: initialHeader?.currency ?? "SAR",
    notes: initialHeader?.notes ?? "",
    terms: initialHeader?.terms ?? "",
  });
  const [items, setItems] = useState<LineItemDraft[]>(initialItems && initialItems.length > 0 ? initialItems : [emptyItem()]);
  const [errors, setErrors] = useState<DocumentErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const totals = useMemo(() => {
    const parsed = items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity) || 0,
      unit_price_cents: Math.round((Number(i.unit_price) || 0) * 100),
      discount_cents: Math.round((Number(i.discount) || 0) * 100),
      tax_rate: Number(i.tax_rate) || 0,
    }));
    return calcQuoteTotals(parsed);
  }, [items]);

  function updateItem(idx: number, field: keyof LineItemDraft, value: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(idx: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  // Merges an AI-generated draft into the form: if the form is still just the
  // untouched single empty row, the draft replaces it; otherwise the draft
  // items are appended. Either way this only updates component state — the
  // user still has to review/edit and press the form's own Save/submit
  // button, same as any other change to the form.
  function handleApplyAIDraft(draftItems: LineItemDraft[], notes: string | null, terms: string | null) {
    setItems((prev) => {
      const isUntouched = prev.length === 1 && !prev[0].description && !prev[0].unit_price;
      return isUntouched ? draftItems : [...prev, ...draftItems];
    });
    if (notes) setHeader((h) => ({ ...h, notes: h.notes ? `${h.notes}\n${notes}` : notes }));
    if (terms) setHeader((h) => ({ ...h, terms: h.terms ? `${h.terms}\n${terms}` : terms }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    const validation = validateDocument(header, items, t);
    setErrors(validation);
    if (hasErrors(validation)) {
      if (validation.general === "at_least_one_item") setServerError(t.atLeastOneItem);
      return;
    }

    startTransition(async () => {
      const result = await onSubmit(header, items);
      if (result && !result.success) {
        if (result.quotaExceeded) {
          setQuotaExceeded(true);
          return;
        }
        if (result.error) {
          setServerError(result.error);
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {quotaExceeded && (
        <div style={{ marginBottom: 16 }}>
          <PaywallNotice kind="document" />
        </div>
      )}
      {serverError && <div className="alert-error">{serverError}</div>}

      <AIQuoteAssistant onApply={handleApplyAIDraft} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label htmlFor="client_id">{t.selectClient}</label>
          <select
            id="client_id"
            value={header.client_id}
            onChange={(e) => setHeader((h) => ({ ...h, client_id: e.target.value }))}
            style={{ width: "100%", padding: "11px 12px", border: "1px solid var(--border)", borderRadius: 8 }}
          >
            <option value="">{t.noClientOption}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="currency">{t.currency}</label>
          <input id="currency" value={header.currency} onChange={(e) => setHeader((h) => ({ ...h, currency: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="issue_date">{t.issueDate}</label>
          <input
            id="issue_date"
            type="date"
            value={header.issue_date}
            onChange={(e) => setHeader((h) => ({ ...h, issue_date: e.target.value }))}
          />
          {errors.header?.issue_date && <div className="alert-error">{errors.header.issue_date}</div>}
        </div>
        <div className="field">
          <label htmlFor="expiry_or_due_date">{expiryLabel}</label>
          <input
            id="expiry_or_due_date"
            type="date"
            value={header.expiry_or_due_date}
            onChange={(e) => setHeader((h) => ({ ...h, expiry_or_due_date: e.target.value }))}
          />
        </div>
      </div>

      <h3>{t.itemDescription}</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr style={{ textAlign: "start", fontSize: 13, color: "var(--muted)" }}>
              <th style={{ padding: 6 }}>{t.itemDescription}</th>
              <th style={{ padding: 6, width: 70 }}>{t.itemQuantity}</th>
              <th style={{ padding: 6, width: 100 }}>{t.itemUnitPrice}</th>
              <th style={{ padding: 6, width: 90 }}>{t.itemDiscount}</th>
              <th style={{ padding: 6, width: 80 }}>{t.itemTaxRate}</th>
              <th style={{ padding: 6, width: 90 }}>{t.itemLineTotal}</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const lineTotal =
                Math.round((Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * 100) -
                Math.round((Number(item.discount) || 0) * 100);
              const rowErr = errors.items?.[idx];
              return (
                <tr key={idx}>
                  <td style={{ padding: 4 }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
                      <input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} style={{ width: "100%", padding: 8 }} />
                      <AIImproveDescriptionButton text={item.description} onAccept={(improved) => updateItem(idx, "description", improved)} />
                    </div>
                    {rowErr?.description && <div style={{ color: "var(--error)", fontSize: 12 }}>{rowErr.description}</div>}
                  </td>
                  <td style={{ padding: 4 }}>
                    <input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} style={{ width: "100%", padding: 8 }} />
                  </td>
                  <td style={{ padding: 4 }}>
                    <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", e.target.value)} style={{ width: "100%", padding: 8 }} />
                    {rowErr?.unit_price && <div style={{ color: "var(--error)", fontSize: 12 }}>{rowErr.unit_price}</div>}
                  </td>
                  <td style={{ padding: 4 }}>
                    <input type="number" min="0" step="0.01" value={item.discount} onChange={(e) => updateItem(idx, "discount", e.target.value)} style={{ width: "100%", padding: 8 }} />
                  </td>
                  <td style={{ padding: 4 }}>
                    <input type="number" min="0" step="0.01" value={item.tax_rate} onChange={(e) => updateItem(idx, "tax_rate", e.target.value)} style={{ width: "100%", padding: 8 }} />
                  </td>
                  <td style={{ padding: 8, textAlign: "end" }}>{centsToDisplay(lineTotal)}</td>
                  <td>
                    <button type="button" onClick={() => removeItem(idx)} className="btn-secondary" style={{ width: "auto", padding: "6px 8px" }}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={addItem} className="btn-secondary" style={{ width: "auto", padding: "8px 16px", marginTop: 8 }}>
        + {t.addItem}
      </button>

      <div style={{ marginTop: 16, marginInlineStart: "auto", maxWidth: 260 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>{t.subtotal}</span>
          <span>{centsToDisplay(totals.subtotal_cents)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>{t.totalDiscount}</span>
          <span>{centsToDisplay(totals.discount_cents)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>{t.totalTax}</span>
          <span>{centsToDisplay(totals.tax_cents)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6 }}>
          <span>{t.grandTotal}</span>
          <span>{centsToDisplay(totals.total_cents)}</span>
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="notes">{t.notes}</label>
        <input id="notes" value={header.notes} onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))} />
      </div>
      <div className="field">
        <label htmlFor="terms">{t.terms}</label>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input id="terms" value={header.terms} onChange={(e) => setHeader((h) => ({ ...h, terms: e.target.value }))} style={{ flex: 1 }} />
          <AITermsSuggestButton onAccept={(text) => setHeader((h) => ({ ...h, terms: h.terms ? `${h.terms} ${text}` : text }))} />
        </div>
      </div>

      <button className="btn-primary" type="submit" disabled={isPending} style={{ maxWidth: 220 }}>
        {isPending ? t.saving : submitLabel}
      </button>
    </form>
  );
}
