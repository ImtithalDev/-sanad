"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";

export type ShareActionResult = { success: boolean; error?: string; token?: string };

export async function createShareLink(documentType: "quote" | "invoice", documentId: string): Promise<ShareActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const { data: token, error } = await supabase.rpc("create_share_link", {
    p_document_type: documentType,
    p_document_id: documentId,
  });

  if (error || !token) {
    return { success: false, error: error?.message ?? t.genericError };
  }

  revalidatePath(`/dashboard/${documentType}s/${documentId}`);
  return { success: true, token };
}

export async function revokeShareLink(documentType: "quote" | "invoice", documentId: string): Promise<ShareActionResult> {
  const t = getDictionary("ar");
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const { error } = await supabase.rpc("revoke_share_link", {
    p_document_type: documentType,
    p_document_id: documentId,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/${documentType}s/${documentId}`);
  return { success: true };
}
