"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isTopicSubscriptionsEnabled } from "@/lib/featureFlags";
import { isSubscribableTopicValue } from "@/lib/tags";
import { setTopicSubscription } from "./topicActions";

interface Props {
  topic: string;
  initialSubscribed: boolean;
  currentUserId: string | null;
  compact?: boolean;
  showConfirmation?: boolean;
  className?: string;
}

export default function TopicSubscribeButton({
  topic,
  initialSubscribed,
  currentUserId,
  compact = false,
  showConfirmation = false,
  className = "",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isTopicSubscriptionsEnabled() || !isSubscribableTopicValue(topic)) return null;

  const destination = `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`;

  const toggle = () => {
    if (!currentUserId) {
      router.push(`/login?redirectTo=${encodeURIComponent(destination)}`);
      return;
    }

    const nextSubscribed = !subscribed;
    setSubscribed(nextSubscribed);
    setError(null);
    setConfirmation(null);

    startTransition(async () => {
      const result = await setTopicSubscription({
        topic,
        subscribed: nextSubscribed,
        pathname,
      });
      if (result.error) {
        setSubscribed(!nextSubscribed);
        setError(result.error);
        return;
      }

      setSubscribed(result.subscribed);
      if (showConfirmation) {
        setConfirmation(
          result.subscribed
            ? `Subscribed to #${result.displayLabel}. New matching work will be delivered in-app.`
            : `Unsubscribed from #${result.displayLabel}.`
        );
      }
      router.refresh();
    });
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-busy={isPending || undefined}
        aria-pressed={subscribed}
        aria-label={
          subscribed
            ? `Unsubscribe from ${topic}`
            : `Subscribe to ${topic}`
        }
        className={`border font-semibold transition-colors disabled:opacity-60 ${
          compact
            ? "min-h-8 rounded-full px-3 py-1 text-xs"
            : "min-h-10 rounded-lg px-4 py-2 text-sm"
        } ${
          subscribed
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            : "border-gray-300 bg-white text-gray-700 hover:border-emerald-300 hover:text-emerald-700"
        }`}
      >
        {isPending ? "Saving…" : subscribed ? "Subscribed" : "Subscribe"}
      </button>
      {error ? (
        <p className="mt-1 max-w-xs text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {confirmation ? (
        <p className="mt-1 max-w-md text-xs leading-5 text-emerald-700" role="status">
          {confirmation}
        </p>
      ) : null}
    </div>
  );
}
