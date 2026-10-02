"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { setProfileInterests } from "@/app/(main)/settings/profileActions";
import { trackActivationEvent } from "@/lib/activationEvents";
import type { DiscoverTopic } from "@/lib/discoverData";

interface ExploreTopicsGridProps {
  topics: DiscoverTopic[];
  initialInterests: string[];
  userId: string | null;
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase();
}

export default function ExploreTopicsGrid({
  topics,
  initialInterests,
  userId,
}: ExploreTopicsGridProps) {
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [interests, setInterests] = useState(initialInterests);
  const [savingTag, setSavingTag] = useState<string | null>(null);
  const interestKeys = new Set(interests.map(normalizeTag));

  const toggleTopic = async (tag: string) => {
    if (!userId || savingRef.current) return;
    savingRef.current = true;
    setError(null);

    const key = normalizeTag(tag);
    const currentlyFollowing = interestKeys.has(key);
    const nextInterests = currentlyFollowing
      ? interests.filter((item) => normalizeTag(item) !== key)
      : [...interests, tag];

    setSavingTag(tag);
    setInterests(nextInterests);

    try {
      const result = await setProfileInterests({ interests: nextInterests });

      if (!result.ok) {
        setInterests(interests);
        setError("Could not update your topics. Please try again.");
        return;
      }
      setInterests(result.data.interests);

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
      setError("Could not update your topics. Please try again.");
    } finally {
      savingRef.current = false;
      setSavingTag(null);
    }
  };

  if (topics.length === 0) {
    return (
      <div className="border-t border-divider py-10 text-center">
        <p className="text-byline font-medium text-ink">No topics yet.</p>
        <p className="mt-1 text-meta text-ink-muted">
          Published posts with tags will appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {error ? <p role="alert" className="mb-3 text-sm text-red-700">{error}</p> : null}
    <div className="grid gap-x-6 sm:grid-cols-2">
      {topics.map((topic) => {
        const isFollowing = interestKeys.has(normalizeTag(topic.tag));
        const publicationLabel = topic.count === 1 ? "publication" : "publications";

        return (
          <div
            key={topic.tag}
            className="flex min-h-[68px] items-center gap-3 border-b border-divider py-4"
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
              <span className="block truncate text-[14px] font-semibold text-ink transition-colors hover:text-emerald-ink">
                #{topic.tag}
              </span>
              <span className="mt-0.5 block text-[12px] text-ink-muted">
                {topic.count.toLocaleString()} {publicationLabel}
              </span>
            </Link>

            {userId ? (
              <button
                type="button"
                onClick={() => toggleTopic(topic.tag)}
                disabled={savingTag !== null}
                aria-busy={savingTag === topic.tag}
                aria-label={`${isFollowing ? "Unfollow" : "Follow"} ${topic.tag}`}
                aria-pressed={isFollowing}
                className={`min-h-8 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                  isFollowing
                    ? "border border-transparent bg-green-tint text-emerald-ink"
                    : "border border-card-border bg-transparent text-ink-soft hover:border-emerald-brand hover:text-emerald-ink"
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
    </div>
  );
}
