"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import TagInput from "@/components/ui/TagInput";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
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
import { inferTypeFromContent } from "./writeUtils";
import { publishPost } from "./actions";

interface PublishDrawerProps {
  open: boolean;
  onClose: () => void;
  draftId: string | null;
  title: string;
  content: string;
  wordCount: number;
  userId: string;
  initialTags?: string[];
  initialCoverImageUrl?: string;
  initialExcerpt?: string;
  initialPostType?: PostType;
  initialReferences?: PostReferenceRecord[];
  inResponseTo?: string | null;
  onMetadataChange?: (changes: {
    postType?: PostType;
    tags?: string[];
    coverImageUrl?: string;
  }) => void;
  coverUploading: boolean;
  onCoverUploadingChange: (uploading: boolean) => void;
}

const POST_TYPES: Array<"blog" | "essay" | "policy_brief"> = ["blog", "essay", "policy_brief"];

const SUGGESTED_TOPICS = [
  "Governance",
  "Economics",
  "Education Policy",
  "Climate & Environment",
  "Public Health",
  "Press Freedom",
  "Technology",
  "Youth & Employment",
];

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
    dotClass: string;
    selectedCardClass: string;
    checkClass: string;
  }
> = {
  blog: {
    description: "Short-form take, under 500 words.",
    dotClass: "bg-emerald-brand",
    selectedCardClass: "border-emerald-brand bg-green-tint/70",
    checkClass: "bg-emerald-brand",
  },
  essay: {
    description: "Long-form argument, 400+ words.",
    dotClass: "bg-gold-ink",
    selectedCardClass: "border-gold-ink bg-gold-tint/70",
    checkClass: "bg-gold-ink",
  },
  policy_brief: {
    description: "Structured analysis, editor-reviewed.",
    dotClass: "bg-purple-accent",
    selectedCardClass: "border-purple-accent bg-purple-tint/70",
    checkClass: "bg-purple-accent",
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
  coverUploading,
  onCoverUploadingChange,
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

  const topicSuggestions = useMemo(() => {
    const seen = new Set<string>();

    return [...SUGGESTED_TOPICS, ...suggestedTags].filter((tag) => {
      const normalized = normalizeTagValue(tag);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }).slice(0, 8);
  }, [suggestedTags]);

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

  const warnings = useMemo(
    () =>
      qualitySummary.checklist
        .filter((item) => item.key !== "title" && item.blocking && !item.done)
        .map((item) => item.helper),
    [qualitySummary]
  );

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

  const toggleSuggestedTag = (tag: string) => {
    const normalized = normalizeTagValue(tag);
    if (tags.includes(normalized)) {
      handleTagChange(tags.filter((value) => value !== normalized));
      return;
    }
    if (tags.length >= 5) return;
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
      setError(warnings[0] ?? "Complete the required quality checks.");
      return;
    }

    setPublishing(true);
    setError(null);

    const finalExcerpt = initialExcerpt.trim() || generateExcerpt(content, 220);
    const normalizedTags = tags.map((tag) => normalizeTagValue(tag)).filter(Boolean);
    const { error: publishError, slug: publishedPostSlug } = await publishPost({
      draftId,
      title: title.trim(),
      excerpt: finalExcerpt,
      content,
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
    <div className="fixed inset-0 z-50 animate-fade-in bg-black/[0.45] lg:flex lg:items-center lg:justify-center lg:p-8">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label="Close publish drawer backdrop"
      />

      <div
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] w-full max-w-[560px] animate-slide-up overflow-y-auto rounded-t-[20px] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2.5 shadow-2xl lg:relative lg:inset-auto lg:max-h-[86vh] lg:max-w-[720px] lg:animate-create-menu-in lg:rounded-[24px] lg:px-8 lg:pb-8 lg:pt-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-drawer-title"
      >
        <div className="mx-auto mb-[18px] mt-1.5 h-1 w-9 rounded-full bg-gray-300 lg:hidden" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 hidden h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:flex"
          aria-label="Close publish dialog"
        >
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        <h2
          id="publish-drawer-title"
          className="mb-[18px] font-display text-[22px] font-semibold leading-tight text-ink lg:pr-12 lg:text-[28px]"
        >
          Ready to publish.
        </h2>

        <section className="mb-5">
          <p className="mb-2.5 text-[13px] font-semibold text-ink">Cover image</p>
          <CoverImageUploader
            initialUrl={initialCoverImageUrl}
            onUpload={(url) => onMetadataChange?.({ coverImageUrl: url })}
            onRemove={() => onMetadataChange?.({ coverImageUrl: "" })}
            onUploadingChange={onCoverUploadingChange}
          />
        </section>

        <section className="mb-5 grid grid-cols-3 gap-2.5">
          {POST_TYPES.map((type) => {
            const meta = CARD_META[type];
            const selected = postType === type;

            return (
              <button
                key={type}
                type="button"
                onClick={() => handleSelectFormat(type)}
                aria-pressed={selected}
                className={`relative flex min-h-[112px] flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition-colors lg:min-h-[128px] lg:px-4 lg:py-4 ${
                  selected
                    ? meta.selectedCardClass
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <span className={`mb-0.5 h-2 w-2 rounded-full ${meta.dotClass}`} />
                <span className="text-[13.5px] font-semibold leading-5 text-ink">
                  {CARD_LABELS[type]}
                </span>
                <span className="text-[11.5px] leading-[1.4] text-gray-500">
                  {meta.description}
                </span>
                {selected ? (
                  <span
                    className={`absolute right-2.5 top-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-white ${meta.checkClass}`}
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                ) : null}
              </button>
            );
          })}
        </section>

        <div className="mb-[18px] h-px bg-gray-100" />

        <section className="mb-5">
          <div className="mb-2.5 flex items-baseline justify-between">
            <p className="text-[13px] font-semibold text-ink">Topics</p>
            <span className="text-xs text-gray-400">{tags.length}/5</span>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {topicSuggestions.map((tag) => {
              const normalized = normalizeTagValue(tag);
              const selected = tags.includes(normalized);
              const disabled = !selected && tags.length >= 5;

              return (
                <button
                  key={normalized}
                  type="button"
                  onClick={() => toggleSuggestedTag(tag)}
                  disabled={disabled}
                  aria-pressed={selected}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    selected
                      ? "border-emerald-brand bg-green-tint text-emerald-brand"
                      : "border-gray-200 bg-white text-gray-700 hover:border-emerald-brand hover:text-emerald-brand disabled:cursor-not-allowed disabled:opacity-45"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          <TagInput
            value={tags}
            maxTags={5}
            showLabel={false}
            placeholder={tags.length >= 5 ? "Topic limit reached" : "Add a topic"}
            onChange={handleTagChange}
          />
        </section>

        <div className="space-y-3">
          {warnings.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3.5 py-3">
              {warnings.map((warning) => (
                <div key={warning} className="flex items-start gap-2">
                  <svg
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 3.5L2.5 20h19zM12 9.5v5M12 17h.01"
                    />
                  </svg>
                  <span className="text-xs leading-relaxed text-amber-800">{warning}</span>
                </div>
              ))}
            </div>
          ) : null}

          {postType === "policy_brief" ? (
            <div className="rounded-[10px] bg-purple-tint px-3.5 py-3">
              <span className="text-[12.5px] leading-relaxed text-purple-accent">
                Policy briefs are reviewed by an editor before they go live. You&apos;ll be
                notified once review is complete.
              </span>
            </div>
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
            disabled={!qualitySummary.readyForSubmission || coverUploading}
            onClick={handlePublish}
          >
            {publishLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
