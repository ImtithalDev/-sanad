import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";
import ClientForm from "@/components/ClientForm";
import { updateClientRecord } from "@/app/dashboard/clients/actions";

export default async function EditClientPage({ params }: { params: { id: string } }) {
  const t = getDictionary("ar");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="alert-error">{t.genericError}</div>;
  }

  const { data: clientRecord, error } = await supabase
    .from("clients")
    .select("id, name, email, phone, company, address, notes")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return <div className="alert-error">{t.genericError}</div>;
  }
  if (!clientRecord) {
    notFound();
  }

  const boundUpdate = updateClientRecord.bind(null, clientRecord.id);

  return (
    <div style={{ maxWidth: 480 }}>
      <h1>{t.editClient}</h1>
      <ClientForm
        initial={{
          name: clientRecord.name ?? "",
          email: clientRecord.email ?? "",
          phone: clientRecord.phone ?? "",
          company: clientRecord.company ?? "",
          address: clientRecord.address ?? "",
          notes: clientRecord.notes ?? "",
        }}
        action={boundUpdate}
        submitLabel={t.save}
      />
    </div>
  );
}
