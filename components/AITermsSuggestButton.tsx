"use client";

import { useState } from "react";
import { getDictionary } from "@/lib/i18n";
import { parseAIErrorResponse } from "@/lib/ai/client-error";

type Kind = "payment_terms" | "quote_terms" | "delivery_terms" | "service_notes";

type Props = {
  onAccept: (text: string) => void;
};

export default function AITermsSuggestButton({ onAccept }: Props) {
  const locale = "ar" as const;
  const t = getDictionary(locale);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const kinds: { value: Kind; label: string }[] = [
    { value: "payment_terms", label: t.aiTermsKindPayment },
    { value: "quote_terms", label: t.aiTermsKindQuote },
    { value: "delivery_terms", label: t.aiTermsKindDelivery },
    { value: "service_notes", label: t.aiTermsKindNotes },
  ];

  async function handlePick(kind: Kind) {
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/ai/business-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, locale }),
      });
      if (!res.ok) {
        setError(await parseAIErrorResponse(res, locale));
        return;
      }
      const body = await res.json();
      setSuggestion(body.text);
    } catch {
      setError(t.aiErrorGeneric);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-secondary" style={{ width: "auto", padding: "6px 10px", fontSize: 13, whiteSpace: "nowrap" }} onClick={() => setOpen(true)}>
        ✨ {t.aiSuggestTerms}
      </button>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, minWidth: 220 }}>
      {!suggestion && !error && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {kinds.map((k) => (
            <button key={k.value} type="button" className="btn-secondary" style={{ width: "auto", padding: "4px 10px", fontSize: 12 }} disabled={loading} onClick={() => handlePick(k.value)}>
              {loading ? "…" : k.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div className="alert-error" style={{ margin: 0 }}>
          {error}
        </div>
      )}
      {suggestion && (
        <div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 6px" }}>{t.aiSuggested}</p>
          <p style={{ fontSize: 13, margin: "0 0 8px" }}>{suggestion}</p>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="btn-primary"
              style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
              onClick={() => {
                onAccept(suggestion);
                setSuggestion(null);
                setOpen(false);
              }}
            >
              {t.aiAccept}
            </button>
            <button type="button" className="btn-secondary" style={{ width: "auto", padding: "4px 10px", fontSize: 12 }} onClick={() => setSuggestion(null)}>
              {t.aiDismiss}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
