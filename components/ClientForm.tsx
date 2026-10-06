"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { validateClientInput, isValid, type ClientFormData, type ClientFormErrors } from "@/lib/validation/client";
import type { ActionResult } from "@/app/dashboard/clients/actions";
import PaywallNotice from "@/components/PaywallNotice";

type Props = {
  initial?: Partial<ClientFormData>;
  action: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
};

export default function ClientForm({ initial, action, submitLabel }: Props) {
  const t = getDictionary("ar");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [values, setValues] = useState<ClientFormData>({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    company: initial?.company ?? "",
    address: initial?.address ?? "",
    notes: initial?.notes ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState<ClientFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  function handleChange(field: keyof ClientFormData, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    const errors = validateClientInput(values, t);
    setFieldErrors(errors);
    if (!isValid(errors)) return;

    const formData = new FormData();
    (Object.entries(values) as [string, string][]).forEach(([k, v]) => formData.set(k, v));

    startTransition(async () => {
      // Server Actions that call redirect() throw internally by design (Next.js
      // catches it) — so a successful create/update never reaches the code after
      // this await, and only a real failure returns a result object here.
      const result = await action(formData);
      if (result && !result.success) {
        if (result.quotaExceeded) {
          setQuotaExceeded(true);
          return;
        }
        if (result.fieldErrors) setFieldErrors(result.fieldErrors as ClientFormErrors);
        if (result.error) setServerError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {quotaExceeded && (
        <div style={{ marginBottom: 16 }}>
          <PaywallNotice kind="client" />
        </div>
      )}
      {serverError && <div className="alert-error">{serverError}</div>}

      <div className="field">
        <label htmlFor="name">{t.name} *</label>
        <input
          id="name"
          value={values.name}
          onChange={(e) => handleChange("name", e.target.value)}
          aria-invalid={!!fieldErrors.name}
        />
        {fieldErrors.name && <div className="alert-error">{fieldErrors.name}</div>}
      </div>

      <div className="field">
        <label htmlFor="email">{t.email}</label>
        <input
          id="email"
          type="email"
          value={values.email}
          onChange={(e) => handleChange("email", e.target.value)}
          aria-invalid={!!fieldErrors.email}
        />
        {fieldErrors.email && <div className="alert-error">{fieldErrors.email}</div>}
      </div>

      <div className="field">
        <label htmlFor="phone">{t.phone}</label>
        <input id="phone" value={values.phone} onChange={(e) => handleChange("phone", e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="company">{t.company}</label>
        <input id="company" value={values.company} onChange={(e) => handleChange("company", e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="address">{t.address}</label>
        <input id="address" value={values.address} onChange={(e) => handleChange("address", e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="notes">{t.notes}</label>
        <input id="notes" value={values.notes} onChange={(e) => handleChange("notes", e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-primary" type="submit" disabled={isPending}>
          {isPending ? t.saving : submitLabel}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.back()} disabled={isPending}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}
