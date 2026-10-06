// Renders the same HTML used by the print view into actual PDF bytes using a
// real browser engine. This is deliberately NOT a "PDF library" approach
// (e.g. @react-pdf/renderer, pdf-lib manual layout) — those use their own
// text-shaping engines, which historically have patchy-to-broken support for
// Arabic glyph shaping (joining forms) and bidi reordering. A real Chromium
// instance renders Arabic exactly as a browser does, because it IS a browser.
//
// Two execution paths:
// - Serverless (Vercel/AWS Lambda): @sparticuz/chromium + puppeteer-core.
//   Needs `npm install puppeteer-core @sparticuz/chromium` and this route's
//   runtime set to "nodejs" (not "edge" — Chromium cannot run on Edge).
// - Local dev / a normal Node server: falls back to the full "puppeteer"
//   package (bundles its own Chromium), if installed as a dev dependency.
//
// Neither package is installed in this sandbox (no network to npm install
// them), so this function's actual execution has NOT been verified — see the
// Phase 6 report for exactly what WAS verified using this repo's template
// output via the sandbox's own tooling.
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    // @ts-ignore - optional dependency, only required in production/serverless
    const chromium = (await import("@sparticuz/chromium")).default;
    // @ts-ignore - optional dependency
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({ format: "A4", printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  // @ts-ignore - optional dev dependency
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
