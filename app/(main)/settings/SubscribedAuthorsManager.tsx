"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { setAuthorSubscription } from "@/components/ui/followActions";
import UserAvatar from "@/components/ui/UserAvatar";

export interface SubscribedAuthor {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export default function SubscribedAuthorsManager({
  initialAuthors,
}: {
  initialAuthors: SubscribedAuthor[];
}) {
  const pathname = usePathname();
  const [authors, setAuthors] = useState(initialAuthors);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unsubscribe = (author: SubscribedAuthor) => {
    const previous = authors;
    setAuthors((current) => current.filter((item) => item.id !== author.id));
    setError(null);

    startTransition(async () => {
      const result = await setAuthorSubscription({
        authorId: author.id,
        subscribed: false,
        pathname,
      });
      if (result.error) {
        setAuthors(previous);
        setError(result.error);
      }
    });
  };

  return (
    <section className="mb-6 border-b border-gray-100 pb-6">
      <h2 className="text-base font-semibold text-gray-900">Subscribed authors</h2>
      <p className="mt-1 text-xs leading-5 text-gray-500">
        Every publication is delivered in-app. Articles and Research may also use the enabled email and push preferences below.
      </p>

      {authors.length > 0 ? (
        <div className="mt-4 space-y-2">
          {authors.map((author) => (
            <div
              key={author.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5"
            >
              <UserAvatar
                name={author.fullName ?? author.username}
                src={author.avatarUrl}
                size={36}
              />
              <Link href={`/${author.username}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {author.fullName ?? author.username}
                </p>
                <p className="truncate text-xs text-gray-500">@{author.username}</p>
              </Link>
              <button
                type="button"
                onClick={() => unsubscribe(author)}
                disabled={isPending}
                aria-label={`Unsubscribe from ${author.fullName ?? author.username}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
              >
                Unsubscribe
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
          You have not subscribed to any authors yet.
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
