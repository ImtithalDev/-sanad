"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { setQuoteStatus, duplicateQuote, convertQuoteToInvoice } from "@/app/dashboard/quotes/actions";

type Props = {
  quoteId: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  convertedToInvoiceId: string | null;
};

export default function QuoteActions({ quoteId, status, convertedToInvoiceId }: Props) {
  const t = getDictionary("ar");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && !result.success) {
        setError(result.error ?? t.genericError);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div>
      {error && <div className="alert-error">{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {status === "draft" && (
          <button className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} disabled={isPending} onClick={() => run(() => setQuoteStatus(quoteId, "sent"))}>
            {t.markAsSent}
          </button>
        )}
        {status === "sent" && (
          <>
            <button className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} disabled={isPending} onClick={() => run(() => setQuoteStatus(quoteId, "accepted"))}>
              {t.markAccepted}
            </button>
            <button className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} disabled={isPending} onClick={() => run(() => setQuoteStatus(quoteId, "rejected"))}>
              {t.markRejected}
            </button>
            <button className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} disabled={isPending} onClick={() => run(() => setQuoteStatus(quoteId, "expired"))}>
              {t.markExpired}
            </button>
          </>
        )}

        <button className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} disabled={isPending} onClick={() => run(() => duplicateQuote(quoteId))}>
          {t.duplicate}
        </button>

        {!convertedToInvoiceId ? (
          <button
            className="btn-secondary"
            style={{ width: "auto", padding: "8px 16px" }}
            disabled={isPending}
            onClick={() => run(() => convertQuoteToInvoice(quoteId, ""))}
          >
            {t.convertToInvoice}
          </button>
        ) : (
          <a href={`/dashboard/invoices/${convertedToInvoiceId}`} className="btn-secondary" style={{ width: "auto", padding: "8px 16px", textDecoration: "none", display: "inline-block" }}>
            {t.viewInvoice}
          </a>
        )}
      </div>
    </div>
  );
}
