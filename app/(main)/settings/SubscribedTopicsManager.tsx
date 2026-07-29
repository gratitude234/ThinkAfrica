"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { setTopicSubscription } from "@/components/topic/topicActions";

export interface SubscribedTopic {
  topicKey: string;
  displayLabel: string;
}

export default function SubscribedTopicsManager({
  initialTopics,
}: {
  initialTopics: SubscribedTopic[];
}) {
  const pathname = usePathname();
  const [topics, setTopics] = useState(initialTopics);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unsubscribe = (topic: SubscribedTopic) => {
    const previous = topics;
    setTopics((current) =>
      current.filter((item) => item.topicKey !== topic.topicKey)
    );
    setError(null);

    startTransition(async () => {
      const result = await setTopicSubscription({
        topic: topic.displayLabel,
        subscribed: false,
        pathname,
      });
      if (result.error) {
        setTopics(previous);
        setError(result.error);
      }
    });
  };

  return (
    <section className="mb-6 border-b border-gray-100 pb-6">
      <h2 className="text-base font-semibold text-gray-900">Subscribed topics</h2>
      <p className="mt-1 text-xs leading-5 text-gray-500">
        Matching Posts, Articles, and Research are delivered in-app and appear
        in your Topics feed.
      </p>

      {topics.length > 0 ? (
        <div className="mt-4 space-y-2">
          {topics.map((topic) => (
            <div
              key={topic.topicKey}
              className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5"
            >
              <Link
                href={`/topics/${encodeURIComponent(topic.displayLabel)}`}
                className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 hover:text-emerald-brand"
              >
                #{topic.displayLabel}
              </Link>
              <button
                type="button"
                onClick={() => unsubscribe(topic)}
                disabled={isPending}
                aria-label={`Unsubscribe from ${topic.displayLabel}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
              >
                Unsubscribe
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
          You have not subscribed to any topics yet.{" "}
          <Link href="/topics" className="font-semibold text-emerald-brand hover:underline">
            Explore topics
          </Link>
        </p>
      )}

      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
