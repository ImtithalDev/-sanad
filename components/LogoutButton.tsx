"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton({ label }: { label: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="btn-secondary" style={{ width: "auto", padding: "8px 16px" }} onClick={handleLogout} disabled={loading}>
      {loading ? "..." : label}
    </button>
  );
}
