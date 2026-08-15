import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAuthorSubscriptionsUxV2Enabled } from "@/lib/featureFlags";
import SubscriptionsManagerClient, {
  type ManagedAuthorSubscription,
  type ManagedTopicSubscription,
} from "./SubscriptionsManagerClient";
import { normalizeMyPrivateProfile } from "@/lib/profilePrivate";

export const metadata = {
  title: "Manage subscriptions",
};

export default async function SubscriptionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/subscriptions");
  if (!isAuthorSubscriptionsUxV2Enabled()) {
    redirect("/settings?tab=notifications");
  }

  const [authorsResult, topicsResult, profileResult, devicesResult] =
    await Promise.all([
      supabase
        .from("author_subscriptions")
        .select(
          "author_id, created_at, author:profiles!author_subscriptions_author_id_fkey(id, username, full_name, avatar_url)"
        )
        .eq("subscriber_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("topic_subscriptions")
        .select("topic_key, display_label, created_at")
        .eq("subscriber_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.rpc("get_my_profile_private"),
      supabase
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .limit(1),
    ]);

  const authors: ManagedAuthorSubscription[] = (
    authorsResult.data ?? []
  ).flatMap((row) => {
    const raw = row.author as
      | {
          id: string;
          username: string;
          full_name: string | null;
          avatar_url: string | null;
        }
      | Array<{
          id: string;
          username: string;
          full_name: string | null;
          avatar_url: string | null;
        }>
      | null;
    const author = Array.isArray(raw) ? raw[0] : raw;
    return author
      ? [
          {
            id: author.id,
            username: author.username,
            fullName: author.full_name,
            avatarUrl: author.avatar_url,
            subscribedAt: row.created_at as string,
          },
        ]
      : [];
  });
  const topics: ManagedTopicSubscription[] = (topicsResult.data ?? []).map(
    (row) => ({
      topicKey: row.topic_key as string,
      displayLabel: row.display_label as string,
      subscribedAt: row.created_at as string,
    })
  );
  const privateProfile = normalizeMyPrivateProfile(profileResult.data);
  const preferences =
    (privateProfile?.notification_prefs as Record<string, boolean> | null) ?? {};

  return (
    <SubscriptionsManagerClient
      initialAuthors={authors}
      initialTopics={topics}
      emailEnabled={preferences.email_author_publications !== false}
      pushEnabled={preferences.push_author_publications !== false}
      hasPushDevice={(devicesResult.data?.length ?? 0) > 0}
    />
  );
}
