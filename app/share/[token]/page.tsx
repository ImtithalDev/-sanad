import { fetchPublicDocument } from "@/lib/pdf/fetch-public-document";
import { buildDocumentHtml } from "@/lib/pdf/document-template";
import { getDictionary } from "@/lib/i18n";
import ShareDocumentViewer from "@/components/ShareDocumentViewer";

// Intentionally outside /dashboard and outside middleware's protected-route
// list — this page must work with NO session. Everything it shows comes
// only from get_public_document(token), which itself refuses a revoked or
// unknown token; this page never queries quotes/invoices/clients directly.
export default async function PublicSharePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { locale?: string };
}) {
  const locale = (searchParams.locale === "en" ? "en" : "ar") as "ar" | "en";
  const t = getDictionary(locale);

  const data = await fetchPublicDocument(params.token, locale);

  if (!data) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <p>{t.shareLinkInvalid}</p>
        </div>
      </div>
    );
  }

  const html = buildDocumentHtml(data);

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>
      <ShareDocumentViewer html={html} pdfUrl={`/share/${params.token}/pdf?locale=${locale}`} locale={locale} />
    </div>
  );
}
