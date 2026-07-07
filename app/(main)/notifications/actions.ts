"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordActivationEvent } from "@/lib/activationServer";
import { logEmailResult, sendUserEmail } from "@/lib/email";

export async function respondToCoAuthorInvite(input: {
  notificationId: string;
  postId: string;
  accept: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const [{ data: notification }, { data: post }, { data: actorProfile }] =
    await Promise.all([
      supabase
        .from("notifications")
        .select("id, type")
        .eq("id", input.notificationId)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("posts")
        .select("author_id, title, slug")
        .eq("id", input.postId)
        .single(),
      supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .single(),
    ]);

  if (!notification || notification.type !== "co_author_invite") {
    return { error: "Invitation not found." };
  }

  if (!post) {
    return { error: "Post not found." };
  }

  const actorName =
    actorProfile?.full_name?.trim() || actorProfile?.username || "A collaborator";

  if (input.accept) {
    const { data: invite, error } = await supabase
      .from("post_authors")
      .update({ accepted_at: new Date().toISOString() })
      .eq("post_id", input.postId)
      .eq("user_id", user.id)
      .is("accepted_at", null)
      .select("user_id")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!invite) return { error: "Invitation no longer exists." };

    const { error: notificationError } = await supabase.from("notifications").insert({
      user_id: post.author_id,
      type: "co_author_accepted",
      message: `${actorName} accepted your co-author invitation on: ${post.title}`,
      link: `/post/${post.slug}`,
      actor_id: user.id,
      post_id: input.postId,
      read: false,
    });
    if (!notificationError) {
      const emailResult = await sendUserEmail({
        recipientId: post.author_id,
        subject: `${actorName} accepted your Indegenius co-author invitation`,
        preview: `${actorName} accepted your co-author invitation.`,
        title: "Co-author invitation accepted",
        intro: `${actorName} accepted your co-author invitation on "${post.title}".`,
        ctaLabel: "Open post",
        ctaPath: `/post/${post.slug}`,
        idempotencyKey: `co-author-accepted:${input.postId}:${user.id}`,
      });
      logEmailResult(`co_author_accepted:${input.postId}:${post.author_id}`, emailResult);
    }
    await recordActivationEvent({
      supabase,
      event: "coauthor_invite_accepted",
      userId: user.id,
      metadata: {
        postId: input.postId,
        notificationId: input.notificationId,
      },
      source: "server_action",
      route: "/notifications",
    });
  } else {
    const { data: removedInvite, error } = await supabase
      .from("post_authors")
      .delete()
      .eq("post_id", input.postId)
      .eq("user_id", user.id)
      .select("user_id, corresponding_author")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!removedInvite) return { error: "Invitation no longer exists." };

    if (removedInvite.corresponding_author) {
      await supabase
        .from("post_authors")
        .update({ corresponding_author: true })
        .eq("post_id", input.postId)
        .eq("user_id", post.author_id);
    }

    const { error: notificationError } = await supabase.from("notifications").insert({
      user_id: post.author_id,
      type: "co_author_declined",
      message: `${actorName} declined your co-author invitation on: ${post.title}`,
      link: `/post/${post.slug}`,
      actor_id: user.id,
      post_id: input.postId,
      read: false,
    });
    if (!notificationError) {
      const emailResult = await sendUserEmail({
        recipientId: post.author_id,
        subject: `${actorName} declined your Indegenius co-author invitation`,
        preview: `${actorName} declined your co-author invitation.`,
        title: "Co-author invitation declined",
        intro: `${actorName} declined your co-author invitation on "${post.title}".`,
        ctaLabel: "Open post",
        ctaPath: `/post/${post.slug}`,
        idempotencyKey: `co-author-declined:${input.postId}:${user.id}`,
      });
      logEmailResult(`co_author_declined:${input.postId}:${post.author_id}`, emailResult);
    }
    await recordActivationEvent({
      supabase,
      event: "coauthor_invite_declined",
      userId: user.id,
      metadata: {
        postId: input.postId,
        notificationId: input.notificationId,
      },
      source: "server_action",
      route: "/notifications",
    });
  }

  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", input.notificationId)
    .eq("user_id", user.id);

  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  revalidatePath(`/post/${post.slug}`);

  return { error: null };
}
