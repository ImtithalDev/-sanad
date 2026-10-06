"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n";

export type BillingActionResult = { success: boolean; error?: string };

export async function cancelSubscription(): Promise<BillingActionResult> {
  const t = getDictionary("ar");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const { error } = await supabase.rpc("cancel_my_subscription");
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/billing");
  return { success: true };
}

export async function reactivateSubscription(): Promise<BillingActionResult> {
  const t = getDictionary("ar");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t.genericError };

  const { error } = await supabase.rpc("reactivate_my_subscription");
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/billing");
  return { success: true };
}
