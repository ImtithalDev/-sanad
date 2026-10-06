"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteClientRecord } from "@/app/dashboard/clients/actions";
import { getDictionary } from "@/lib/i18n";

export default function DeleteClientButton({ clientId }: { clientId: string }) {
  const t = getDictionary("ar");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!window.confirm(t.deleteConfirm)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteClientRecord(clientId);
      if (result.success) {
        router.replace("/dashboard/clients");
        router.refresh();
      } else {
        setError(result.error ?? t.genericError);
      }
    });
  }

  return (
    <div>
      {error && <div className="alert-error">{error}</div>}
      <button className="btn-secondary" onClick={handleDelete} disabled={isPending}>
        {isPending ? t.saving : t.deleteClient}
      </button>
    </div>
  );
}
