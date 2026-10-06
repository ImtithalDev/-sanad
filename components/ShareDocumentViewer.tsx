"use client";

import { useRef } from "react";
import { getDictionary } from "@/lib/i18n";

type Props = {
  html: string;
  pdfUrl: string;
  locale: "ar" | "en";
};

export default function ShareDocumentViewer({ html, pdfUrl, locale }: Props) {
  const t = getDictionary(locale);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <a href={pdfUrl} className="btn-primary" style={{ width: "auto", padding: "10px 18px", textDecoration: "none", display: "inline-block" }}>
          {t.downloadPdf}
        </a>
        <button className="btn-secondary" style={{ width: "auto", padding: "10px 18px" }} onClick={handlePrint}>
          {t.printDocument}
        </button>
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          title="document-preview"
          style={{ width: "100%", height: "80vh", border: "none" }}
        />
      </div>
    </div>
  );
}
