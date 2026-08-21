"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackActivationEvent } from "@/lib/activationEvents";
import type { DiscoverTopic } from "@/lib/discoverData";
import TopicSubscribeButton from "@/components/topic/TopicSubscribeButton";
import { isTopicSubscriptionsEnabled } from "@/lib/featureFlags";

interface ExploreTopicsGridProps {
  topics: DiscoverTopic[];
  initialInterests: string[];
  initialSubscribedTopicKeys: string[];
  userId: string | null;
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase();
}

export default function ExploreTopicsGrid({
  topics,
  initialInterests,
  initialSubscribedTopicKeys,
  userId,
}: ExploreTopicsGridProps) {
  const [interests, setInterests] = useState(initialInterests);
  const [savingTag, setSavingTag] = useState<string | null>(null);
  const interestKeys = new Set(interests.map(normalizeTag));
  const subscriptionsEnabled = isTopicSubscriptionsEnabled();
  const subscribedKeys = new Set(initialSubscribedTopicKeys);

  const toggleTopic = async (tag: string) => {
    if (!userId || savingTag) return;

    const key = normalizeTag(tag);
    const currentlyFollowing = interestKeys.has(key);
    const nextInterests = currentlyFollowing
      ? interests.filter((item) => normalizeTag(item) !== key)
      : [...interests, tag];

    setSavingTag(tag);
    setInterests(nextInterests);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ interests: nextInterests })
        .eq("id", userId);

      if (error) {
        setInterests(interests);
        return;
      }

      trackActivationEvent({
        event: currentlyFollowing ? "discover_item_clicked" : "interest_selected",
        metadata: {
          item: "topic_follow",
          action: currentlyFollowing ? "unfollow" : "follow",
          tag,
        },
      });
    } catch {
      setInterests(interests);
    } finally {
      setSavingTag(null);
    }
  };

  if (topics.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-card-border bg-card px-6 py-10 text-center">
        <p className="text-byline font-medium text-ink">No topics yet.</p>
        <p className="mt-1 text-meta text-ink-muted">
          Published posts with tags will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {topics.map((topic) => {
        const isFollowing = interestKeys.has(normalizeTag(topic.tag));

        return (
          <div
            key={topic.tag}
            className="flex min-h-[68px] items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-3"
          >
            <Link
              href={`/topics/${encodeURIComponent(topic.tag)}`}
              onClick={() => {
                trackActivationEvent({
                  event: "discover_item_clicked",
                  metadata: { item: "topic", tag: topic.tag },
                });
              }}
              className="min-w-0 flex-1"
            >
              <span className="block truncate text-byline font-semibold text-ink hover:text-emerald-ink">
                #{topic.tag}
              </span>
              <span className="mt-0.5 block text-meta text-ink-muted">
                {topic.count} {topic.count === 1 ? "post" : "posts"}
              </span>
            </Link>

            {subscriptionsEnabled ? (
              <TopicSubscribeButton
                topic={topic.tag}
                initialSubscribed={subscribedKeys.has(normalizeTag(topic.tag))}
                currentUserId={userId}
                compact
              />
            ) : userId ? (
              <button
                type="button"
                onClick={() => toggleTopic(topic.tag)}
                disabled={savingTag === topic.tag}
                className={`min-h-11 rounded-full px-3 text-meta font-medium transition-colors disabled:opacity-60 ${
                  isFollowing
                    ? "bg-green-tint text-emerald-ink"
                    : "border border-card-border text-ink-soft hover:border-emerald-brand hover:text-emerald-ink"
                }`}
              >
                {savingTag === topic.tag
                  ? "Saving"
                  : isFollowing
                    ? "Following"
                    : "Follow"}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
