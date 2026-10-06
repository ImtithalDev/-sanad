"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { validateClientInput, isValid, type ClientFormData } from "@/lib/validation/client";
import { getDictionary } from "@/lib/i18n";

export type ActionResult = { success: boolean; error?: string; fieldErrors?: Record<string, string>; quotaExceeded?: boolean };

function extractFormData(formData: FormData): ClientFormData {
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    company: String(formData.get("company") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

// Every action below re-authenticates the request itself via getUser() —
// it never accepts a user_id from the caller. Form data can never carry
// a "user_id" field that matters: even if someone tampered with the request
// body, .eq("user_id", user.id) plus RLS both independently block cross-user access.

export async function createClientRecord(formData: FormData): Promise<ActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: t.genericError };
  }

  const input = extractFormData(formData);
  const fieldErrors = validateClientInput(input, t);
  if (!isValid(fieldErrors)) {
    return { success: false, fieldErrors };
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      user_id: user.id, // server-verified identity — the only source of truth
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      company: input.company || null,
      address: input.address || null,
      notes: input.notes || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.message?.includes("client_quota_exceeded")) {
      return { success: false, quotaExceeded: true };
    }
    return { success: false, error: error?.message ?? t.genericError };
  }

  revalidatePath("/dashboard/clients");
  redirect(`/dashboard/clients/${data.id}`); // throws internally; nothing below runs
  return { success: true }; // unreachable — satisfies the Promise<ActionResult> return type
}

export async function updateClientRecord(clientId: string, formData: FormData): Promise<ActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: t.genericError };
  }

  const input = extractFormData(formData);
  const fieldErrors = validateClientInput(input, t);
  if (!isValid(fieldErrors)) {
    return { success: false, fieldErrors };
  }

  const { error, count } = await supabase
    .from("clients")
    .update({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      company: input.company || null,
      address: input.address || null,
      notes: input.notes || null,
    })
    .eq("id", clientId)
    .eq("user_id", user.id) // explicit scoping in addition to RLS: defense in depth
    .select("id");

  if (error) {
    return { success: false, error: error.message };
  }
  if (count === 0) {
    // Either it doesn't exist or it belongs to someone else — same message either way,
    // so we never confirm to an attacker that a given client ID exists.
    return { success: false, error: t.clientNotFound };
  }

  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${clientId}`);
  redirect(`/dashboard/clients/${clientId}`); // throws internally; nothing below runs
  return { success: true }; // unreachable — satisfies the Promise<ActionResult> return type
}

export async function deleteClientRecord(clientId: string): Promise<ActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: t.genericError };
  }

  const { error, count } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return { success: false, error: error.message };
  }
  if (count === 0) {
    return { success: false, error: t.clientNotFound };
  }

  revalidatePath("/dashboard/clients");
  return { success: true };
}
