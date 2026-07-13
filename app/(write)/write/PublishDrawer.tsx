"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import TagInput from "@/components/ui/TagInput";
import type { PostReferenceRecord } from "@/lib/types";
import {
  generateExcerpt,
  isQuickTake,
  POST_TYPE_LABELS,
  type PostType,
} from "@/lib/utils";
import { getSuggestedTags, normalizeTagValue } from "@/lib/tags";
import { trackActivationEvent } from "@/lib/activationEvents";
import { getPostQualitySummary, isLowQualityTitle } from "@/lib/postQuality";
import { composeContentWithSubtitle, inferTypeFromContent } from "./writeUtils";
import { publishPost } from "./actions";

interface PublishDrawerProps {
  open: boolean;
  onClose: () => void;
  draftId: string | null;
  title: string;
  subtitle: string;
  content: string;
  wordCount: number;
  userId: string;
  initialTags?: string[];
  initialCoverImageUrl?: string;
  initialExcerpt?: string;
  initialPostType?: PostType;
  initialReferences?: PostReferenceRecord[];
  inResponseTo?: string | null;
  onMetadataChange?: (changes: { postType?: PostType; tags?: string[] }) => void;
}

const POST_TYPES: Array<"blog" | "essay" | "policy_brief"> = ["blog", "essay", "policy_brief"];

const CARD_LABELS: Record<PostType, string> = {
  blog: "Quick Take",
  essay: "Essay",
  policy_brief: "Policy Brief",
  research: "Research",
};

const CARD_META: Record<
  "blog" | "essay" | "policy_brief",
  {
    description: string;
    icon: ReactNode;
    iconWrapClass: string;
    selectedCardClass: string;
    selectedRadioClass: string;
    selectedDotClass: string;
  }
> = {
  blog: {
    description: "A short, sharp reaction — 2 to 5 minutes to read.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 3L5 14h6l-1 7 9-11h-6z" />
      </svg>
    ),
    iconWrapClass: "bg-green-tint text-emerald-brand",
    selectedCardClass: "border-emerald-brand bg-green-tint/40",
    selectedRadioClass: "border-emerald-brand",
    selectedDotClass: "bg-emerald-brand",
  },
  essay: {
    description: "A developed argument, built across sections.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M9 12h6M9 16h6M9 8h3" />
      </svg>
    ),
    iconWrapClass: "bg-gold-tint text-gold-ink",
    selectedCardClass: "border-gold-ink bg-gold-tint/40",
    selectedRadioClass: "border-gold-ink",
    selectedDotClass: "bg-gold-ink",
  },
  policy_brief: {
    description: "A structured recommendation, grounded in evidence.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="4" width="12" height="17" rx="2" />
        <path d="M9 4h6v3H9z" />
        <path d="M9 13.5l2 2 4-4.5" />
      </svg>
    ),
    iconWrapClass: "bg-purple-tint text-purple-accent",
    selectedCardClass: "border-purple-accent bg-purple-tint/40",
    selectedRadioClass: "border-purple-accent",
    selectedDotClass: "bg-purple-accent",
  },
};

interface ProfileRow {
  field_of_study: string | null;
}

interface TagRow {
  tags: string[] | null;
}

