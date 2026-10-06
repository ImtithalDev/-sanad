import { NextResponse } from "next/server";
import { fetchOwnedInvoiceForDocument } from "@/lib/pdf/fetch-owned-document";
import { buildDocumentHtml } from "@/lib/pdf/document-template";
import { renderHtmlToPdf } from "@/lib/pdf/render-pdf";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const locale = (url.searchParams.get("locale") === "en" ? "en" : "ar") as "ar" | "en";

  const data = await fetchOwnedInvoiceForDocument(params.id, locale);
  if (!data) {
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
    return NextResponse.json({ error: "pdf_generation_failed" }, { status: 500 });
  }
}
