"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ToggleBlockInput = {
  blockedId: string;
  block: boolean;
  pathname?: string | null;
};

export async function toggleBlock(input: ToggleBlockInput): Promise<{
  error: string | null;
  blocked: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to block people.", blocked: false };
  }

  if (user.id === input.blockedId) {
    return { error: "You cannot block yourself.", blocked: false };
  }

  if (!input.block) {
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", input.blockedId);

    if (error) return { error: error.message, blocked: true };

    if (input.pathname) revalidatePath(input.pathname);
    return { error: null, blocked: false };
  }

  const { error: blockError } = await supabase.from("user_blocks").insert({
    blocker_id: user.id,
    blocked_id: input.blockedId,
  });

  // 23505: already blocked — treat as success.
  if (blockError && blockError.code !== "23505") {
    return { error: blockError.message, blocked: false };
  }

  // Remove follow relationships in both directions. The reverse row belongs
  // to the blocked user, so it needs the service-role client.
  try {
    const admin = createAdminClient();
    await Promise.all([
      admin
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", input.blockedId),
      admin
        .from("follows")
        .delete()
        .eq("follower_id", input.blockedId)
        .eq("following_id", user.id),
    ]);
  } catch (error) {
    console.error(
      `[blocking] failed to remove follows after block: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  if (input.pathname) revalidatePath(input.pathname);
  return { error: null, blocked: true };
}
