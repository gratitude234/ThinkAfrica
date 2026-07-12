"use client";

import { useEffect, useMemo, useState } from "react";
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
import { CANONICAL_TAGS, getSuggestedTags, normalizeTagValue } from "@/lib/tags";
import { trackActivationEvent } from "@/lib/activationEvents";
import { getPostQualitySummary, isLowQualityTitle } from "@/lib/postQuality";
import { composeContentWithSubtitle, inferTypeFromContent } from "./writeUtils";
import { publishPost } from "./actions";
import { WRITE_FORMATS } from "./writeConfig";

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

const POST_TYPES: PostType[] = ["blog", "essay", "policy_brief"];

const CARD_LABELS: Record<PostType, string> = {
  blog: "Quick Take",
  essay: "Essay",
  policy_brief: "Policy Brief",
  research: "Research",
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
        className="absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-3xl bg-white shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-full sm:w-[420px] sm:rounded-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-drawer-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div>
            <h2 id="publish-drawer-title" className="text-lg font-semibold text-gray-900">
              Choose a format
            </h2>
            <p className="text-xs text-gray-500">Pick the format that fits, then publish.</p>
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
                const format = WRITE_FORMATS.find((item) => item.type === type)!;
                const selected = postType === type;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleSelectFormat(type)}
                    className={`w-full rounded-xl border bg-white px-4 py-3.5 text-left transition-colors ${
                      selected
                        ? "border-emerald-brand bg-emerald-50/60 ring-2 ring-emerald-100"
                        : "border-gray-200 hover:border-emerald-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">
                        {CARD_LABELS[type]}
                      </p>
                      {type === inferredType ? (
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          Suggested
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      {format.requirementsSummary}
                    </p>
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
                label="Topics"
                value={tags}
                maxTags={5}
                helperText={`Suggested from ${CANONICAL_TAGS.length} canonical tags. Freeform tags still work for now.`}
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
