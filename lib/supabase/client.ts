"use client";

import { createBrowserClient } from "@supabase/ssr";

// Used only in "use client" components. Only ever holds the anon key, which
// is meaningless without a matching RLS policy — every query still goes
// through Postgres RLS as the logged-in user.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
