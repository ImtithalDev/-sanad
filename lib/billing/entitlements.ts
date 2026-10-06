import { createClient } from "@/lib/supabase/server";
import { getPlanLimits, type PlanLimits } from "./get-plan-limits";
import type { PlanId } from "./plans";

export type Entitlements = {
  plan: PlanId;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  limits: PlanLimits;
  usage: {
    clientsCount: number;
    quotesThisMonth: number;
    invoicesThisMonth: number;
    aiRequestsThisMonth: number;
  };
};

// Every number here is read through RLS as the logged-in user (or, for
// counts, computed from rows RLS already scopes to them) — nothing here
// trusts a client-supplied value. This is for DISPLAY (paywall copy,
// "3 of 5 quotes used this month") — the actual enforcement is the database
// functions in 0006_billing.sql, which run independently of whatever this
// function returns.
export async function getMyEntitlements(): Promise<Entitlements | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, cancel_at_period_end, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  const plan = (subscription?.plan ?? "free") as PlanId;
  const limits = await getPlanLimits(plan);
  if (!limits) return null;

  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);
  const periodStartIso = periodStart.toISOString().slice(0, 10);

  const [{ count: clientsCount }, { count: quotesCount }, { count: invoicesCount }, { data: usageRow }] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("quotes").select("id", { count: "exact", head: true }).gte("created_at", periodStart.toISOString()),
    supabase.from("invoices").select("id", { count: "exact", head: true }).gte("created_at", periodStart.toISOString()),
    supabase.from("usage").select("ai_requests_used").eq("user_id", user.id).eq("period_start", periodStartIso).maybeSingle(),
  ]);

  return {
    plan,
    status: subscription?.status ?? "active",
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    limits,
    usage: {
      clientsCount: clientsCount ?? 0,
      quotesThisMonth: quotesCount ?? 0,
      invoicesThisMonth: invoicesCount ?? 0,
      aiRequestsThisMonth: usageRow?.ai_requests_used ?? 0,
    },
  };
}
