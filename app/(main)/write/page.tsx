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

// Load editor client-side only (no SSR)
const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="border border-gray-200 rounded-lg min-h-[400px] bg-gray-50 animate-pulse" />
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
  const [success, setSuccess] = useState(false);

  // Pre-populate from loaded draft
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
      router.push("/login");
      return;
    }

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    if (draftId) {
      // Update existing draft to pending
      const { error: updateError } = await supabase
        .from("posts")
        .update({
          title: title.trim(),
          excerpt,
          content,
          tags,
          type: postType,
          cover_image_url: coverImageUrl || null,
          status: "pending",
        })
        .eq("id", draftId)
        .eq("author_id", user.id);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
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

      const { error: insertError } = await supabase.from("posts").insert({
        author_id: profile.id,
        title: title.trim(),
        slug: uniqueSlug,
        content,
        excerpt,
        type: postType,
        tags,
        status: "pending",
        cover_image_url: coverImageUrl || null,
      });

      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }
    }

    setSuccess(true);
    setLoading(false);
  };

  if (loadingDraft) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-gray-400">
        Loading draft…
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-3xl mx-auto mb-4">
          ✓
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Submitted for review
        </h2>
        <p className="text-gray-500 mb-6">
          Your post has been submitted for editorial review. We&apos;ll publish
          it once approved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => router.push("/")}>Back to home</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSuccess(false);
              setTitle("");
              setExcerpt("");
              setTagsInput("");
              setContent("");
              setCoverImageUrl("");
              setWordCount(0);
            }}
          >
            Write another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Write a post</h1>
          <p className="text-gray-500 text-sm mt-1">
            Share your ideas with Africa&apos;s intellectual community.
          </p>
        </div>
        {/* Save status indicator */}
        <div className="flex-shrink-0">
          {saveStatus === "saving" && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
              Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
              Saved ✓
            </span>
          )}
          {saveStatus === "error" && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600">
              Save failed
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Cover image */}
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

        {/* Post type selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
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
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  postType === type
                    ? "bg-emerald-brand text-white border-emerald-brand"
                    : "bg-white border-gray-200 text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
                }`}
              >
                {POST_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
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
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
          />
        </div>

        {/* Excerpt / Summary */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Summary
          </label>
          <p className="text-xs text-gray-400 mb-1.5">
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
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none"
            />
            <span className="absolute bottom-2 right-2 text-xs text-gray-400">
              {excerpt.length}/200
            </span>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tags{" "}
            <span className="text-gray-400 font-normal">(comma separated)</span>
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => {
              setTagsInput(e.target.value);
              saveDraft(getCurrentData({ tagsInput: e.target.value }));
            }}
            placeholder="e.g. economics, governance, africa"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
          />
        </div>

        {/* Editor */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">
              Content
            </label>
            <div
              className={`text-xs font-medium ${meetsWordCount ? "text-emerald-brand" : "text-gray-400"}`}
            >
              {wordCount.toLocaleString()} /{" "}
              {minWords.toLocaleString()} words min
            </div>
          </div>
          <Editor
            key={initialData ? "loaded" : "empty"}
            content={content}
            placeholder={`Start writing your ${POST_TYPE_LABELS[postType].toLowerCase()}...`}
            onUpdate={handleEditorUpdate}
          />
          {!meetsWordCount && wordCount > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              {minWords - wordCount} more words needed for a{" "}
              {POST_TYPE_LABELS[postType].toLowerCase()}.
            </p>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            type="button"
            onClick={() => router.push("/")}
          >
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
            Submit for review
          </Button>
        </div>
      </form>
    </div>
  );
}
