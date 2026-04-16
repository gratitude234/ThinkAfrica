"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/ui/Toast";

interface TopicEntry {
  tag: string;
  count: number;
}

interface TopicSection {
  category: string;
  entries: TopicEntry[];
}

interface TopicsClientProps {
  sections: TopicSection[];
  initialInterests: string[];
  userId: string | null;
}

export default function TopicsClient({
  sections,
  initialInterests,
  userId,
}: TopicsClientProps) {
  const [interests, setInterests] = useState<string[]>(initialInterests);
  const [savingTag, setSavingTag] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toggleTopic = async (tag: string) => {
    if (!userId || savingTag) return;

    const currentlyFollowing = interests.includes(tag);
    const nextInterests = currentlyFollowing
      ? interests.filter((item) => item !== tag)
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
        setToastMessage(`Failed to update topics: ${error.message}`);
      }
    } catch {
      setInterests(interests);
      setToastMessage("Failed to update topics. Please try again.");
    } finally {
      setSavingTag(null);
    }
  };

  return (
    <>
      {sections.map((section) => (
        <section key={section.category} className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            {section.category}
          </h2>
          <div className="flex flex-wrap gap-2">
            {section.entries.map((entry) => {
              const isFollowing = interests.includes(entry.tag);

              return (
                <div
                  key={entry.tag}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm"
                >
                  <Link
                    href={`/topics/${encodeURIComponent(entry.tag)}`}
                    className="inline-flex items-center gap-2 text-sm text-gray-700 transition-colors hover:text-emerald-700"
                  >
                    <span>#{entry.tag}</span>
                    <span className="text-xs text-gray-400">{entry.count}</span>
                  </Link>

                  {userId ? (
                    <button
                      type="button"
                      onClick={() => toggleTopic(entry.tag)}
                      disabled={savingTag === entry.tag}
                      className={`rounded-full px-3 py-1 text-xs transition-colors ${
                        isFollowing
                          ? "bg-emerald-100 text-emerald-700"
                          : "border border-gray-300 text-gray-600"
                      } ${savingTag === entry.tag ? "opacity-60" : ""}`}
                    >
                      {savingTag === entry.tag
                        ? "Saving..."
                        : isFollowing
                          ? "Following ✓"
                          : "Follow +"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {toastMessage ? (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      ) : null}
    </>
  );
}
