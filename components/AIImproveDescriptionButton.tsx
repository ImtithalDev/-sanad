"use client";

import { useState } from "react";
import { getDictionary } from "@/lib/i18n";
import { parseAIErrorResponse } from "@/lib/ai/client-error";

type Props = {
  text: string;
  onAccept: (improved: string) => void;
};

export default function AIImproveDescriptionButton({ text, onAccept }: Props) {
  const locale = "ar" as const;
  const t = getDictionary(locale);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  async function handleClick() {
    if (text.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/ai/improve-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, locale }),
      });
      if (!res.ok) {
        setError(await parseAIErrorResponse(res, locale));
        return;
      }
      const body = await res.json();
      setSuggestion(body.description);
    } catch {
      setError(t.aiErrorGeneric);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || text.trim().length < 2}
        title={t.aiImprove}
        className="btn-secondary"
        style={{ width: "auto", padding: "6px 8px", fontSize: 13, whiteSpace: "nowrap" }}
      >
        {loading ? "…" : "✨"}
      </button>

      {(suggestion || error) && (
        <div
          style={{
            position: "absolute",
            zIndex: 5,
            top: "100%",
            insetInlineStart: 0,
            marginTop: 4,
            width: 260,
            padding: 10,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          {error ? (
            <div className="alert-error" style={{ margin: 0 }}>
              {error}
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 6px" }}>{t.aiSuggested}</p>
              <p style={{ fontSize: 13, margin: "0 0 8px" }}>{suggestion}</p>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
                  onClick={() => {
                    if (suggestion) onAccept(suggestion);
                    setSuggestion(null);
                  }}
                >
                  {t.aiAccept}
                </button>
                <button type="button" className="btn-secondary" style={{ width: "auto", padding: "4px 10px", fontSize: 12 }} onClick={() => setSuggestion(null)}>
                  {t.aiDismiss}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
