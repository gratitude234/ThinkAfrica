"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import slugify from "slugify";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { MIN_WORD_COUNTS, POST_TYPE_LABELS } from "@/lib/utils";

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
  const [postType, setPostType] = useState<PostType>("blog");
  const [title, setTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [content, setContent] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleEditorUpdate = useCallback((html: string, words: number) => {
    setContent(html);
    setWordCount(words);
  }, []);

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

    // Get profile id
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("id", user.id)
      .single();

    if (!profile) {
      setError("Profile not found. Please try again.");
      setLoading(false);
      return;
    }

    // Generate slug
    const baseSlug = slugify(title, { lower: true, strict: true });
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

    // Parse tags
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    // Generate excerpt from HTML content
    const excerpt = content
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 200);

    const { error: insertError } = await supabase.from("posts").insert({
      author_id: profile.id,
      title: title.trim(),
      slug: uniqueSlug,
      content,
      excerpt,
      type: postType,
      tags,
      status: "pending",
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

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
              setTagsInput("");
              setContent("");
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Write a post</h1>
        <p className="text-gray-500 text-sm mt-1">
          Share your ideas with Africa&apos;s intellectual community.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
                onClick={() => setPostType(type)}
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
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter your title..."
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
          />
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
            onChange={(e) => setTagsInput(e.target.value)}
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
          <Button variant="secondary" type="button" onClick={() => router.push("/")}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} size="lg">
            Submit for review
          </Button>
        </div>
      </form>
    </div>
  );
}
