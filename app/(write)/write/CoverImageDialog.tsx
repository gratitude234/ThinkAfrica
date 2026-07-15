"use client";

import { useEffect, useRef } from "react";
import Button from "@/components/ui/Button";
import CoverImageUploader from "@/components/ui/CoverImageUploader";

interface CoverImageDialogProps {
  open: boolean;
  onClose: () => void;
  coverImageUrl: string;
  onUpload: (url: string) => void;
  onRemove: () => void;
  onUploadingChange: (uploading: boolean) => void;
  uploading: boolean;
  canReviewPublish: boolean;
  onContinue: () => void;
  onReviewPublish: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export default function CoverImageDialog({
  open,
  onClose,
  coverImageUrl,
  onUpload,
  onRemove,
  onUploadingChange,
  uploading,
  canReviewPublish,
  onContinue,
  onReviewPublish,
}: CoverImageDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label="Close cover image dialog backdrop"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cover-image-dialog-title"
        aria-describedby="cover-image-dialog-description"
        className="relative w-full max-w-md animate-create-menu-in rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close cover image dialog"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        <h2
          id="cover-image-dialog-title"
          className="pr-8 font-display text-lg font-semibold text-ink"
        >
          Cover image
        </h2>
        <p id="cover-image-dialog-description" className="mt-1 text-sm text-gray-500">
          Optional, but recommended. Recommended 16:9 aspect ratio. JPG, PNG, or WebP, up to 5MB.
        </p>

        <div className="mt-4">
          <CoverImageUploader
            initialUrl={coverImageUrl}
            onUpload={onUpload}
            onRemove={onRemove}
            onUploadingChange={onUploadingChange}
            previewHeightClass="h-44 sm:h-52"
          />
        </div>

        {coverImageUrl ? (
          <div
            aria-busy={uploading}
            className="mt-4 border-t border-gray-100 pt-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="mb-3 sm:mb-0">
              <p className="text-sm font-semibold text-emerald-700" aria-live="polite">
                {uploading ? "Uploading…" : "Cover added ✓"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                {uploading
                  ? "Hang tight while your new cover finishes uploading."
                  : "Your image has been uploaded and will appear at the top of your article."}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                variant={canReviewPublish ? "secondary" : "primary"}
                size="sm"
                onClick={onContinue}
                disabled={uploading}
                className="w-full sm:w-auto"
              >
                Continue writing
              </Button>
              {canReviewPublish ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={onReviewPublish}
                  disabled={uploading}
                  className="w-full sm:w-auto"
                >
                  Review & publish
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
