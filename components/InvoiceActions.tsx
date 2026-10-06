"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { setInvoiceStatus, duplicateInvoice, deleteDraftInvoice } from "@/app/dashboard/invoices/actions";

type Props = {
  invoiceId: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
};

export default function InvoiceActions({ invoiceId, status }: Props) {
  const t = getDictionary("ar");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ success: boolean; error?: string }>, onSuccessRedirect?: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && !result.success) {
        setError(result.error ?? t.genericError);
      } else if (onSuccessRedirect) {
        router.replace(onSuccessRedirect);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(t.deleteInvoiceConfirm)) return;
    run(() => deleteDraftInvoice(invoiceId), "/dashboard/invoices");
  }

  return (
    <div>
      {error && <div className="alert-error">{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {status === "draft" && (
          <>
            <button className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} disabled={isPending} onClick={() => run(() => setInvoiceStatus(invoiceId, "sent"))}>
              {t.markAsSent}
            </button>
            <button className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} disabled={isPending} onClick={handleDelete}>
              {t.deleteInvoice}
            </button>
          </>
        )}
        {(status === "sent" || status === "overdue") && (
          <>
            <button className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} disabled={isPending} onClick={() => run(() => setInvoiceStatus(invoiceId, "paid"))}>
              {t.markPaid}
            </button>
            {status === "sent" && (
              <button className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} disabled={isPending} onClick={() => run(() => setInvoiceStatus(invoiceId, "overdue"))}>
                {t.markOverdue}
              </button>
            )}
            <button className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} disabled={isPending} onClick={() => run(() => setInvoiceStatus(invoiceId, "cancelled"))}>
              {t.markCancelled}
            </button>
          </>
        )}

        <button className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} disabled={isPending} onClick={() => run(() => duplicateInvoice(invoiceId))}>
          {t.duplicate}
        </button>
      </div>
    </div>
  );
}
