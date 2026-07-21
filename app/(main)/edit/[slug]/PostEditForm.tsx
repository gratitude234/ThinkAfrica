"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import { countShortPostCharacters, SHORT_POST_MAX_CHARACTERS } from "@/lib/shortPostContent";
import { updatePost } from "@/app/(main)/create/post/actions";

interface PostEditFormProps {
  postId: string;
  slug: string;
  initialBody: string;
  initialImageUrl: string | null;
}

export default function PostEditForm({
  postId,
  slug,
  initialBody,
  initialImageUrl,
}: PostEditFormProps) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const characterCount = countShortPostCharacters(body);
  const isEmpty = characterCount === 0;
  const isOverLimit = characterCount > SHORT_POST_MAX_CHARACTERS;
  const canSave = !isEmpty && !isOverLimit && !saving && !uploading;

  const handleSave = useCallback(async () => {
    if (!canSave || saving) return;

    setSaving(true);
    setError(null);

    const result = await updatePost({ postId, body, imageUrl });

    if (result.error || !result.slug) {
      setError(result.error ?? "Failed to save. Please try again.");
      setSaving(false);
      return;
    }

    router.push(`/post/${result.slug}`);
  }, [body, canSave, imageUrl, postId, router, saving]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-gray-900">Edit post</h1>
        <p className="mt-1 text-sm text-gray-500">
          Publishing status and permalink stay the same — only the text and image change.
        </p>
      </div>

      <div>
        <label htmlFor="post-edit-body" className="sr-only">
          Post text
        </label>
        <textarea
          id="post-edit-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={8}
          aria-describedby="post-edit-count post-edit-error"
          className={`min-h-[180px] w-full resize-y rounded-xl border bg-white p-4 text-base leading-relaxed text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
            isOverLimit ? "border-red-400" : "border-gray-200"
          }`}
        />
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span
            id="post-edit-count"
            className={isOverLimit ? "font-semibold text-red-600" : "text-gray-400"}
          >
            {characterCount.toLocaleString()} / {SHORT_POST_MAX_CHARACTERS.toLocaleString()}
          </span>
        </div>
        {isOverLimit ? (
          <p id="post-edit-error" role="alert" className="mt-1 text-xs font-medium text-red-600">
            Posts can be at most {SHORT_POST_MAX_CHARACTERS.toLocaleString()} characters — trim{" "}
            {(characterCount - SHORT_POST_MAX_CHARACTERS).toLocaleString()} more.
          </p>
        ) : null}
      </div>

      <CoverImageUploader
        initialUrl={imageUrl ?? undefined}
        onUpload={(url) => setImageUrl(url)}
        onRemove={() => setImageUrl(null)}
        onUploadingChange={setUploading}
        emptyTitle="Add an image (optional)"
        previewHeightClass="h-40"
      />

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <Button type="button" variant="secondary" onClick={() => router.push(`/post/${slug}`)}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void handleSave()}
          disabled={!canSave}
          loading={saving}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
