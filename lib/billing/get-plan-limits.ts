import { createClient } from "@/lib/supabase/server";
import type { PlanId } from "./plans";

export type PlanLimits = {
  price_cents: number;
  currency: string;
  billing_interval: "month" | "year";
  ai_requests_per_month: number | null;
  quotes_per_month: number | null;
  invoices_per_month: number | null;
  max_clients: number | null;
};

// Reads the SAME numbers the database enforces (supabase/migrations/0006_billing.sql
// plan_limits() function) — this is what makes it structurally impossible for
// the UI to show a different limit than what's actually applied.
export async function getPlanLimits(plan: PlanId): Promise<PlanLimits | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("plan_limits", { p_plan: plan });
  if (error || !data) return null;
  return data as PlanLimits;
}
