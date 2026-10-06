import { getDictionary } from "@/lib/i18n";
import ClientForm from "@/components/ClientForm";
import { createClientRecord } from "@/app/dashboard/clients/actions";

export default function NewClientPage() {
  const t = getDictionary("ar");

  return (
    <div style={{ maxWidth: 480 }}>
      <h1>{t.newClient}</h1>
      <ClientForm action={createClientRecord} submitLabel={t.save} />
    </div>
  );
}
