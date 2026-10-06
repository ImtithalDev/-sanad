"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDictionary } from "@/lib/i18n";

export default function UpdatePasswordPage() {
  const t = getDictionary("ar");
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Requires an active recovery session, established by /auth/callback
    // exchanging the code from the emailed link before this page is reached.
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.replace("/dashboard"), 1200);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="auth-brand">{t.appName}</p>
        <h1 className="auth-title">{t.updatePasswordTitle}</h1>

        {error && <div className="alert-error">{error}</div>}
        {success && <div className="alert-success">{t.updatePasswordSuccess}</div>}

        {!success && (
          <form onSubmit={handleSubmit}>
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
              {loading ? t.loading : t.updatePasswordSubmit}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
