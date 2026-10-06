import { getDictionary } from "@/lib/i18n";
import { getMyEntitlements } from "@/lib/billing/entitlements";
import { getPlanLimits } from "@/lib/billing/get-plan-limits";
import { PLAN_ORDER } from "@/lib/billing/plans";
import BillingPanel from "@/components/BillingPanel";

export default async function BillingPage() {
  const t = getDictionary("ar");
  const entitlements = await getMyEntitlements();

  if (!entitlements) {
    return <div className="alert-error">{t.genericError}</div>;
  }

  const limitsEntries = await Promise.all(PLAN_ORDER.map(async (plan) => [plan, await getPlanLimits(plan)] as const));
  const allPlanLimits = Object.fromEntries(limitsEntries.filter(([, v]) => v !== null)) as Record<string, NonNullable<(typeof limitsEntries)[number][1]>>;

  return (
    <div style={{ maxWidth: 800 }}>
      <h1>{t.billing}</h1>
      <BillingPanel entitlements={entitlements} allPlanLimits={allPlanLimits as any} />
    </div>
  );
}
