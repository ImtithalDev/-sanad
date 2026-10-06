import { getDictionary } from "@/lib/i18n";

type Steps = {
  hasClient: boolean;
  hasQuote: boolean;
  hasSentDocument: boolean;
  usedAI: boolean;
  hasShareLink: boolean;
};

// Every checkmark here reflects a real row existing in the database for
// this user (see the queries in app/dashboard/page.tsx) — nothing is marked
// done just because the component rendered. Once all five are true, the
// dashboard stops showing this entirely rather than leaving a permanently
// "completed" checklist cluttering the page.
export default function OnboardingChecklist({ steps }: { steps: Steps }) {
  const t = getDictionary("ar");

  const items = [
    { done: steps.hasClient, label: t.onboardingStep1 },
    { done: steps.hasQuote, label: t.onboardingStep2 },
    { done: steps.hasSentDocument, label: t.onboardingStep3 },
    { done: steps.usedAI, label: t.onboardingStep4 },
    { done: steps.hasShareLink, label: t.onboardingStep5 },
  ];

  if (items.every((i) => i.done)) return null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 20, background: "var(--card)" }}>
      <h3 style={{ marginTop: 0, marginBottom: 10 }}>{t.onboardingTitle}</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                background: item.done ? "var(--primary)" : "var(--border)",
                color: item.done ? "#fff" : "var(--muted)",
                flexShrink: 0,
              }}
            >
              {item.done ? "✓" : ""}
            </span>
            <span style={{ color: item.done ? "var(--muted)" : "var(--text)", textDecoration: item.done ? "line-through" : "none" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
