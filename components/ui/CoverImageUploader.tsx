"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

interface CoverImageUploaderProps {
  initialUrl?: string;
  onUpload: (url: string) => void;
  onRemove: () => void;
  onUploadingChange?: (uploading: boolean) => void;
  bucket?: string;
  ensureBucket?: boolean;
  buildPath?: (userId: string, file: File) => string;
  emptyTitle?: string;
  emptyHint?: string;
  previewHeightClass?: string;
}

export default function CoverImageUploader({
  initialUrl,
  onUpload,
  onRemove,
  onUploadingChange,
  bucket = "post-images",
  ensureBucket = false,
  buildPath = (userId, file) => {
    const ext = file.name.split(".").pop() ?? "jpg";
    return `covers/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  },
  emptyTitle = "Add a cover image",
  emptyHint = "JPG, PNG, or WebP, up to 5MB",
  previewHeightClass = "h-48",
}: CoverImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(initialUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  const releaseBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => releaseBlobUrl, [releaseBlobUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      if (uploading) return;

      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setError("Please select a JPG, PNG, or WebP image.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Image must be under 5MB.");
        return;
      }

      const failWith = (message: string) => {
        releaseBlobUrl();
        setError(message);
        setPreview(initialUrl ?? null);
      };

      setError(null);
      releaseBlobUrl();
      const objectUrl = URL.createObjectURL(file);
      blobUrlRef.current = objectUrl;
      setPreview(objectUrl);
      setUploading(true);
      onUploadingChange?.(true);

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          failWith("You must be logged in to upload images.");
          return;
        }

        if (ensureBucket) {
          await supabase.storage.createBucket(bucket, { public: true }).catch(() => null);
        }

        const path = buildPath(user.id, file);

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, file, { upsert: true });

        if (uploadError) {
          failWith(`Upload failed: ${uploadError.message}`);
          return;
        }

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
        releaseBlobUrl();
        setPreview(urlData.publicUrl);
        onUpload(urlData.publicUrl);
      } catch {
        failWith("Upload failed. Please try again.");
      } finally {
        setUploading(false);
        onUploadingChange?.(false);
      }
    },
    [bucket, buildPath, ensureBucket, initialUrl, onUpload, onUploadingChange, releaseBlobUrl, uploading]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  if (preview) {
    return (
      <div className="relative overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt="Cover"
          className={`w-full rounded-lg object-cover ${previewHeightClass}`}
        />
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/20 opacity-0 transition-opacity hover:opacity-100">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-800"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => {
              releaseBlobUrl();
              setPreview(null);
              onRemove();
            }}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            Remove
          </button>
        </div>
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="text-sm text-gray-500">Uploading...</span>
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-red-600/95 px-3 py-1.5">
            <span className="text-xs font-medium text-white">{error}</span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="shrink-0 text-xs font-semibold text-white underline"
            >
              Retry
            </button>
          </div>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
          dragOver
            ? "border-emerald-brand bg-emerald-50"
            : "border-gray-300 bg-canvas hover:border-gray-400 hover:bg-gray-100"
        }`}
      >
        {uploading ? (
          <span className="text-sm text-gray-500">Uploading...</span>
        ) : (
          <>
            <svg
              className="mb-2 h-8 w-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-emerald-brand">{emptyTitle}</span> or
              drag and drop
            </p>
            <p className="mt-1 text-xs text-gray-400">{emptyHint}</p>
          </>
        )}
      </div>
      {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}
