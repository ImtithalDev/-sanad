export type PlanId = "free" | "pro" | "business";

export type PlanDisplayInfo = {
  id: PlanId;
  nameAr: string;
  nameEn: string;
  // Feature flags not worth a database column yet — booleans the UI reads
  // directly. Numeric limits (documents/AI/clients per month) deliberately
  // do NOT live here: they come from the database's plan_limits() function
  // (supabase/migrations/0006_billing.sql), so there is exactly one place
  // a limit is defined and the UI can never drift from what's enforced.
  featuresAr: string[];
  featuresEn: string[];
};

// Price and billing interval are also read from plan_limits() at runtime
// (see lib/billing/get-plan-limits.ts) rather than duplicated here — this
// object is purely display copy that doesn't affect enforcement.
export const PLAN_DISPLAY: Record<PlanId, PlanDisplayInfo> = {
  free: {
    id: "free",
    nameAr: "مجاني",
    nameEn: "Free",
    featuresAr: ["عملاء وعروض أسعار وفواتير محدودة", "PDF ومشاركة", "دعم أساسي بالذكاء الاصطناعي"],
    featuresEn: ["Limited clients, quotes, and invoices", "PDF and sharing", "Basic AI features"],
  },
  pro: {
    id: "pro",
    nameAr: "برو",
    nameEn: "Pro",
    featuresAr: ["حدود أعلى بكثير للمستندات والعملاء", "استخدام أوسع للذكاء الاصطناعي", "دعم عبر البريد الإلكتروني"],
    featuresEn: ["Much higher document and client limits", "More AI usage", "Email support"],
  },
  business: {
    id: "business",
    nameAr: "أعمال",
    nameEn: "Business",
    featuresAr: ["عملاء ومستندات غير محدودة", "أعلى حد لاستخدام الذكاء الاصطناعي", "دعم ذو أولوية"],
    featuresEn: ["Unlimited clients and documents", "Highest AI usage limit", "Priority support"],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "business"];
