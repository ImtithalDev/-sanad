import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { Locale } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "سند — Sanad",
  description: "Create professional quotes and invoices in minutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (cookies().get("sanad_locale")?.value as Locale) || "ar";
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <body>{children}</body>
    </html>
  );
}
