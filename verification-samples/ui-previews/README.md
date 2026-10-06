# UI previews

Static HTML mockups built from the app's actual `globals.css` and real
component structure/copy, rendered through the sandbox's own Chromium
(Playwright) — this sandbox has no network access, so these are NOT
screenshots of the live, running Next.js+Supabase app (that requires
`npm install` and a real database, neither available here). They are an
honest visual proxy: the same CSS, the same layout code, real sample data
clearly meant for preview only.

A real mobile issue was found and fixed during this process: the dashboard
header's nav crowded and the logout button wrapped awkwardly at narrow
widths. Fixed in `app/globals.css`/`app/dashboard/layout.tsx` with a
horizontally-scrollable nav row; `dashboard-mobile-fixed.png` shows the
corrected layout.
