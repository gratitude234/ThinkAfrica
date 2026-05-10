"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Props {
  title: string;
  slug: string;
  points: number;
  username: string;
}

export default function PublishedToast({
  title,
  slug,
  points,
  username,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const justPublished = searchParams.get("justPublished") === "1";
  const isLive = searchParams.get("live") === "1";

  const [open, setOpen] = useState(justPublished);
  const [expanded, setExpanded] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<"post" | "profile" | null>(
    null
  );

  useEffect(() => {
    if (!justPublished) return;
    router.replace(`/post/${slug}`, { scroll: false });
  }, [justPublished, router, slug]);

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => setOpen(false), 45_000);
    return () => clearTimeout(timeout);
  }, [open]);

  if (!open) return null;

  const url = `https://thinkafrica.com/post/${slug}`;
  const profileUrl = username ? `https://thinkafrica.com/${username}` : "";
  const shareText = `I just published "${title}" on ThinkAfrica`;

  const onWhatsApp = () =>
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${shareText} — ${url}`)}`,
      "_blank",
      "noopener,noreferrer"
    );
  const onX = () =>
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        shareText
      )}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer"
    );
  const onLinkedIn = () =>
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
        url
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
  const onCopy = async (target: "post" | "profile") => {
    const nextUrl = target === "post" ? url : profileUrl;
    if (!nextUrl) return;

    await navigator.clipboard.writeText(nextUrl);
    setCopiedTarget(target);
    setTimeout(() => setCopiedTarget(null), 2000);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] left-4 right-4 z-50 flex items-center justify-center gap-2 rounded-full bg-emerald-brand px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-emerald-600 sm:bottom-6 sm:left-auto sm:right-6"
      >
        ✓ {isLive ? "Published" : "Submitted"} · Share →
      </button>
    );
  }

  return (
    <div className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-2xl border border-gray-200 bg-white p-5 shadow-xl sm:bottom-6 sm:left-auto sm:right-6 sm:w-[320px]">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-sm font-semibold text-gray-900">
          {isLive ? "Share your post" : "Awaiting review"}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-gray-400 transition-colors hover:text-gray-600"
        >
          ×
        </button>
      </div>

      {isLive ? (
        <>
          <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-950">
              Added to your academic portfolio
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-700">
              You earned +{points} points. This publication now strengthens
              your public ThinkAfrica profile.
            </p>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onWhatsApp}
              className="rounded-lg border border-gray-200 py-2 text-xs font-medium transition-colors hover:bg-canvas"
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={onX}
              className="rounded-lg border border-gray-200 py-2 text-xs font-medium transition-colors hover:bg-canvas"
            >
              X
            </button>
            <button
              type="button"
              onClick={onLinkedIn}
              className="rounded-lg border border-gray-200 py-2 text-xs font-medium transition-colors hover:bg-canvas"
            >
              LinkedIn
            </button>
          </div>
          <button
            type="button"
            onClick={() => void onCopy("post")}
            className="mb-3 w-full rounded-lg border border-gray-200 py-2 text-xs font-medium transition-colors hover:bg-canvas"
          >
            {copiedTarget === "post" ? "Post copied!" : "Copy post link"}
          </button>

          {username ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void onCopy("profile")}
                className="rounded-lg border border-gray-200 py-2 text-xs font-medium transition-colors hover:bg-canvas"
              >
                {copiedTarget === "profile" ? "Profile copied!" : "Share profile"}
              </button>
              <Link
                href={`/${username}#featured-work`}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-brand px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
              >
                Manage portfolio
              </Link>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-xs leading-5 text-gray-500">
            We&apos;ll notify you when it goes live. Usually within 48 hours.
            Once accepted, this publication will strengthen your academic
            portfolio.
          </p>
          {username ? (
            <Link
              href={`/${username}`}
              className="mt-3 inline-flex text-xs font-medium text-emerald-brand"
            >
              View your profile
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}
