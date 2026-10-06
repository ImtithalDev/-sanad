"use client";

import { useState } from "react";
import { getDictionary } from "@/lib/i18n";
import { parseAIErrorResponse } from "@/lib/ai/client-error";
import type { QuoteDraft } from "@/lib/ai/schemas";
import type { LineItemDraft } from "@/lib/validation/document";

type Props = {
  onApply: (items: LineItemDraft[], notes: string | null, terms: string | null) => void;
};

export default function AIQuoteAssistant({ onApply }: Props) {
  const locale = "ar" as const; // full language toggle lands in Phase 12; the AI call itself already threads this through
  const t = getDictionary(locale);

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [included, setIncluded] = useState<boolean[]>([]);

  async function handleGenerate() {
    if (description.trim().length < 3) return;
    setLoading(true);
    setError(null);
    setDraft(null);

    try {
      const res = await fetch("/api/ai/quote-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, locale }),
      });
      if (!res.ok) {
        setError(await parseAIErrorResponse(res, locale));
        return;
      }
      const body = await res.json();
      setDraft(body.draft);
      setIncluded(body.draft.items.map(() => true));
    } catch {
      setError(t.aiErrorGeneric);
    } finally {
      setLoading(false);
    }
  }

  function updateDraftItem(idx: number, field: "description" | "quantity" | "suggested_unit_price_cents" | "tax_rate", value: string) {
    if (!draft) return;
    const items = [...draft.items];
    if (field === "description") items[idx] = { ...items[idx], description: value };
    else if (field === "quantity") items[idx] = { ...items[idx], quantity: Number(value) || 0 };
    else if (field === "tax_rate") items[idx] = { ...items[idx], tax_rate: Number(value) || 0 };
    else items[idx] = { ...items[idx], suggested_unit_price_cents: value === "" ? null : Math.round(Number(value) * 100) };
    setDraft({ ...draft, items });
  }

  function handleApply() {
    if (!draft) return;
    const chosen = draft.items.filter((_, idx) => included[idx]);
    const lineItems: LineItemDraft[] = chosen.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unit_price: item.suggested_unit_price_cents !== null ? (item.suggested_unit_price_cents / 100).toString() : "",
      discount: "0",
      tax_rate: String(item.tax_rate),
    }));
    onApply(lineItems, draft.notes, draft.terms);
    setDraft(null);
    setOpen(false);
    setDescription("");
  }

  if (!open) {
    return (
      <button type="button" className="btn-secondary" style={{ width: "auto", padding: "8px 16px", marginBottom: 16 }} onClick={() => setOpen(true)}>
        ✨ {t.aiQuoteAssistant}
      </button>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 20, background: "var(--card)" }}>
      <h3 style={{ marginTop: 0 }}>✨ {t.aiQuoteAssistant}</h3>

      {error && (
        <div className="alert-error">
          {error}{" "}
          <button type="button" onClick={handleGenerate} style={{ textDecoration: "underline", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
            {t.aiRetry}
          </button>
        </div>
      )}

      {!draft && (
        <div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.aiDescribeJob}
            rows={3}
            style={{ width: "100%", padding: 10, border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 14 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} onClick={handleGenerate} disabled={loading || description.trim().length < 3}>
              {loading ? t.aiGenerating : t.aiGenerateDraft}
            </button>
            <button type="button" className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} onClick={() => setOpen(false)} disabled={loading}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {draft && (
        <div>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>{t.aiReviewNotice}</p>
          {draft.items.map((item, idx) => (
            <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <input type="checkbox" checked={included[idx] ?? true} onChange={(e) => setIncluded((prev) => prev.map((v, i) => (i === idx ? e.target.checked : v)))} />
              <input value={item.description} onChange={(e) => updateDraftItem(idx, "description", e.target.value)} style={{ flex: 2, minWidth: 160, padding: 6 }} />
              <input type="number" value={item.quantity} onChange={(e) => updateDraftItem(idx, "quantity", e.target.value)} style={{ width: 60, padding: 6 }} title={t.itemQuantity} />
              <input
                type="number"
                value={item.suggested_unit_price_cents !== null ? (item.suggested_unit_price_cents / 100).toString() : ""}
                onChange={(e) => updateDraftItem(idx, "suggested_unit_price_cents", e.target.value)}
                placeholder={t.itemUnitPrice}
                style={{ width: 90, padding: 6 }}
              />
              <input type="number" value={item.tax_rate} onChange={(e) => updateDraftItem(idx, "tax_rate", e.target.value)} style={{ width: 60, padding: 6 }} title={t.itemTaxRate} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} onClick={handleApply}>
              {t.aiApplyDraft}
            </button>
            <button type="button" className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} onClick={() => setDraft(null)}>
              {t.aiDiscardDraft}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
