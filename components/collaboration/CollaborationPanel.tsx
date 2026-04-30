"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { findOrCreateConversation } from "@/lib/messaging";
import { trackActivationEvent } from "@/lib/activationEvents";
import type { CollaborationSummary } from "@/lib/collaboration";

export default function CollaborationPanel({
  summary,
  authorName,
}: {
  summary: CollaborationSummary;
  authorName: string;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(summary.isFollowingAuthor);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  useEffect(() => {
    trackActivationEvent({
      event: "collaboration_panel_viewed",
      metadata: {
        postId: summary.postId,
        responseCount: summary.responseCount,
        coauthorCount: summary.coauthorCount,
      },
    });
  }, [summary.coauthorCount, summary.postId, summary.responseCount]);

  const trackClick = (action: string) => {
    trackActivationEvent({
      event: "collaboration_cta_clicked",
      metadata: {
        postId: summary.postId,
        action,
      },
    });
  };

  const handleFollow = async () => {
    trackClick("follow_author");
    if (!summary.viewerId || !summary.authorId) {
      router.push(summary.signInHref);
      return;
    }

    if (!summary.canFollow || followLoading) return;

    setFollowLoading(true);
    const supabase = createClient();
    if (following) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", summary.viewerId)
        .eq("following_id", summary.authorId);
    } else {
      await supabase.from("follows").insert({
        follower_id: summary.viewerId,
        following_id: summary.authorId,
      });
      trackActivationEvent({
        event: "writer_followed",
        metadata: { followingId: summary.authorId },
      });
    }

    setFollowing((current) => !current);
    setFollowLoading(false);
  };

  const handleMessage = async () => {
    trackClick("message_author");
    setMessageError(null);

    if (!summary.viewerId || !summary.authorId) {
      router.push(summary.signInHref);
      return;
    }

    if (!summary.canMessage) {
      setMessageError(summary.messageReason ?? "Messaging is not available for this author.");
      return;
    }

    setMessageLoading(true);
    try {
      const supabase = createClient();
      const conversationId = await findOrCreateConversation(
        supabase,
        summary.viewerId,
        summary.authorId
      );

      if (!conversationId) {
        setMessageError("Unable to start this conversation.");
        setMessageLoading(false);
        return;
      }

      trackActivationEvent({
        event: "message_started",
        metadata: {
          postId: summary.postId,
          authorId: summary.authorId,
          source: "collaboration_panel",
        },
      });
      router.push(`/messages/${conversationId}`);
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : "Unable to start this conversation."
      );
      setMessageLoading(false);
    }
  };

  const responseHref = summary.viewerId ? summary.responseHref : summary.signInHref;

  return (
    <section className="mb-8 rounded-xl border border-emerald-100 bg-emerald-50 px-5 py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Collaborate around this idea
          </p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">
            Build from {authorName}&apos;s argument
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-emerald-900">
            Respond publicly, follow the writer, or start a verified conversation
            when there is a concrete academic reason to connect.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center sm:min-w-[160px]">
          <div className="rounded-lg bg-white px-3 py-2">
            <p className="text-lg font-bold text-gray-900">{summary.responseCount}</p>
            <p className="text-[11px] text-gray-500">responses</p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2">
            <p className="text-lg font-bold text-gray-900">{summary.coauthorCount}</p>
            <p className="text-[11px] text-gray-500">coauthors</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={responseHref}
          onClick={() => {
            trackClick("write_response");
            if (summary.viewerId) {
              trackActivationEvent({
                event: "response_started",
                metadata: {
                  postId: summary.postId,
                  source: "collaboration_panel",
                },
              });
            }
          }}
          className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
        >
          Write a response
        </Link>
        <button
          type="button"
          onClick={handleFollow}
          disabled={followLoading || summary.isOwnPost}
          className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {followLoading ? "Saving..." : following ? "Following" : "Follow author"}
        </button>
        <button
          type="button"
          onClick={handleMessage}
          disabled={messageLoading || summary.isOwnPost}
          className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {messageLoading ? "Opening..." : "Message author"}
        </button>
        {summary.responseCount > 0 ? (
          <Link
            href={summary.responsesHref}
            onClick={() => {
              trackClick("view_responses");
              trackActivationEvent({
                event: "response_thread_opened",
                metadata: {
                  postId: summary.postId,
                  responseCount: summary.responseCount,
                },
              });
            }}
            className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:border-emerald-300"
          >
            View related responses
          </Link>
        ) : null}
      </div>

      {messageError ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {messageError}
        </p>
      ) : null}

      {!summary.viewerId ? (
        <p className="mt-3 text-xs text-emerald-900">
          Reading as a guest. Sign in to follow, respond, or message verified writers.
        </p>
      ) : null}
    </section>
  );
}
