import { NextResponse } from "next/server";
import { fetchOwnedQuoteForDocument } from "@/lib/pdf/fetch-owned-document";
import { buildDocumentHtml } from "@/lib/pdf/document-template";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const locale = (url.searchParams.get("locale") === "en" ? "en" : "ar") as "ar" | "en";

  const data = await fetchOwnedQuoteForDocument(params.id, locale);
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const html = buildDocumentHtml(data);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
