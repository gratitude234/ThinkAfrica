"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import slugify from "slugify";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import TagInput from "@/components/ui/TagInput";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import type { PostReferenceRecord } from "@/lib/types";
import {
  generateExcerpt,
  isQuickTake,
  MIN_WORD_COUNTS,
  POST_TYPE_INTENTS,
  POST_TYPE_LABELS,
  type PostType,
} from "@/lib/utils";
import {
  CANONICAL_TAGS,
  getSuggestedTags,
  normalizeTagValue,
} from "@/lib/tags";
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
  onMetadataChange?: (changes: {
    postType?: PostType;
    tags?: string[];
    coverImageUrl?: string;
    excerpt?: string;
  }) => void;
}

const POST_TYPES: PostType[] = ["blog", "essay", "policy_brief", "research"];

interface ProfileRow {
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
}

interface TagRow {
  tags: string[] | null;
}

interface CoAuthorProfile {
  id: string;
  username: string;
  full_name: string | null;
}

function readTimeFromText(text: string) {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 200));
}

function getSoftWarning(
  postType: PostType,
  inferredType: PostType,
  wordCount: number
): {
  message: string;
  actionLabel?: string;
  actionType?: PostType;
} | null {
  const minWords = MIN_WORD_COUNTS[postType];
  if (wordCount >= minWords) return null;

  if (postType === "research") {
    return {
      message:
        "Research pieces are usually longer. Consider saving this as an Essay or Policy Brief.",
      actionLabel:
        inferredType !== "research"
          ? `Switch to ${POST_TYPE_LABELS[inferredType]}`
          : undefined,
      actionType: inferredType !== "research" ? inferredType : undefined,
    };
  }

  if (postType === "policy_brief") {
    return {
      message:
        "Policy briefs usually need more structure and depth. You can still publish this now.",
      actionLabel:
        inferredType !== "policy_brief"
          ? `Switch to ${POST_TYPE_LABELS[inferredType]}`
          : undefined,
      actionType: inferredType !== "policy_brief" ? inferredType : undefined,
    };
  }

  if (postType === "essay") {
    return {
      message:
        "Essays are usually a bit longer. If this is a shorter thought, a Blog may fit better.",
      actionLabel:
        inferredType !== "essay"
          ? `Switch to ${POST_TYPE_LABELS[inferredType]}`
          : undefined,
      actionType: inferredType !== "essay" ? inferredType : undefined,
    };
  }

  if (wordCount < minWords) {
    return {
      message:
        "Quick takes usually need at least 50 words so the point is clear. You can still publish now.",
    };
  }

  return null;
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
  onMetadataChange,
}: PublishDrawerProps) {
  const router = useRouter();
  const [postType, setPostType] = useState<PostType>(
    initialPostType ?? inferTypeFromContent(content, wordCount)
  );
  const [tags, setTags] = useState<string[]>(initialTags);
  const [coverImageUrl, setCoverImageUrl] = useState(initialCoverImageUrl);
  const [excerpt, setExcerpt] = useState(
    initialExcerpt || generateExcerpt(content, 220)
  );
  const [customSlug, setCustomSlug] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [platformTags, setPlatformTags] = useState<string[]>([]);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showRefine, setShowRefine] = useState(false);
  const [coAuthors, setCoAuthors] = useState<CoAuthorProfile[]>([]);
  const [correspondingAuthorId, setCorrespondingAuthorId] = useState<string>(userId);
  const [coAuthorQuery, setCoAuthorQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CoAuthorProfile[]>([]);

  const inferredType = useMemo(
    () => inferTypeFromContent(content, wordCount),
    [content, wordCount]
  );

  useEffect(() => {
    if (!open) return;

    setPostType(initialPostType ?? inferTypeFromContent(content, wordCount));
    setTags(initialTags);
    setCoverImageUrl(initialCoverImageUrl);
    setExcerpt(initialExcerpt || generateExcerpt(content, 220));
    setCustomSlug("");
    setError(null);
    setShowTypePicker(false);
    setShowRefine(false);
    setCoAuthors([]);
    setCorrespondingAuthorId(userId);
    setCoAuthorQuery("");
    setSearchResults([]);
  }, [
    open,
    initialPostType,
    content,
    wordCount,
    initialTags,
    initialCoverImageUrl,
    initialExcerpt,
    userId,
  ]);

  useEffect(() => {
    if (!open || !userId) return;

    const supabase = createClient();

    Promise.all([
      supabase
        .from("profiles")
        .select("full_name, university, field_of_study")
        .eq("id", userId)
        .single(),
      supabase
        .from("posts")
        .select("tags")
        .eq("status", "published")
        .limit(500),
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

  useEffect(() => {
    if (!open || !coAuthorQuery.trim() || coAuthors.length >= 5) {
      setSearchResults([]);
      return;
    }

    const supabase = createClient();
    const timer = setTimeout(() => {
      supabase
        .from("profiles")
        .select("id, username, full_name")
        .ilike("username", `%${coAuthorQuery.trim()}%`)
        .neq("id", userId)
        .limit(5)
        .then(({ data }) => {
          const existing = new Set(coAuthors.map((coAuthor) => coAuthor.id));
          setSearchResults(
            ((data as CoAuthorProfile[] | null) ?? []).filter(
              (profile) => !existing.has(profile.id)
            )
          );
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [coAuthorQuery, coAuthors, open, userId]);

  const suggestedTags = useMemo(
    () =>
      getSuggestedTags({
        content,
        fieldOfStudy: profile?.field_of_study,
        platformTags,
      }),
    [content, platformTags, profile?.field_of_study]
  );

  const publishLabel = useMemo(() => {
    if (isQuickTake(postType, wordCount)) {
      return "Publish Quick Take";
    }

    if (postType === "research" || postType === "policy_brief") {
      return "Submit for Editorial Review";
    }

    return `Publish ${POST_TYPE_LABELS[postType]}`;
  }, [postType, wordCount]);

  const softWarning = useMemo(
    () => getSoftWarning(postType, inferredType, wordCount),
    [inferredType, postType, wordCount]
  );

  if (!open) return null;

  const isInstantPublish = postType === "blog" || postType === "essay";
  const authorName = profile?.full_name ?? "You";
  const authorUniversity = profile?.university ?? "ThinkAfrika";
  const normalizedSlug = customSlug.trim()
    ? slugify(customSlug.trim(), { lower: true, strict: true })
    : "";

  const handleTagChange = (nextTags: string[]) => {
    setTags(nextTags);
    onMetadataChange?.({ tags: nextTags });
  };

  const addSuggestedTag = (tag: string) => {
    const normalized = normalizeTagValue(tag);
    if (tags.includes(normalized) || tags.length >= 5) return;
    handleTagChange([...tags, normalized]);
  };

  const handlePublish = async () => {
    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }

    if (tags.length === 0) {
      setError("Add at least one tag before publishing.");
      return;
    }

    if (
      (postType === "research" || postType === "policy_brief") &&
      initialReferences.filter((reference) => reference.title?.trim()).length === 0
    ) {
      setError("Research and policy briefs need at least one structured reference.");
      return;
    }

    setPublishing(true);
    setError(null);

    const finalExcerpt = excerpt.trim() || generateExcerpt(content, 220);
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
      coverImageUrl,
      customSlug: normalizedSlug,
      coAuthors: coAuthors.map((coAuthor, index) => ({
        user_id: coAuthor.id,
        display_order: index + 1,
        corresponding_author: correspondingAuthorId === coAuthor.id,
      })),
      references: initialReferences,
    });

    if (publishError || !publishedPostSlug) {
      setError(publishError ?? "Failed to publish.");
      setPublishing(false);
      return;
    }

    router.push(
      `/post/${publishedPostSlug}?justPublished=1&live=${
        isInstantPublish ? "1" : "0"
      }`
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
        className="absolute right-0 top-0 h-full w-full overflow-y-auto bg-white shadow-2xl sm:w-[440px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-drawer-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div>
            <h2
              id="publish-drawer-title"
              className="text-lg font-semibold text-gray-900"
            >
              Ready to publish?
            </h2>
            <p className="text-xs text-gray-400">
              Choose the essentials now. Refine the rest only if you want to.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Close publish drawer"
          >
            ×
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Authorship</p>
              <p className="mt-1 text-xs text-gray-500">
                Set author order, invite collaborators, and choose the corresponding author.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-gray-200 bg-canvas p-3">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{authorName}</p>
                  <p className="text-xs text-gray-500">Lead author</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                  <input
                    type="radio"
                    name="corresponding-author"
                    checked={correspondingAuthorId === userId}
                    onChange={() => setCorrespondingAuthorId(userId)}
                    className="h-4 w-4 border-gray-300 text-emerald-brand focus:ring-emerald-brand"
                  />
                  Corresponding
                </label>
              </div>
            </div>

            <input
              type="text"
              value={coAuthorQuery}
              onChange={(event) => setCoAuthorQuery(event.target.value)}
              placeholder="Search by username"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />

            {searchResults.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-gray-200 bg-canvas p-3">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => {
                      setCoAuthors((current) => [...current, result].slice(0, 5));
                      setCoAuthorQuery("");
                      setSearchResults([]);
                    }}
                    className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-sm text-gray-700 hover:border-emerald-200 hover:bg-emerald-50"
                  >
                    <span>
                      @{result.username}
                      {result.full_name ? ` · ${result.full_name}` : ""}
                    </span>
                    <span className="text-emerald-brand">Add</span>
                  </button>
                ))}
              </div>
            ) : null}

            {coAuthors.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {coAuthors.map((coAuthor) => (
                  <span
                    key={coAuthor.id}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                  >
                    @{coAuthor.username}
                    <button
                      type="button"
                      onClick={() =>
                        setCoAuthors((current) =>
                          current.filter((item) => item.id !== coAuthor.id)
                        )
                      }
                      className="text-emerald-600 hover:text-emerald-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {coAuthors.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-gray-200 bg-canvas p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Author order and corresponding author
                </p>
                {coAuthors.map((coAuthor, index) => (
                  <div
                    key={`${coAuthor.id}-controls`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">
                        {index + 2}. {coAuthor.full_name ?? `@${coAuthor.username}`}
                      </p>
                      <p className="text-xs text-gray-500">@{coAuthor.username}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() =>
                          setCoAuthors((current) => {
                            const next = [...current];
                            const [item] = next.splice(index, 1);
                            next.splice(index - 1, 0, item);
                            return next;
                          })
                        }
                        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === coAuthors.length - 1}
                        onClick={() =>
                          setCoAuthors((current) => {
                            const next = [...current];
                            const [item] = next.splice(index, 1);
                            next.splice(index + 1, 0, item);
                            return next;
                          })
                        }
                        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                        <input
                          type="radio"
                          name="corresponding-author"
                          checked={correspondingAuthorId === coAuthor.id}
                          onChange={() => setCorrespondingAuthorId(coAuthor.id)}
                          className="h-4 w-4 border-gray-300 text-emerald-brand focus:ring-emerald-brand"
                        />
                        Corresponding
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-canvas px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Publishing as:{" "}
                  <span className="text-emerald-brand">
                    {isQuickTake(postType, wordCount)
                      ? "Quick Take"
                      : POST_TYPE_LABELS[postType]}
                  </span>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {POST_TYPE_INTENTS[postType]}
                </p>
                {postType === inferredType ? (
                  <p className="mt-1 text-[11px] text-gray-400">
                    Suggested from your {wordCount.toLocaleString()} words.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setShowTypePicker((current) => !current)}
                className="text-sm font-medium text-emerald-brand hover:underline"
              >
                {showTypePicker ? "Hide" : "Change"}
              </button>
            </div>

            {showTypePicker ? (
              <div className="space-y-2">
                {POST_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setPostType(type);
                      setShowTypePicker(false);
                      onMetadataChange?.({ postType: type });
                    }}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      postType === type
                        ? "border-emerald-brand bg-emerald-50"
                        : "border-gray-200 hover:border-emerald-300"
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {POST_TYPE_LABELS[type]}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {POST_TYPE_INTENTS[type]}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Tags</p>
              <p className="mt-1 text-xs text-gray-500">
                Pick 1 to 5 topics so the right readers find this piece.
              </p>
            </div>

            {suggestedTags.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Suggested tags
                </p>
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

          <section className="rounded-xl border border-gray-200">
            <button
              type="button"
              onClick={() => setShowRefine((current) => !current)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">Refine</p>
                <p className="mt-1 text-xs text-gray-500">
                  Cover image, feed summary, and a custom slug are optional.
                </p>
              </div>
              <span className="text-sm font-medium text-emerald-brand">
                {showRefine ? "Hide" : "Open"}
              </span>
            </button>

            {showRefine ? (
              <div className="space-y-5 border-t border-gray-100 px-4 py-4">
                <section className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Cover image (optional)
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      If not provided, we&apos;ll show a branded card with your title.
                    </p>
                  </div>

                  <CoverImageUploader
                    initialUrl={coverImageUrl}
                    onUpload={(url) => {
                      setCoverImageUrl(url);
                      onMetadataChange?.({ coverImageUrl: url });
                    }}
                    onRemove={() => {
                      setCoverImageUrl("");
                      onMetadataChange?.({ coverImageUrl: "" });
                    }}
                  />
                </section>

                <section className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Feed summary</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Auto-generated. Edit only if you want a sharper preview.
                    </p>
                  </div>
                  <textarea
                    value={excerpt}
                    onChange={(event) => {
                      setExcerpt(event.target.value);
                      onMetadataChange?.({ excerpt: event.target.value });
                    }}
                    rows={4}
                    maxLength={220}
                    className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                  />
                </section>

                <section className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Custom slug</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Optional. Leave blank to use a generated URL.
                    </p>
                  </div>
                  <input
                    type="text"
                    value={customSlug}
                    onChange={(event) => setCustomSlug(event.target.value)}
                    placeholder="why-nigeria-needs-judicial-reform"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                  />
                </section>
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Preview</p>
              <p className="mt-1 text-xs text-gray-500">
                This is how the card will look in the feed.
              </p>
            </div>

            <article className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="relative aspect-[16/9] w-full overflow-hidden">
                {coverImageUrl ? (
                  <img
                    src={coverImageUrl}
                    alt={title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100">
                    <span className="text-sm font-semibold uppercase tracking-widest text-emerald-600/80">
                      {isQuickTake(postType, wordCount)
                        ? "Quick Take"
                        : POST_TYPE_LABELS[postType]}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <Badge type={postType} wordCount={wordCount} />
                  <span className="text-xs text-gray-400">
                    {readTimeFromText(excerpt || title || "draft")} min read
                  </span>
                </div>

                <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-gray-900">
                  {title || "Untitled draft"}
                </h3>
                {excerpt.trim() ? (
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-500">
                    {excerpt}
                  </p>
                ) : null}

                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-sm font-medium text-gray-900">{authorName}</p>
                  <p className="text-xs text-gray-400">{authorUniversity}</p>
                </div>
              </div>
            </article>
          </section>

          <p className="text-sm text-gray-500">
            {isInstantPublish
              ? "Publishes instantly."
              : "Enters formal editorial review. Reviewer recommendations inform the outcome, but publication only happens after a final editor decision."}
          </p>

          {softWarning ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p>{softWarning.message}</p>
              {softWarning.actionLabel && softWarning.actionType ? (
                <button
                  type="button"
                  onClick={() => {
                    setPostType(softWarning.actionType!);
                    onMetadataChange?.({ postType: softWarning.actionType! });
                  }}
                  className="mt-2 font-medium text-amber-900 underline"
                >
                  {softWarning.actionLabel}
                </button>
              ) : null}
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
            onClick={handlePublish}
          >
            {publishLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
