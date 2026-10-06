"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getDictionary } from "@/lib/i18n";

export default function ResetPasswordPage() {
  const t = getDictionary("ar");
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/update-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="auth-brand">{t.appName}</p>
        <h1 className="auth-title">{t.resetPasswordTitle}</h1>

        {error && <div className="alert-error">{error}</div>}
        {sent && <div className="alert-success">{t.resetPasswordSent}</div>}

        {!sent && (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">{t.email}</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? t.loading : t.resetPasswordSubmit}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link href="/login">{t.login}</Link>
        </p>
      </div>
    </div>
  );
}
