"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getDictionary } from "@/lib/i18n";

export default function SignupPage() {
  const t = getDictionary("ar"); // locale wiring for auth pages lands in Phase 12 (full i18n)
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    setSuccess(true);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="auth-brand">{t.appName}</p>
        <h1 className="auth-title">{t.signup}</h1>

        {error && <div className="alert-error">{error}</div>}
        {success && <div className="alert-success">{t.signupSuccess}</div>}

        {!success && (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="fullName">{t.fullName}</label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
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
            <div className="field">
              <label htmlFor="password">{t.password}</label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? t.loading : t.submitSignup}
            </button>
          </form>
        )}

        <p className="auth-footer">
          {t.haveAccount} <Link href="/login">{t.login}</Link>
        </p>
      </div>
    </div>
  );
}
