"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import UserAvatar from "@/components/ui/UserAvatar";
import Toast from "@/components/ui/Toast";
import { setAuthorSubscription } from "@/components/ui/followActions";
import { setTopicSubscription } from "@/components/topic/topicActions";

const PAGE_SIZE = 30;

export interface ManagedAuthorSubscription {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  subscribedAt: string;
}

export interface ManagedTopicSubscription {
  topicKey: string;
  displayLabel: string;
  subscribedAt: string;
}

type ManagerTab = "authors" | "topics";
type SortOrder = "recent" | "az";

export default function SubscriptionsManagerClient({
  initialAuthors,
  initialTopics,
  emailEnabled,
  pushEnabled,
  hasPushDevice,
}: {
  initialAuthors: ManagedAuthorSubscription[];
  initialTopics: ManagedTopicSubscription[];
  emailEnabled: boolean;
  pushEnabled: boolean;
  hasPushDevice: boolean;
}) {
  const pathname = usePathname();
  const [tab, setTab] = useState<ManagerTab>("authors");
  const [authors, setAuthors] = useState(initialAuthors);
  const [topics, setTopics] = useState(initialTopics);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("recent");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    action: () => void;
  } | null>(null);

  const setRowPending = (key: string, value: boolean) => {
    setPending((current) => {
      const next = new Set(current);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const filteredAuthors = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return authors
      .filter((author) =>
        `${author.fullName ?? ""} ${author.username}`
          .toLowerCase()
          .includes(needle)
      )
      .sort((left, right) =>
        sort === "az"
          ? (left.fullName ?? left.username).localeCompare(
              right.fullName ?? right.username
            )
          : right.subscribedAt.localeCompare(left.subscribedAt)
      );
  }, [authors, query, sort]);

  const filteredTopics = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return topics
      .filter((topic) => topic.displayLabel.toLowerCase().includes(needle))
      .sort((left, right) =>
        sort === "az"
          ? left.displayLabel.localeCompare(right.displayLabel)
          : right.subscribedAt.localeCompare(left.subscribedAt)
      );
  }, [query, sort, topics]);

  const totalRows =
    tab === "authors" ? filteredAuthors.length : filteredTopics.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleAuthors = filteredAuthors.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );
  const visibleTopics = filteredTopics.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const restoreAuthor = async (author: ManagedAuthorSubscription) => {
    setRowPending(author.id, true);
    const result = await setAuthorSubscription({
      authorId: author.id,
      subscribed: true,
      pathname,
      surface: "subscriptions_manager_undo",
    });
    setRowPending(author.id, false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAuthors((current) =>
      current.some((item) => item.id === author.id)
        ? current
        : [{ ...author, subscribedAt: new Date().toISOString() }, ...current]
    );
  };

  const unsubscribeAuthor = async (author: ManagedAuthorSubscription) => {
    setRowPending(author.id, true);
    setError(null);
    const result = await setAuthorSubscription({
      authorId: author.id,
      subscribed: false,
      pathname,
      surface: "subscriptions_manager",
    });
    setRowPending(author.id, false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAuthors((current) => current.filter((item) => item.id !== author.id));
    setToast({
      message: `Unsubscribed from ${author.fullName ?? author.username}.`,
      action: () => void restoreAuthor(author),
    });
  };

  const restoreTopic = async (topic: ManagedTopicSubscription) => {
    setRowPending(topic.topicKey, true);
    const result = await setTopicSubscription({
      topic: topic.displayLabel,
      subscribed: true,
      pathname,
    });
    setRowPending(topic.topicKey, false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setTopics((current) =>
      current.some((item) => item.topicKey === topic.topicKey)
        ? current
        : [{ ...topic, subscribedAt: new Date().toISOString() }, ...current]
    );
  };

  const unsubscribeTopic = async (topic: ManagedTopicSubscription) => {
    setRowPending(topic.topicKey, true);
    setError(null);
    const result = await setTopicSubscription({
      topic: topic.displayLabel,
      subscribed: false,
      pathname,
    });
    setRowPending(topic.topicKey, false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setTopics((current) =>
      current.filter((item) => item.topicKey !== topic.topicKey)
    );
    setToast({
      message: `Unsubscribed from #${topic.displayLabel}.`,
      action: () => void restoreTopic(topic),
    });
  };

  const changeTab = (next: ManagerTab) => {
    setTab(next);
    setQuery("");
    setPage(1);
  };

  return (
    <main className="mx-auto max-w-3xl pb-20">
      <div className="mb-6">
        <p className="text-sm font-semibold text-emerald-700">Your reading</p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-ink">
          Subscriptions
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Manage the {authors.length} writer{authors.length === 1 ? "" : "s"}{" "}
          and {topics.length} topic{topics.length === 1 ? "" : "s"} you receive
          publications from.
        </p>
      </div>

      <section className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
        <h2 className="text-sm font-semibold text-ink">Delivery</h2>
        <div className="mt-2 grid gap-2 text-sm text-gray-700 sm:grid-cols-3">
          <p>
            <span className="font-semibold">In-app:</span> Always on
          </p>
          <p>
            <span className="font-semibold">Email:</span>{" "}
            {emailEnabled ? "On" : "Off"} for Articles
          </p>
          <p>
            <span className="font-semibold">Push:</span>{" "}
            {pushEnabled && hasPushDevice
              ? "On"
              : hasPushDevice
                ? "Off"
                : "No active device"}
          </p>
        </div>
        <Link
          href="/settings?tab=notifications#publication-subscriptions"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Change delivery settings
        </Link>
      </section>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <div className="flex gap-2" role="tablist" aria-label="Subscription type">
            {(["authors", "topics"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => changeTab(value)}
                className={`min-h-11 flex-1 rounded-lg px-4 text-sm font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  tab === value
                    ? "bg-emerald-brand text-white"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {value} ({value === "authors" ? authors.length : topics.length})
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="sr-only" htmlFor="subscription-search">
              Search {tab}
            </label>
            <input
              id="subscription-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={`Search ${tab}`}
              className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm focus:border-emerald-brand focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
            <label className="sr-only" htmlFor="subscription-sort">
              Sort subscriptions
            </label>
            <select
              id="subscription-sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as SortOrder);
                setPage(1);
              }}
              className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-emerald-brand focus:outline-none focus:ring-2 focus:ring-emerald-100"
            >
              <option value="recent">Recent</option>
              <option value="az">A–Z</option>
            </select>
          </div>
        </div>

        {error ? (
          <p className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div role="tabpanel" className="divide-y divide-gray-100">
          {tab === "authors"
            ? visibleAuthors.map((author) => (
                <div key={author.id} className="flex items-center gap-3 p-4">
                  <UserAvatar
                    name={author.fullName ?? author.username}
                    src={author.avatarUrl}
                    size={44}
                  />
                  <Link
                    href={`/${author.username}`}
                    className="min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    <p className="truncate text-sm font-semibold text-ink">
                      {author.fullName ?? author.username}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      @{author.username} · Since{" "}
                      {new Date(author.subscribedAt).toLocaleDateString()}
                    </p>
                  </Link>
                  <button
                    type="button"
                    disabled={pending.has(author.id)}
                    onClick={() => void unsubscribeAuthor(author)}
                    aria-label={`Unsubscribe from ${author.fullName ?? author.username}`}
                    className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:border-red-200 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-50"
                  >
                    {pending.has(author.id) ? "Removing…" : "Unsubscribe"}
                  </button>
                </div>
              ))
            : visibleTopics.map((topic) => (
                <div key={topic.topicKey} className="flex items-center gap-3 p-4">
                  <Link
                    href={`/topics/${encodeURIComponent(topic.displayLabel)}`}
                    className="min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    <p className="truncate text-sm font-semibold text-ink">
                      #{topic.displayLabel}
                    </p>
                    <p className="text-xs text-gray-500">
                      Since {new Date(topic.subscribedAt).toLocaleDateString()}
                    </p>
                  </Link>
                  <button
                    type="button"
                    disabled={pending.has(topic.topicKey)}
                    onClick={() => void unsubscribeTopic(topic)}
                    aria-label={`Unsubscribe from ${topic.displayLabel}`}
                    className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:border-red-200 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-50"
                  >
                    {pending.has(topic.topicKey) ? "Removing…" : "Unsubscribe"}
                  </button>
                </div>
              ))}
        </div>

        {totalRows === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-600">
              {query
                ? `No ${tab} match your search.`
                : `You have no subscribed ${tab} yet.`}
            </p>
            {!query ? (
              <Link
                href={tab === "authors" ? "/explore?tab=people" : "/topics"}
                className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                Explore {tab === "authors" ? "writers" : "topics"}
              </Link>
            ) : null}
          </div>
        ) : null}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-gray-100 p-4">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="min-h-11 rounded-lg border border-gray-200 px-4 text-sm font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <p className="text-sm text-gray-500">
              Page {safePage} of {pageCount}
            </p>
            <button
              type="button"
              disabled={safePage === pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
              className="min-h-11 rounded-lg border border-gray-200 px-4 text-sm font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      {toast ? (
        <Toast
          message={toast.message}
          actionLabel="Undo"
          onAction={() => {
            const action = toast.action;
            setToast(null);
            action();
          }}
          onDone={() => setToast(null)}
          durationMs={7000}
        />
      ) : null}
    </main>
  );
}
