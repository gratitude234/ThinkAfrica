"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isTopicSubscriptionsEnabled } from "@/lib/featureFlags";
import {
  isSubscribableTopicValue,
  normalizeTagValue,
} from "@/lib/tags";
import type { TopicSubscriptionState } from "@/lib/publicationDelivery";

type TopicSubscriptionRpcRow = {
  topic_key: string;
  display_label: string;
  subscribed: boolean;
};

function safeRevalidate(pathname?: string | null) {
  if (
    pathname &&
    pathname.startsWith("/") &&
    !pathname.startsWith("//") &&
    pathname.length <= 2048
  ) {
    revalidatePath(pathname);
  }
}

export async function setTopicSubscription(input: {
  topic: string;
  subscribed: boolean;
  pathname?: string | null;
}): Promise<{ error: string | null } & TopicSubscriptionState> {
  const topicKey = normalizeTagValue(input.topic);
  const fallback = {
    topicKey,
    displayLabel: input.topic.trim().replace(/^#/, ""),
  };

  if (!isTopicSubscriptionsEnabled()) {
    return {
      error: "Topic subscriptions are not available yet.",
      ...fallback,
      subscribed: false,
    };
  }

  if (!isSubscribableTopicValue(topicKey)) {
    return {
      error: "Topics must contain between 1 and 80 characters.",
      ...fallback,
      subscribed: false,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "You must be signed in to subscribe to topics.",
      ...fallback,
      subscribed: false,
    };
  }

  const { data, error } = await supabase
    .rpc("set_topic_subscription", {
      p_topic: input.topic,
      p_subscribed: input.subscribed,
    })
    .single<TopicSubscriptionRpcRow>();

  if (error || !data) {
    return {
      error: error?.message ?? "Unable to update this topic subscription.",
      ...fallback,
      subscribed: !input.subscribed,
    };
  }

  safeRevalidate(input.pathname);
  revalidatePath("/");
  revalidatePath("/topics");
  revalidatePath("/explore");
  revalidatePath("/settings");

  return {
    error: null,
    topicKey: data.topic_key,
    displayLabel: data.display_label,
    subscribed: data.subscribed,
  };
}
