"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trackActivationEvent } from "@/lib/activationEvents";
import { APP_DOMAIN } from "@/lib/site";
import ResponseStartLink from "@/components/post/ResponseStartLink";

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
  username: string;
  relatedTarget: RelatedTarget | null;
}

type NextAction =
  | "read_related"
  | "read_latest"
  | "write_response"
  | "view_record"
  | "track_review";

export default function PublishedToast({
  postId,
  postType,
  title,
  slug,
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

  // TODO(gratitude): confirm production domain — APP_DOMAIN is a placeholder until then.
  const url = `https://${APP_DOMAIN}/post/${slug}`;
  const profileUrl = username ? `https://${APP_DOMAIN}/${username}` : "";
  const shareText = `I just published "${title}" on Indegenius`;
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
    <section className="mb-6 overflow-hidden rounded-2xl border border-emerald-100 bg-surface shadow-sm shadow-black/[0.03]">
      <div className="grid gap-0">
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-ink">
                {isLive ? "Added to your record" : "Submitted for review"}
              </p>
              <h2 className="mt-1.5 font-display text-title font-semibold leading-snug text-ink sm:text-xl">
                {isLive
                  ? "This contribution is now part of your Intellectual Record"
                  : "Your contribution is in the editorial queue"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xl leading-none text-ink-muted transition-colors hover:bg-canvas hover:text-ink-soft"
              aria-label="Dismiss publish success panel"
            >
              x
            </button>
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
            {isLive
              ? "It now appears as a dated, public contribution on your profile. Keep the loop going by reading a related idea and adding a response when you have a useful angle."
              : "Your submission is in editorial review. If accepted, its reviewed and citable evidence will appear with it in your Intellectual Record."}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
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
              <ResponseStartLink
                postId={relatedTarget.id}
                source="post_publish_success"
                onTriggerClick={() => trackNextAction("write_response")}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
              >
                Write a response
              </ResponseStartLink>
            ) : isLive ? (
              <Link
                href={username ? `/${username}#intellectual-record` : "/dashboard"}
                onClick={() => trackNextAction("view_record")}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-card-border px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-canvas"
              >
                View my record
              </Link>
            ) : (
              <Link
                href="/dashboard"
                onClick={() => trackNextAction("track_review")}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-card-border px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-canvas"
              >
                Track review status
              </Link>
            )}
          </div>
        </div>

        {isLive ? (
          <div className="border-t border-emerald-50 bg-emerald-50/55 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-ink">
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
                className="rounded-lg border border-emerald-100 bg-surface py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-emerald-50"
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={onX}
                className="rounded-lg border border-emerald-100 bg-surface py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-emerald-50"
              >
                X
              </button>
              <button
                type="button"
                onClick={onLinkedIn}
                className="rounded-lg border border-emerald-100 bg-surface py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-emerald-50"
              >
                LinkedIn
              </button>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void onCopy("post")}
                className="rounded-lg border border-emerald-100 bg-surface py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-emerald-50"
              >
                {copiedTarget === "post" ? "Post copied" : "Copy post link"}
              </button>
              {username ? (
                <button
                  type="button"
                  onClick={() => void onCopy("profile")}
                  className="rounded-lg border border-emerald-100 bg-surface py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-emerald-50"
                >
                  {copiedTarget === "profile" ? "Record link copied" : "Copy record link"}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="border-t border-emerald-50 bg-emerald-50/55 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-ink">
              What happens next
            </p>

            <ol className="mt-3 space-y-3">
              {(
                [
                  {
                    n: 1,
                    label: "Reviewers evaluate",
                    detail:
                      "2–3 subject-matter reviewers assess your argument, evidence, and structure.",
                  },
                  {
                    n: 2,
                    label: "Editor decides",
                    detail:
                      "Based on reviewer feedback, an editor accepts, requests revision, or declines.",
                  },
                  {
                    n: 3,
                    label: "You're notified",
                    detail:
                      "You'll get an in-app notification at each stage so you're never left wondering.",
                  },
                ] as const
              ).map(({ n, label, detail }) => (
                <li key={n} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-kicker font-bold text-emerald-ink">
                    {n}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-emerald-950">{label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-emerald-900/70">{detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={onWhatsApp}
                className="rounded-lg border border-emerald-100 bg-surface py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-emerald-50"
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={onX}
                className="rounded-lg border border-emerald-100 bg-surface py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-emerald-50"
              >
                X
              </button>
              <button
                type="button"
                onClick={onLinkedIn}
                className="rounded-lg border border-emerald-100 bg-surface py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-emerald-50"
              >
                LinkedIn
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
