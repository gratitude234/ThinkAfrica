"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { POST_TYPE_LABELS } from "@/lib/utils";
import CoverImageUploader from "@/components/ui/CoverImageUploader";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="border border-gray-200 rounded-lg min-h-[400px] bg-gray-50 animate-pulse" />
  ),
});

const POST_TYPES = ["blog", "essay", "research", "policy_brief"] as const;
type PostType = (typeof POST_TYPES)[number];

interface Post {
  id: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  type: string;
  status: string;
  tags: string[] | null;
  cover_image_url: string | null;
}

interface EditFormProps {
  post: Post;
  userId: string;
}

export default function EditForm({ post, userId }: EditFormProps) {
  const router = useRouter();
  const [postType, setPostType] = useState<PostType>((post.type as PostType) ?? "blog");
  const [title, setTitle] = useState(post.title);
  const [excerpt, setExcerpt] = useState(post.excerpt ?? "");
  const [tagsInput, setTagsInput] = useState((post.tags ?? []).join(", "));
  const [content, setContent] = useState(post.content ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(post.cover_image_url ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setSaveStatus("saving");

      setError(null);
      const supabase = createClient();
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const { error: updateError } = await supabase
        .from("posts")
        .update({
          title: title.trim(),
          excerpt,
          content,
          tags,
          type: postType,
          cover_image_url: coverImageUrl || null,
        })
        .eq("id", post.id)
        .eq("author_id", userId);

      if (updateError) {
        if (!silent) setError(updateError.message);
        setSaveStatus("idle");
      } else {
        setSaveStatus("saved");
        if (!silent) router.push("/dashboard");
      }
      if (!silent) setLoading(false);
    },
    [title, excerpt, content, tagsInput, postType, coverImageUrl, post.id, userId, router]
  );

  // Autosave every 5s silently
  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => doSave(true), 5000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [title, excerpt, content, tagsInput, postType, coverImageUrl, doSave]);

  const handleEditorUpdate = useCallback((html: string) => {
    setContent(html);
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit post</h1>
          <p className="text-sm text-gray-500 mt-1 capitalize">
            Status: <span className="font-medium">{post.status}</span>
          </p>
        </div>
        {saveStatus === "saving" && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            Saving…
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="text-xs text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
            Saved ✓
          </span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSave(false);
        }}
        className="space-y-6"
      >
        <CoverImageUploader
          initialUrl={coverImageUrl}
          onUpload={setCoverImageUrl}
          onRemove={() => setCoverImageUrl("")}
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Summary
          </label>
          <div className="relative">
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              maxLength={200}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none"
            />
            <span className="absolute bottom-2 right-2 text-xs text-gray-400">
              {excerpt.length}/200
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tags{" "}
            <span className="text-gray-400 font-normal">(comma separated)</span>
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Content
          </label>
          <Editor
            content={content}
            onUpdate={handleEditorUpdate}
          />
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
            onClick={() => router.push("/dashboard")}
          >
            Cancel
          </Button>
          <Button type="submit" loading={loading} size="lg">
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
