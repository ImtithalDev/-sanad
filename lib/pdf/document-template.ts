import type { DocumentTemplateData } from "./types";
import { centsToDisplay } from "@/lib/money";

const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  draft: { ar: "مسودة", en: "Draft" },
  sent: { ar: "تم الإرسال", en: "Sent" },
  accepted: { ar: "مقبول", en: "Accepted" },
  rejected: { ar: "مرفوض", en: "Rejected" },
  expired: { ar: "منتهي", en: "Expired" },
  paid: { ar: "مدفوعة", en: "Paid" },
  overdue: { ar: "متأخرة", en: "Overdue" },
  cancelled: { ar: "ملغاة", en: "Cancelled" },
};

const LABELS = {
  ar: {
    quote: "عرض سعر",
    invoice: "فاتورة",
    documentNumber: "رقم المستند",
    issueDate: "تاريخ الإصدار",
    expiryDate: "تاريخ الانتهاء",
    dueDate: "تاريخ الاستحقاق",
    billTo: "إلى",
    description: "الوصف",
    quantity: "الكمية",
    unitPrice: "سعر الوحدة",
    discount: "الخصم",
    tax: "الضريبة",
    lineTotal: "الإجمالي",
    subtotal: "المجموع الفرعي",
    totalDiscount: "إجمالي الخصم",
    totalTax: "إجمالي الضريبة",
    grandTotal: "الإجمالي الكلي",
    notes: "ملاحظات",
    terms: "الشروط والأحكام",
    taxNumber: "الرقم الضريبي",
  },
  en: {
    quote: "Quote",
    invoice: "Invoice",
    documentNumber: "Document No.",
    issueDate: "Issue date",
    expiryDate: "Expiry date",
    dueDate: "Due date",
    billTo: "Bill to",
    description: "Description",
    quantity: "Qty",
    unitPrice: "Unit price",
    discount: "Discount",
    tax: "Tax",
    lineTotal: "Total",
    subtotal: "Subtotal",
    totalDiscount: "Total discount",
    totalTax: "Total tax",
    grandTotal: "Grand total",
    notes: "Notes",
    terms: "Terms & conditions",
    taxNumber: "Tax No.",
  },
} as const;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Phone numbers, emails, and tax numbers are always LTR content (digits,
// punctuation, latin) even when embedded inside an RTL document. Without
// forcing direction, the browser's bidi algorithm can reorder a leading "+"
// to the wrong end of the string (confirmed visually: "+966501234567"
// rendered as "966501234567+" before this wrapper was added). `dir="ltr"`
// on the span pins it regardless of the surrounding paragraph direction.
function ltrSpan(value: string): string {
  return `<span dir="ltr" style="unicode-bidi: embed;">${escapeHtml(value)}</span>`;
}

export function buildDocumentHtml(data: DocumentTemplateData): string {
  const t = LABELS[data.locale];
  const dir = data.locale === "ar" ? "rtl" : "ltr";
  const statusLabel = STATUS_LABELS[data.status]?.[data.locale] ?? data.status;
  const docTitle = data.kind === "quote" ? t.quote : t.invoice;
  const dateLabel = data.kind === "quote" ? t.expiryDate : t.dueDate;

  const itemRows = data.items
    .map(
      (item) => `
      <tr>
        <td class="cell desc">${escapeHtml(item.description)}</td>
        <td class="cell num">${item.quantity}</td>
        <td class="cell num">${centsToDisplay(item.unit_price_cents)}</td>
        <td class="cell num">${centsToDisplay(item.discount_cents)}</td>
        <td class="cell num">${item.tax_rate}%</td>
        <td class="cell num strong">${centsToDisplay(item.line_total_cents)}</td>
      </tr>`
    )
    .join("");

  // Fonts: Tajawal (Arabic) and Inter (Latin) via Google Fonts. This is fine
  // for the print view rendered in a real browser; the serverless PDF route
  // (see app/dashboard/*/[id]/pdf/route.ts) notes that production hardening
  // should self-host these font files instead of depending on a live fetch
  // to fonts.googleapis.com from inside the rendering function.
  return `<!DOCTYPE html>
<html lang="${data.locale}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.document_number)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px;
    font-family: ${data.locale === "ar" ? "'Tajawal'" : "'Inter'"}, sans-serif;
    color: #16181d;
    font-size: 13px;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f6b5c; padding-bottom: 16px; margin-bottom: 20px; }
  .doc-title { font-size: 26px; font-weight: 700; margin: 0; color: #0f6b5c; }
  .doc-meta { font-size: 12px; color: #555; margin-top: 4px; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 14px; background: #eef2f0; font-size: 12px; margin-top: 8px; }
  .business-name { font-size: 16px; font-weight: 700; }
  .business-line { font-size: 12px; color: #555; }
  .parties { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
  .party-label { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 4px; letter-spacing: 0.04em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { text-align: start; font-size: 11px; color: #888; padding: 8px 6px; border-bottom: 2px solid #e5e7eb; }
  .cell { padding: 8px 6px; border-bottom: 1px solid #eee; font-size: 12.5px; }
  .cell.num { text-align: end; white-space: nowrap; }
  .cell.strong { font-weight: 600; }
  .totals { margin-inline-start: auto; width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .totals-row.grand { font-weight: 700; font-size: 15px; border-top: 2px solid #0f6b5c; margin-top: 6px; padding-top: 8px; }
  .section { margin-top: 20px; font-size: 12.5px; }
  .section-title { font-weight: 700; margin-bottom: 4px; }
  .footer-note { margin-top: 32px; text-align: center; font-size: 11px; color: #aaa; }
  @page { size: A4; margin: 20mm; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <p class="doc-title">${docTitle}</p>
      <p class="doc-meta">${t.documentNumber}: ${escapeHtml(data.document_number)}</p>
      <p class="doc-meta">${t.issueDate}: ${data.issue_date}${data.due_or_expiry_date ? ` &middot; ${dateLabel}: ${data.due_or_expiry_date}` : ""}</p>
      <span class="status-badge">${statusLabel}</span>
    </div>
    <div style="text-align: ${data.locale === "ar" ? "left" : "right"};">
      ${data.business?.name ? `<div class="business-name">${escapeHtml(data.business.name)}</div>` : `<div class="business-name" style="color:#aaa;">—</div>`}
      ${data.business?.address ? `<div class="business-line">${escapeHtml(data.business.address)}</div>` : ""}
      ${data.business?.phone ? `<div class="business-line">${ltrSpan(data.business.phone)}</div>` : ""}
      ${data.business?.email ? `<div class="business-line">${ltrSpan(data.business.email)}</div>` : ""}
      ${data.business?.tax_number ? `<div class="business-line">${t.taxNumber}: ${ltrSpan(data.business.tax_number)}</div>` : ""}
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">${t.billTo}</div>
      ${
        data.client
          ? `<div class="business-name" style="font-size:14px;">${escapeHtml(data.client.name)}</div>
             ${data.client.address ? `<div class="business-line">${escapeHtml(data.client.address)}</div>` : ""}
             ${data.client.phone ? `<div class="business-line">${ltrSpan(data.client.phone)}</div>` : ""}
             ${data.client.email ? `<div class="business-line">${ltrSpan(data.client.email)}</div>` : ""}`
          : `<div class="business-line" style="color:#aaa;">—</div>`
      }
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${t.description}</th>
        <th>${t.quantity}</th>
        <th>${t.unitPrice}</th>
        <th>${t.discount}</th>
        <th>${t.tax}</th>
        <th>${t.lineTotal}</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span>${t.subtotal}</span><span>${centsToDisplay(data.subtotal_cents)}</span></div>
    <div class="totals-row"><span>${t.totalDiscount}</span><span>${centsToDisplay(data.discount_cents)}</span></div>
    <div class="totals-row"><span>${t.totalTax}</span><span>${centsToDisplay(data.tax_cents)}</span></div>
    <div class="totals-row grand"><span>${t.grandTotal}</span><span>${centsToDisplay(data.total_cents)} ${escapeHtml(data.currency)}</span></div>
  </div>

  ${data.notes ? `<div class="section"><div class="section-title">${t.notes}</div><div>${escapeHtml(data.notes)}</div></div>` : ""}
  ${data.terms ? `<div class="section"><div class="section-title">${t.terms}</div><div>${escapeHtml(data.terms)}</div></div>` : ""}

  <div class="footer-note">Sanad — سند</div>
</body>
</html>`;
}
