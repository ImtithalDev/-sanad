import { NextResponse } from "next/server";
import { fetchOwnedQuoteForDocument } from "@/lib/pdf/fetch-owned-document";
import { buildDocumentHtml } from "@/lib/pdf/document-template";
import { renderHtmlToPdf } from "@/lib/pdf/render-pdf";

// Chromium-based rendering requires the Node.js runtime — this route cannot
// run on the Edge runtime, which has no ability to spawn a browser process.
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const locale = (url.searchParams.get("locale") === "en" ? "en" : "ar") as "ar" | "en";

  const data = await fetchOwnedQuoteForDocument(params.id, locale);
  if (!data) {
    // Same response whether the quote doesn't exist or belongs to someone
    // else — this route is behind the session cookie, but there's no reason
    // to distinguish the two cases even here.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const html = buildDocumentHtml(data);

  try {
    const pdfBuffer = await renderHtmlToPdf(html);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${data.document_number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    // Real failure path, not a silent blank download: renderHtmlToPdf throws
    // if Chromium isn't available (e.g. puppeteer packages not installed yet
    // in this environment) — see the Phase 6 report for what that means today.
    return NextResponse.json({ error: "pdf_generation_failed" }, { status: 500 });
  }
}
