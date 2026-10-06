"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { createShareLink, revokeShareLink } from "@/app/dashboard/share-actions";
import { parseAIErrorResponse } from "@/lib/ai/client-error";

type Props = {
  documentType: "quote" | "invoice";
  documentId: string;
  documentNumber: string;
  existingToken: string | null;
};

type MessageKind = "send_quote" | "follow_up_quote" | "send_invoice" | "payment_reminder";

export default function ShareDialog({ documentType, documentId, documentNumber, existingToken }: Props) {
  const t = getDictionary("ar");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [token, setToken] = useState(existingToken);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const locale = "ar" as const;
  const messageKinds: { value: MessageKind; label: string }[] = [
    { value: "send_quote", label: t.aiMessageKindSendQuote },
    { value: "follow_up_quote", label: t.aiMessageKindFollowUp },
    { value: "send_invoice", label: t.aiMessageKindSendInvoice },
    { value: "payment_reminder", label: t.aiMessageKindPaymentReminder },
  ];
  const relevantKinds = documentType === "quote" ? messageKinds.filter((k) => k.value !== "send_invoice" && k.value !== "payment_reminder") : messageKinds.filter((k) => k.value === "send_invoice" || k.value === "payment_reminder");

  async function handleGenerateMessage(kind: MessageKind) {
    setAiLoading(true);
    setAiError(null);
    setAiMessage(null);
    try {
      const res = await fetch("/api/ai/client-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType, documentId, kind, locale }),
      });
      if (!res.ok) {
        setAiError(await parseAIErrorResponse(res, locale));
        return;
      }
      const body = await res.json();
      setAiMessage(body.message);
    } catch {
      setAiError(t.aiErrorGeneric);
    } finally {
      setAiLoading(false);
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const shareUrl = token ? `${siteUrl}/share/${token}` : null;
  const pdfUrl = `/dashboard/${documentType}s/${documentId}/pdf`;
  const printUrl = `/dashboard/${documentType}s/${documentId}/print`;

  function handleCreateLink() {
    setError(null);
    startTransition(async () => {
      const result = await createShareLink(documentType, documentId);
      if (result.success && result.token) {
        setToken(result.token);
      } else {
        setError(result.error ?? t.genericError);
      }
    });
  }

  function handleRevoke() {
    if (!window.confirm(t.revokeLinkConfirm)) return;
    setError(null);
    startTransition(async () => {
      const result = await revokeShareLink(documentType, documentId);
      if (result.success) {
        setToken(null);
        router.refresh();
      } else {
        setError(result.error ?? t.genericError);
      }
    });
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail on non-HTTPS/non-secure contexts — the link
      // is still visible as text and selectable, so nothing is actually lost.
    }
  }

  // Fetches the PDF via a real request and hands the browser a blob to save,
  // rather than a bare <a href=pdfUrl> — this way a server-side failure
  // (500 pdf_generation_failed) surfaces as an error message instead of
  // silently downloading a broken or empty file.
  async function handleDownload() {
    setPdfError(null);
    setPdfLoading(true);
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) {
        setPdfError(t.pdfFailed);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${documentNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError(t.pdfFailed);
    } finally {
      setPdfLoading(false);
    }
  }

  function handlePrint() {
    window.open(printUrl, "_blank", "noopener,noreferrer");
  }

  const whatsappHref = shareUrl
    ? `https://wa.me/?text=${encodeURIComponent(`${aiMessage ?? t.whatsappMessage} ${shareUrl}`)}`
    : null;
  const emailHref = shareUrl
    ? `mailto:?subject=${encodeURIComponent(documentNumber)}&body=${encodeURIComponent(`${aiMessage ?? t.whatsappMessage} ${shareUrl}`)}`
    : null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, background: "var(--card)" }}>
      <h3 style={{ marginTop: 0 }}>{t.share}</h3>

      {error && <div className="alert-error">{error}</div>}
      {pdfError && <div className="alert-error">{pdfError}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button className="btn-secondary" style={{ width: "auto", padding: "8px 14px" }} onClick={handleDownload} disabled={pdfLoading}>
          {pdfLoading ? t.generatingPdf : t.downloadPdf}
        </button>
        <button className="btn-secondary" style={{ width: "auto", padding: "8px 14px" }} onClick={handlePrint}>
          {t.printDocument}
        </button>
      </div>

      {!token ? (
        <div>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>{t.shareLinkNone}</p>
          <button className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} onClick={handleCreateLink} disabled={isPending}>
            {isPending ? t.saving : t.createLink}
          </button>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>{t.shareLinkActive}</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <input readOnly value={shareUrl ?? ""} style={{ flex: 1, minWidth: 200, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }} />
            <button className="btn-secondary" style={{ width: "auto", padding: "8px 12px" }} onClick={handleCopy}>
              {copied ? t.linkCopied : t.copyLink}
            </button>
          </div>

          <div style={{ marginBottom: 10 }}>
            {aiError && <div className="alert-error">{aiError}</div>}
            {!aiMessage && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {relevantKinds.map((k) => (
                  <button key={k.value} type="button" className="btn-secondary" style={{ width: "auto", padding: "6px 10px", fontSize: 12 }} disabled={aiLoading} onClick={() => handleGenerateMessage(k.value)}>
                    {aiLoading ? "…" : `✨ ${k.label}`}
                  </button>
                ))}
              </div>
            )}
            {aiMessage && (
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginTop: 6 }}>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 6px" }}>{t.aiSuggested}</p>
                <textarea
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                  rows={3}
                  style={{ width: "100%", padding: 8, border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit", fontSize: 13 }}
                />
                <button type="button" className="btn-secondary" style={{ width: "auto", padding: "4px 10px", fontSize: 12, marginTop: 6 }} onClick={() => setAiMessage(null)}>
                  {t.aiDismiss}
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ width: "auto", padding: "8px 14px", textDecoration: "none", display: "inline-block" }}>
                {t.shareViaWhatsapp}
              </a>
            )}
            {emailHref && (
              <a href={emailHref} className="btn-secondary" style={{ width: "auto", padding: "8px 14px", textDecoration: "none", display: "inline-block" }}>
                {t.shareViaEmail}
              </a>
            )}
            <button className="btn-secondary" style={{ width: "auto", padding: "8px 14px" }} onClick={handleRevoke} disabled={isPending}>
              {t.revokeLink}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
