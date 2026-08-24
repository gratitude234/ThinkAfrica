"use server";

import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

/**
 * The token is the only thing standing between an unpublished draft and the
 * public, so it comes from a CSPRNG rather than from anything derivable. 24
 * bytes is 192 bits, which is not guessable at any rate an attacker could
 * sustain against a route that reads one row.
 */
function mintToken() {
  return randomBytes(24).toString("base64url");
}

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Creates a share link for a draft, or returns the existing one. Revoking and
 * sharing again mints a fresh token, so a link the writer took back never
 * starts working again.
 */
export async function createDraftShareLink(input: { postId: string }) {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "You must be signed in.", token: null as string | null };

  const { data: post } = await supabase
    .from("posts")
    .select("id, author_id, status")
    .eq("id", input.postId)
    .maybeSingle();

  if (!post || post.author_id !== user.id) {
    return { error: "You do not have permission to share this draft.", token: null as string | null };
  }
  if (post.status !== "draft") {
    return {
      error: "This is already published. Share its address instead.",
      token: null as string | null,
    };
  }

  const { data: existing } = await supabase
    .from("post_draft_shares")
    .select("token, revoked_at")
    .eq("post_id", input.postId)
    .maybeSingle();

  if (existing && !existing.revoked_at) {
    return { error: null, token: existing.token as string };
  }

  const token = mintToken();
  const { error } = await supabase.from("post_draft_shares").upsert(
    {
      post_id: input.postId,
      author_id: user.id,
      token,
      revoked_at: null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "post_id" }
  );

  if (error) return { error: error.message, token: null as string | null };
  return { error: null, token };
}

export async function revokeDraftShareLink(input: { postId: string }) {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("post_draft_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("post_id", input.postId)
    .eq("author_id", user.id);

  return { error: error?.message ?? null };
}

export async function getDraftShareLink(input: { postId: string }) {
  const { supabase, user } = await currentUser();
  if (!user) return { token: null as string | null };

  const { data } = await supabase
    .from("post_draft_shares")
    .select("token, revoked_at")
    .eq("post_id", input.postId)
    .eq("author_id", user.id)
    .maybeSingle();

  return { token: data && !data.revoked_at ? (data.token as string) : null };
}
