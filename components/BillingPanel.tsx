"use client";

import { useState, useTransition } from "react";
import { getDictionary } from "@/lib/i18n";
import { centsToDisplay } from "@/lib/money";
import { cancelSubscription, reactivateSubscription } from "@/app/dashboard/billing/actions";
import { PLAN_DISPLAY, PLAN_ORDER, type PlanId } from "@/lib/billing/plans";
import type { Entitlements } from "@/lib/billing/entitlements";
import type { PlanLimits } from "@/lib/billing/get-plan-limits";

type Props = {
  entitlements: Entitlements;
  allPlanLimits: Record<PlanId, PlanLimits>;
};

function UsageBar({ label, used, limit, unlimitedLabel }: { label: string; used: number; limit: number | null; unlimitedLabel: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: "var(--muted)" }}>{limit === null ? unlimitedLabel : `${used} / ${limit}`}</span>
      </div>
      {limit !== null && (
        <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--error)" : "var(--primary)" }} />
        </div>
      )}
    </div>
  );
}

export default function BillingPanel({ entitlements, allPlanLimits }: Props) {
  const t = getDictionary("ar");
  const [isPending, startTransition] = useTransition();
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade(plan: PlanId) {
    if (plan === "free") return;
    setError(null);
    setCheckoutLoading(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error_code === "provider_not_configured" ? t.paymentNotConfigured : t.checkoutError);
        setCheckoutLoading(null);
        return;
      }
      const body = await res.json();
      window.location.href = body.checkoutUrl;
    } catch {
      setError(t.checkoutError);
      setCheckoutLoading(null);
    }
  }

  function handleCancel() {
    if (!window.confirm(t.cancelSubscriptionConfirm)) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelSubscription();
      if (!result.success) setError(result.error ?? t.genericError);
    });
  }

  function handleReactivate() {
    setError(null);
    startTransition(async () => {
      const result = await reactivateSubscription();
      if (!result.success) setError(result.error ?? t.genericError);
    });
  }

  const planNameKey: Record<PlanId, string> = { free: t.planFree, pro: t.planPro, business: t.planBusiness };

  return (
    <div>
      {error && <div className="alert-error">{error}</div>}

      <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 20, background: "var(--card)" }}>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 4px" }}>{t.currentPlan}</p>
        <h2 style={{ margin: "0 0 8px" }}>{planNameKey[entitlements.plan]}</h2>

        {entitlements.plan !== "free" && (
          <p style={{ fontSize: 13, color: entitlements.status === "past_due" || entitlements.cancelAtPeriodEnd ? "var(--error)" : "var(--muted)" }}>
            {entitlements.status === "past_due" ? t.subscriptionPastDue : entitlements.cancelAtPeriodEnd ? t.subscriptionCancelling : t.subscriptionActive}
            {entitlements.currentPeriodEnd ? ` · ${new Date(entitlements.currentPeriodEnd).toLocaleDateString()}` : ""}
          </p>
        )}

        {entitlements.plan !== "free" && (
          <div style={{ marginTop: 8 }}>
            {entitlements.cancelAtPeriodEnd ? (
              <button className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} onClick={handleReactivate} disabled={isPending}>
                {t.reactivateSubscription}
              </button>
            ) : (
              <button className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} onClick={handleCancel} disabled={isPending}>
                {t.cancelSubscription}
              </button>
            )}
          </div>
        )}
      </div>

      <h3>{t.usageThisMonth}</h3>
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 24, background: "var(--card)" }}>
        <UsageBar label={t.clientsUsage} used={entitlements.usage.clientsCount} limit={entitlements.limits.max_clients} unlimitedLabel={t.unlimited} />
        <UsageBar label={t.quotesUsage} used={entitlements.usage.quotesThisMonth} limit={entitlements.limits.quotes_per_month} unlimitedLabel={t.unlimited} />
        <UsageBar label={t.invoicesUsage} used={entitlements.usage.invoicesThisMonth} limit={entitlements.limits.invoices_per_month} unlimitedLabel={t.unlimited} />
        <UsageBar label={t.aiUsage} used={entitlements.usage.aiRequestsThisMonth} limit={entitlements.limits.ai_requests_per_month} unlimitedLabel={t.unlimited} />
      </div>

      <h3>{t.viewPlans}</h3>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {PLAN_ORDER.map((planId) => {
          const display = PLAN_DISPLAY[planId];
          const limits = allPlanLimits[planId];
          const isCurrent = entitlements.plan === planId;
          return (
            <div key={planId} style={{ border: isCurrent ? "2px solid var(--primary)" : "1px solid var(--border)", borderRadius: 10, padding: 16, background: "var(--card)" }}>
              <h4 style={{ margin: "0 0 4px" }}>{planNameKey[planId]}</h4>
              <p style={{ fontSize: 20, fontWeight: 700, margin: "0 0 10px" }}>
                {limits.price_cents === 0 ? t.planFree : `${centsToDisplay(limits.price_cents)} ${limits.currency}`}
                {limits.price_cents > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)" }}> {t.perMonth}</span>}
              </p>
              <ul style={{ fontSize: 13, color: "var(--muted)", paddingInlineStart: 18, margin: "0 0 12px" }}>
                {display.featuresAr.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {isCurrent ? (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{t.currentPlanLabel}</span>
              ) : planId === "free" ? null : (
                <button className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} onClick={() => handleUpgrade(planId)} disabled={checkoutLoading !== null}>
                  {checkoutLoading === planId ? t.checkoutRedirecting : `${t.upgradeTo} ${planNameKey[planId]}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
