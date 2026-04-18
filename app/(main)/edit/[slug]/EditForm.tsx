"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import TagInput from "@/components/ui/TagInput";
import { MIN_WORD_COUNTS, POST_TYPE_LABELS, type PostType } from "@/lib/utils";
import CoverImageUploader from "@/components/ui/CoverImageUploader";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[400px] rounded-lg border border-gray-200 bg-canvas animate-pulse" />
  ),
});

const POST_TYPES: PostType[] = ["blog", "essay", "research", "policy_brief"];

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
  const [tags, setTags] = useState<string[]>(post.tags ?? []);
  const [content, setContent] = useState(post.content ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(post.cover_image_url ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }

      setError(null);
      const supabase = createClient();
      const normalizedTags = tags
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);

      const { error: updateError } = await supabase
        .from("posts")
        .update({
          title: title.trim(),
          excerpt,
          content,
          tags: normalizedTags,
          type: postType,
          cover_image_url: coverImageUrl || null,
          status: post.status === "draft" ? "draft" : post.status,
        })
        .eq("id", post.id)
        .eq("author_id", userId);

      if (updateError) {
        if (!silent) {
          setError(updateError.message);
        }
      } else if (!silent) {
        router.push("/dashboard");
      }

      if (!silent) {
        setLoading(false);
      }
    },
    [title, excerpt, content, tags, postType, coverImageUrl, post.id, post.status, userId, router]
  );

  useEffect(() => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
    }

    autosaveTimer.current = setTimeout(() => {
      void doSave(true);
    }, 5000);

    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
    };
  }, [title, excerpt, tags, postType, coverImageUrl, doSave]);

  const handleEditorUpdate = useCallback((html: string) => {
    setContent(html);
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit post</h1>
          <p className="mt-1 text-sm capitalize text-gray-500">
            Status: <span className="font-medium">{post.status}</span>
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void doSave(false);
        }}
        className="space-y-6"
      >
        <CoverImageUploader
          initialUrl={coverImageUrl}
          onUpload={setCoverImageUrl}
          onRemove={() => setCoverImageUrl("")}
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
                onClick={() => setPostType(type)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  postType === type
                    ? "border-emerald-brand bg-emerald-brand text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
                }`}
              >
                {POST_TYPE_LABELS[type]}
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
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-base font-medium focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Summary
          </label>
          <div className="relative">
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              maxLength={200}
              rows={2}
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
          helperText="Add up to five tags to keep this post discoverable."
          onChange={setTags}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Content
          </label>
          <Editor
            content={content}
            minWords={MIN_WORD_COUNTS[postType]}
            onUpdate={handleEditorUpdate}
            onAutoSave={() => doSave(true)}
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        ) : null}

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
