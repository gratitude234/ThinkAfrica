"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import slugify from "slugify";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { MIN_WORD_COUNTS, POST_TYPE_LABELS } from "@/lib/utils";
import { useDraftManager } from "./DraftManager";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import MyDrafts from "./MyDrafts";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[400px] rounded-lg border border-gray-200 bg-gray-50 animate-pulse" />
  ),
});

const POST_TYPES = ["blog", "essay", "research", "policy_brief"] as const;
type PostType = (typeof POST_TYPES)[number];

export default function WritePage() {
  const router = useRouter();
  const { draftId, saveStatus, saveDraft, initialData, loadingDraft } =
    useDraftManager();

  const [postType, setPostType] = useState<PostType>("blog");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [content, setContent] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setPostType((initialData.postType as PostType) ?? "blog");
      setTitle(initialData.title);
      setExcerpt(initialData.excerpt);
      setTagsInput(initialData.tagsInput);
      setContent(initialData.content);
      setCoverImageUrl(initialData.coverImageUrl);
    }
  }, [initialData]);

  const getCurrentData = useCallback(
    (overrides: Partial<Record<string, string>> = {}) => ({
      title: overrides.title ?? title,
      excerpt: overrides.excerpt ?? excerpt,
      content: overrides.content ?? content,
      tagsInput: overrides.tagsInput ?? tagsInput,
      postType: overrides.postType ?? postType,
      coverImageUrl: overrides.coverImageUrl ?? coverImageUrl,
    }),
    [title, excerpt, content, tagsInput, postType, coverImageUrl]
  );

  const handleEditorUpdate = useCallback(
    (html: string, words: number) => {
      setContent(html);
      setWordCount(words);
      saveDraft(getCurrentData({ content: html }));
    },
    [saveDraft, getCurrentData]
  );

  const minWords = MIN_WORD_COUNTS[postType];
  const meetsWordCount = wordCount >= minWords;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }

    if (!meetsWordCount) {
      setError(
        `${POST_TYPE_LABELS[postType]} posts require at least ${minWords.toLocaleString()} words. Current: ${wordCount.toLocaleString()}`
      );
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      router.push("/login");
      return;
    }

    const tags = tagsInput
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    const now = new Date().toISOString();
    let publishedPostSlug = "";

    if (draftId) {
      const { data: updated, error: updateError } = await supabase
        .from("posts")
        .update({
          title: title.trim(),
          excerpt,
          content,
          tags,
          type: postType,
          cover_image_url: coverImageUrl || null,
          status: "published",
          published_at: now,
        })
        .eq("id", draftId)
        .eq("author_id", user.id)
        .select("slug")
        .single();

      if (updateError || !updated) {
        setError(updateError?.message ?? "Failed to publish.");
        setLoading(false);
        return;
      }

      publishedPostSlug = updated.slug;
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!profile) {
        setError("Profile not found. Please try again.");
        setLoading(false);
        return;
      }

      const baseSlug = slugify(title, { lower: true, strict: true });
      const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

      const { data: inserted, error: insertError } = await supabase
        .from("posts")
        .insert({
          author_id: profile.id,
          title: title.trim(),
          slug: uniqueSlug,
          content,
          excerpt,
          type: postType,
          tags,
          status: "published",
          published_at: now,
          cover_image_url: coverImageUrl || null,
        })
        .select("slug")
        .single();

      if (insertError || !inserted) {
        setError(insertError?.message ?? "Failed to publish.");
        setLoading(false);
        return;
      }

      publishedPostSlug = inserted.slug;
    }

    router.push(
      `/submitted?slug=${encodeURIComponent(
        publishedPostSlug
      )}&type=${encodeURIComponent(postType)}`
    );
  };

  if (loadingDraft) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-gray-400">
        Loading draft...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <MyDrafts activeDraftId={draftId} />

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Write a post</h1>
          <p className="mt-1 text-sm text-gray-500">
            Share your ideas with Africa&apos;s intellectual community.
          </p>
        </div>
        <div className="flex-shrink-0">
          {saveStatus === "saving" ? (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
              Saving...
            </span>
          ) : null}
          {saveStatus === "saved" ? (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Saved
            </span>
          ) : null}
          {saveStatus === "error" ? (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600">
              Save failed
            </span>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <CoverImageUploader
          initialUrl={coverImageUrl}
          onUpload={(url) => {
            setCoverImageUrl(url);
            saveDraft(getCurrentData({ coverImageUrl: url }));
          }}
          onRemove={() => {
            setCoverImageUrl("");
            saveDraft(getCurrentData({ coverImageUrl: "" }));
          }}
        />

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Post type
          </label>
          <div className="flex flex-wrap gap-2">
            {POST_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setPostType(type);
                  saveDraft(getCurrentData({ postType: type }));
                }}
                className={`rounded-lg border px-4 py-2 text-left text-sm font-medium transition-colors ${
                  postType === type
                    ? "border-emerald-brand bg-emerald-brand text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
                }`}
              >
                <span className="block">{POST_TYPE_LABELS[type]}</span>
                <span
                  className={`mt-0.5 block text-xs font-normal ${
                    postType === type ? "text-emerald-100" : "text-gray-400"
                  }`}
                >
                  {MIN_WORD_COUNTS[type].toLocaleString()}+ words
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              saveDraft(getCurrentData({ title: e.target.value }));
            }}
            placeholder="Enter your title..."
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-base font-medium focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Summary
          </label>
          <p className="mb-1.5 text-xs text-gray-400">
            This appears in the feed preview. Keep it under 200 characters.
          </p>
          <div className="relative">
            <textarea
              value={excerpt}
              onChange={(e) => {
                setExcerpt(e.target.value);
                saveDraft(getCurrentData({ excerpt: e.target.value }));
              }}
              maxLength={200}
              rows={2}
              placeholder="Write a short summary of your post..."
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
            <span className="absolute bottom-2 right-2 text-xs text-gray-400">
              {excerpt.length}/200
            </span>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Tags <span className="font-normal text-gray-400">(comma separated)</span>
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => {
              setTagsInput(e.target.value);
              saveDraft(getCurrentData({ tagsInput: e.target.value }));
            }}
            placeholder="e.g. economics, governance, africa"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Content
          </label>
          <Editor
            key={initialData ? "loaded" : "empty"}
            content={content}
            placeholder={`Start writing your ${POST_TYPE_LABELS[postType].toLowerCase()}...`}
            onUpdate={handleEditorUpdate}
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">
              {wordCount.toLocaleString()} / {minWords.toLocaleString()} words
            </span>
            {meetsWordCount ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Ready to submit
              </span>
            ) : (
              <span className="text-xs text-gray-400">
                {(minWords - wordCount).toLocaleString()} more to go
              </span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                meetsWordCount
                  ? "bg-emerald-500"
                  : wordCount > minWords * 0.6
                    ? "bg-amber-400"
                    : "bg-gray-400"
              }`}
              style={{
                width: `${Math.min(100, Math.round((wordCount / minWords) * 100))}%`,
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={() => router.push("/")}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => saveDraft(getCurrentData())}
          >
            Save draft
          </Button>
          <Button type="submit" loading={loading} size="lg">
            Publish
          </Button>
        </div>
      </form>
    </div>
  );
}
