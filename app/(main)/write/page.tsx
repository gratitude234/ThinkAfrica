"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import slugify from "slugify";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import TagInput from "@/components/ui/TagInput";
import {
  MIN_WORD_COUNTS,
  POST_TYPE_LABELS,
  generateExcerpt,
} from "@/lib/utils";
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

interface DraftPayload {
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  postType: PostType;
  coverImageUrl: string;
}

function countWords(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export default function WritePage() {
  const router = useRouter();
  const { draftId, saveDraft, initialData, loadingDraft } = useDraftManager();

  const [postType, setPostType] = useState<PostType>("blog");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tags, setTags] = useState<string[]>([]);
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
      setTags(initialData.tags);
      setContent(initialData.content);
      setCoverImageUrl(initialData.coverImageUrl);
      setWordCount(countWords(initialData.content));
    }
  }, [initialData]);

  const getCurrentData = useCallback(
    (overrides: Partial<DraftPayload> = {}): DraftPayload => ({
      title: overrides.title ?? title,
      excerpt: overrides.excerpt ?? excerpt,
      content: overrides.content ?? content,
      tags: overrides.tags ?? tags,
      postType: overrides.postType ?? postType,
      coverImageUrl: overrides.coverImageUrl ?? coverImageUrl,
    }),
    [title, excerpt, content, tags, postType, coverImageUrl]
  );

  const handleEditorUpdate = useCallback(
    (html: string, words: number) => {
      setContent(html);
      setWordCount(words);
    },
    []
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

    const finalExcerpt = excerpt.trim() || generateExcerpt(content, 220);
    const normalizedTags = tags
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    const now = new Date().toISOString();
    const isInstantPublish = postType === "blog" || postType === "essay";
    const submitStatus = isInstantPublish ? "published" : "pending";
    const submitPublishedAt = isInstantPublish ? now : null;
    let publishedPostSlug = "";

    if (draftId) {
      const { data: updated, error: updateError } = await supabase
        .from("posts")
        .update({
          title: title.trim(),
          excerpt: finalExcerpt,
          content,
          tags: normalizedTags,
          type: postType,
          cover_image_url: coverImageUrl || null,
          status: submitStatus,
          published_at: submitPublishedAt,
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
          excerpt: finalExcerpt,
          type: postType,
          tags: normalizedTags,
          status: submitStatus,
          published_at: submitPublishedAt,
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
      )}&type=${encodeURIComponent(postType)}&live=${
        isInstantPublish ? "1" : "0"
      }`
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

        <TagInput
          label="Tags"
          value={tags}
          helperText="Add up to five tags to help readers discover your piece."
          placeholder="e.g. economics"
          onChange={(nextTags) => {
            setTags(nextTags);
            void saveDraft({
              ...getCurrentData(),
              tags: nextTags,
            });
          }}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Content
          </label>
          <Editor
            key={initialData ? "loaded" : "empty"}
            content={content}
            minWords={minWords}
            placeholder={`Start writing your ${POST_TYPE_LABELS[postType].toLowerCase()}...`}
            onUpdate={handleEditorUpdate}
            onAutoSave={() => saveDraft(getCurrentData())}
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        ) : null}

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
