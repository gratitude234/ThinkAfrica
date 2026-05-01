"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function startDebateAction(debateId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_debate", { p_debate_id: debateId });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/debates/${debateId}`);
  revalidatePath("/debates");
}

export async function closeDebateAction(debateId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_debate", { p_debate_id: debateId });

  if (error) {
    throw new Error(error.message);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  void fetch(`${appUrl}/api/debate-recap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.ADMIN_SECRET ?? "",
    },
    body: JSON.stringify({ debateId }),
  }).catch(() => {
    // Recap generation is best-effort.
  });

  revalidatePath(`/debates/${debateId}`);
  revalidatePath("/debates");
}
