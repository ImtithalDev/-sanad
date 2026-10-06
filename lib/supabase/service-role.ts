import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// This client authenticates as the Postgres service role, which bypasses
// every RLS policy in the database. It must NEVER be imported into a
// "use client" file, and in this codebase it is used in exactly one place:
// app/api/billing/webhook/route.ts, after that route has already verified
// the provider's webhook signature. The signature check is the real
// authorization boundary here — this client existing is not itself a
// security control, so importing it anywhere else in the app (a normal API
// route, a Server Action) would silently remove RLS protection for whatever
// it touches. If a new use ever seems needed, that's a sign to reconsider
// the design, not to reach for this file again.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is not configured");
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
