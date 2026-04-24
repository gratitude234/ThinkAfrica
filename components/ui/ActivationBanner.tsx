"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Props {
  userId: string;
  hasPublished: boolean;
  hasFollowed: boolean;
  hasDebated: boolean;
}

const DISMISS_KEY = "ta_nudge_dismissed";

export default function ActivationBanner({
  hasPublished,
  hasFollowed,
  hasDebated,
}: Props) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const steps = useMemo(
    () => [
      {
        label: "Write your first post",
        href: "/write",
        done: hasPublished,
      },
      {
        label: "Follow your first writer",
        href: "/leaderboard",
        done: hasFollowed,
      },
      {
        label: "Join a debate",
        href: "/debates",
        done: hasDebated,
      },
    ],
    [hasDebated, hasFollowed, hasPublished]
  );

  const doneCount = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done);

  if (doneCount === steps.length || dismissed || !nextStep) return null;

  return (
    <div className="mb-6 flex items-center gap-3 border-b border-gray-100 bg-canvas px-4 py-2 text-sm text-ink-muted sm:px-6 lg:px-8">
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-brand" />
      <span>
        {doneCount} of 3 —{" "}
        <Link href={nextStep.href} className="font-medium text-ink hover:underline">
          {nextStep.label} →
        </Link>
      </span>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        className="ml-auto text-ink-muted hover:text-ink"
        aria-label="Dismiss activation nudge"
      >
        ×
      </button>
    </div>
  );
}
