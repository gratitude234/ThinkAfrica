"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trackActivationEvent } from "@/lib/activationEvents";

interface RelatedTarget {
  id: string;
  title: string;
  slug: string;
}

interface Props {
  postId: string;
  postType: string;
  title: string;
  slug: string;
  points: number;
  username: string;
  relatedTarget: RelatedTarget | null;
}

type NextAction =
  | "read_related"
  | "read_latest"
  | "write_response"
  | "view_dashboard";

export default function PublishedToast({
  postId,
  postType,
  title,
  slug,
  points,
  username,
  relatedTarget,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const justPublished = searchParams.get("justPublished") === "1";

  const [open, setOpen] = useState(justPublished);
  const [isLive] = useState(searchParams.get("live") === "1");
  const [copiedTarget, setCopiedTarget] = useState<"post" | "profile" | null>(
    null
  );

  useEffect(() => {
    if (!justPublished) return;
    router.replace(`/post/${slug}`, { scroll: false });
  }, [justPublished, router, slug]);

  if (!open) return null;

  const url = `https://thinkafrica.com/post/${slug}`;
  const profileUrl = username ? `https://thinkafrica.com/${username}` : "";
  const shareText = `I just published "${title}" on ThinkAfrica`;
  const primaryAction = relatedTarget
    ? {
        href: `/post/${relatedTarget.slug}`,
        label: "Read a related post",
        description: relatedTarget.title,
        action: "read_related" as const,
      }
    : {
        href: "/?tab=latest",
        label: "Read latest posts",
        description: "Find another piece to read or respond to.",
        action: "read_latest" as const,
      };

  function trackNextAction(action: NextAction) {
    trackActivationEvent({
      event: "next_action_clicked",
      metadata: {
        source: "post_publish_success",
        action,
        postId,
        postType,
        live: isLive,
      },
    });
  }

  const onWhatsApp = () =>
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${shareText} - ${url}`)}`,
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

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm shadow-black/[0.03]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                {isLive ? "Published" : "Submitted for review"}
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold leading-tight text-ink">
                {isLive
                  ? "Your first contribution is live"
                  : "Your contribution is in the editorial queue"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xl leading-none text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
              aria-label="Dismiss publish success panel"
            >
              x
            </button>
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
            {isLive
              ? `You earned +${points} points, and this piece now strengthens your public ThinkAfrica profile. Keep the loop going by reading a related idea and adding a response if you have a useful angle.`
              : "Reviewers and editors can now evaluate your submission. While you wait, read a related idea and add a response where you can move the conversation forward."}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <Link
              href={primaryAction.href}
              onClick={() => trackNextAction(primaryAction.action)}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left transition-colors hover:bg-emerald-100"
            >
              <span className="block text-sm font-semibold text-emerald-950">
                {primaryAction.label}
              </span>
              <span className="mt-1 line-clamp-2 block text-xs leading-5 text-emerald-800">
                {primaryAction.description}
              </span>
            </Link>

            {relatedTarget ? (
              <Link
                href={`/write?inResponseTo=${relatedTarget.id}&type=essay`}
                onClick={() => {
                  trackNextAction("write_response");
                  trackActivationEvent({
                    event: "response_started",
                    metadata: {
                      postId: relatedTarget.id,
                      source: "post_publish_success",
                    },
                  });
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                Write a response
              </Link>
            ) : isLive ? (
              <Link
                href={username ? `/${username}#featured-work` : "/dashboard"}
                onClick={() => trackNextAction("view_dashboard")}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                View portfolio
              </Link>
            ) : (
              <Link
                href="/dashboard"
                onClick={() => trackNextAction("view_dashboard")}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                View dashboard
              </Link>
            )}
          </div>
        </div>

        <div className="border-t border-emerald-50 bg-emerald-50/55 p-4 lg:border-l lg:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Share second
          </p>
          <p className="mt-1 text-xs leading-5 text-emerald-900/75">
            Your next best move is another interaction, but sharing still helps
            readers find your work.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onWhatsApp}
              className="rounded-lg border border-emerald-100 bg-white py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-emerald-50"
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={onX}
              className="rounded-lg border border-emerald-100 bg-white py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-emerald-50"
            >
              X
            </button>
            <button
              type="button"
              onClick={onLinkedIn}
              className="rounded-lg border border-emerald-100 bg-white py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-emerald-50"
            >
              LinkedIn
            </button>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <button
              type="button"
              onClick={() => void onCopy("post")}
              className="rounded-lg border border-emerald-100 bg-white py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-emerald-50"
            >
              {copiedTarget === "post" ? "Post copied" : "Copy post link"}
            </button>
            {username ? (
              <button
                type="button"
                onClick={() => void onCopy("profile")}
                className="rounded-lg border border-emerald-100 bg-white py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-emerald-50"
              >
                {copiedTarget === "profile" ? "Profile copied" : "Copy profile"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