export default function PublishDrawer({
  open,
  onClose,
  draftId,
  title,
  subtitle,
  content,
  wordCount,
  userId,
  initialTags = [],
  initialCoverImageUrl = "",
  initialExcerpt = "",
  initialPostType,
  initialReferences = [],
  inResponseTo,
  onMetadataChange,
}: PublishDrawerProps) {
  const router = useRouter();
  const [postType, setPostType] = useState<PostType>(
    initialPostType ?? inferTypeFromContent(content, wordCount)
  );
  const [tags, setTags] = useState<string[]>(initialTags);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [platformTags, setPlatformTags] = useState<string[]>([]);

  const inferredType = useMemo(
    () => inferTypeFromContent(content, wordCount),
    [content, wordCount]
  );

  useEffect(() => {
    if (!open) return;

    trackActivationEvent({
      event: "publish_drawer_opened",
      metadata: { draftId, postType: initialPostType ?? inferredType, wordCount },
    });
    setPostType(initialPostType ?? inferredType);
    setTags(initialTags);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !userId) return;

    const supabase = createClient();

    Promise.all([
      supabase.from("profiles").select("field_of_study").eq("id", userId).single(),
      supabase.from("posts").select("tags").eq("status", "published").limit(500),
    ]).then(([profileResult, tagsResult]) => {
      setProfile((profileResult.data as ProfileRow | null) ?? null);

      const counts = new Map<string, number>();
      ((tagsResult.data ?? []) as TagRow[]).forEach((row) => {
        (row.tags ?? []).forEach((tag) => {
          const normalized = normalizeTagValue(tag);
          counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
        });
      });

      const ranked = Array.from(counts.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([tag]) => tag)
        .slice(0, 10);

      setPlatformTags(ranked);
    });
  }, [open, userId]);

  const suggestedTags = useMemo(
    () =>
      getSuggestedTags({
        content,
        fieldOfStudy: profile?.field_of_study,
        platformTags,
      }),
    [content, platformTags, profile?.field_of_study]
  );

  const qualitySummary = useMemo(
    () =>
      getPostQualitySummary({
        type: postType,
        status: "draft",
        title,
        excerpt: initialExcerpt,
        content,
        wordCount,
        tags,
        referenceCount: initialReferences.filter((reference) => reference.title?.trim())
          .length,
        isResponse: Boolean(inResponseTo),
      }),
    [content, initialExcerpt, initialReferences, inResponseTo, postType, tags, title, wordCount]
  );

  const blockingReason = useMemo(() => {
    if (qualitySummary.readyForSubmission) return null;
    return (
      qualitySummary.checklist.find((item) => item.blocking && !item.done)?.helper ?? null
    );
  }, [qualitySummary]);

  const publishLabel =
    postType === "policy_brief"
      ? "Submit for Editorial Review"
      : isQuickTake(postType, wordCount)
        ? "Publish Quick Take"
        : `Publish ${POST_TYPE_LABELS[postType]}`;

  if (!open) return null;

  const isInstantPublish = postType === "blog" || postType === "essay";

  const handleTagChange = (nextTags: string[]) => {
    setTags(nextTags);
    onMetadataChange?.({ tags: nextTags });
  };

  const addSuggestedTag = (tag: string) => {
    const normalized = normalizeTagValue(tag);
    if (tags.includes(normalized) || tags.length >= 5) return;
    handleTagChange([...tags, normalized]);
  };

  const handleSelectFormat = (type: PostType) => {
    setPostType(type);
    onMetadataChange?.({ postType: type });
  };

  const handlePublish = async () => {
    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }

    if (isLowQualityTitle(title)) {
      setError("Add a real title before publishing — \"Untitled draft\" and similar placeholders aren't allowed.");
      return;
    }

    if (!qualitySummary.readyForSubmission) {
      setError(blockingReason ?? "Complete the required quality checks.");
      return;
    }

    setPublishing(true);
    setError(null);

    const finalExcerpt = initialExcerpt.trim() || generateExcerpt(content, 220);
    const normalizedTags = tags.map((tag) => normalizeTagValue(tag)).filter(Boolean);
    const contentWithSubtitle = composeContentWithSubtitle(content, subtitle);
    const { error: publishError, slug: publishedPostSlug } = await publishPost({
      draftId,
      title: title.trim(),
      subtitle,
      excerpt: finalExcerpt,
      content: contentWithSubtitle,
      tags: normalizedTags,
      postType,
      coverImageUrl: initialCoverImageUrl,
      inResponseTo,
      references: initialReferences,
    });

    if (publishError || !publishedPostSlug) {
      setError(publishError ?? "Failed to publish.");
      setPublishing(false);
      return;
    }

    trackActivationEvent({
      event: "quality_check_completed",
      metadata: {
        draftId,
        postType,
        wordCount,
        referenceCount: initialReferences.filter((reference) => reference.title?.trim())
          .length,
      },
    });

    router.push(
      `/post/${publishedPostSlug}?justPublished=1&live=${isInstantPublish ? "1" : "0"}`
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label="Close publish drawer backdrop"
      />

      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-[20px] bg-white shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-full sm:w-[420px] sm:rounded-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-drawer-title"
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-gray-300 sm:hidden" />
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 pb-4 pt-3">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gray-400">
              Confirm format
            </p>
            <h2 id="publish-drawer-title" className="mt-1 text-lg font-semibold text-gray-900">
              Ready to publish
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Close publish drawer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 px-5 py-5">
            <section className="space-y-2.5">
              {POST_TYPES.map((type) => {
                const meta = CARD_META[type];
                const selected = postType === type;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleSelectFormat(type)}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-3 rounded-xl border bg-white px-3.5 py-3 text-left transition-colors ${
                      selected ? meta.selectedCardClass : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span
                      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg ${meta.iconWrapClass}`}
                    >
                      {meta.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold text-gray-900">
                        {CARD_LABELS[type]}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-gray-500">
                        {meta.description}
                      </span>
                    </span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected ? meta.selectedRadioClass : "border-gray-300"
                      }`}
                    >
                      {selected ? (
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.selectedDotClass}`} />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </section>

            <section className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Topics</p>
                <p className="mt-1 text-xs text-gray-500">
                  Pick 1 to 5 topics so the right readers find this piece.
                </p>
              </div>

              {suggestedTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {suggestedTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addSuggestedTag(tag)}
                      disabled={tags.includes(normalizeTagValue(tag))}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-emerald-brand hover:text-emerald-brand disabled:cursor-not-allowed disabled:bg-canvas disabled:text-gray-400"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              ) : null}

              <TagInput
                value={tags}
                maxTags={5}
                showLabel={false}
                placeholder="Add a topic"
                onChange={handleTagChange}
              />
            </section>
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t border-gray-100 bg-white px-5 py-4">
          {blockingReason ? (
            <p className="text-xs text-amber-700">{blockingReason}</p>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <Button
            type="button"
            size="lg"
            className="w-full"
            loading={publishing}
            disabled={!qualitySummary.readyForSubmission}
            onClick={handlePublish}
          >
            {publishLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
