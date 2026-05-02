"use server";

import { revalidatePath } from "next/cache";
import { createCheckedAdminClient } from "@/lib/supabase/admin";

const PARTNER_TYPES = new Set(["university", "ngo", "government", "thinktank", "media"]);

function actionError(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

export async function createPartner(input: {
  name: string;
  type: string;
  country: string;
  description: string;
  website_url: string;
  active: boolean;
}) {
  try {
    const name = input.name.trim();
    if (!name) {
      return { error: "Partner name is required." };
    }

    const admin = await createCheckedAdminClient();
    const { error } = await admin.from("institutional_partners").insert({
      name,
      type: PARTNER_TYPES.has(input.type) ? input.type : "university",
      country: input.country.trim() || null,
      description: input.description.trim() || null,
      website_url: input.website_url.trim() || null,
      active: input.active,
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/partners");
    revalidatePath("/partners");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to create partner.");
  }
}

export async function togglePartner(partnerId: string, active: boolean) {
  try {
    const admin = await createCheckedAdminClient();
    const { error } = await admin
      .from("institutional_partners")
      .update({ active: !active })
      .eq("id", partnerId);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/partners");
    revalidatePath("/partners");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to update partner.");
  }
}
