"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDictionary } from "@/lib/i18n";

export default function LoginPage() {
  const t = getDictionary("ar");
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      // Deliberately generic: don't reveal whether the email exists.
      setError(t.genericError + " (" + error.message + ")");
      return;
    }

    const next = searchParams.get("next") || "/dashboard";
    router.replace(next);
    router.refresh(); // re-run Server Components now that a session cookie exists
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="auth-brand">{t.appName}</p>
        <h1 className="auth-title">{t.login}</h1>

        {error && <div className="alert-error">{error}</div>}

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
          <div className="field">
            <label htmlFor="password">{t.password}</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? t.loading : t.submitLogin}
          </button>
        </form>

        <p className="auth-footer">
          <Link href="/reset-password">{t.forgotPassword}</Link>
        </p>
        <p className="auth-footer">
          {t.noAccount} <Link href="/signup">{t.signup}</Link>
        </p>
      </div>
    </div>
  );
}
