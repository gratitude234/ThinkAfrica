"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import UserAvatar from "@/components/ui/UserAvatar";
import { CLOSE_ICON, IMAGE_ICON, Icon } from "@/components/editor/editorIcons";
import { hasMeaningfulContribution, type ComposerMode } from "@/lib/contribution";
import { uploadImage } from "@/lib/uploadImage";
import ComposerMenu from "./ComposerMenu";
import type { ContributionDraft } from "./useContributionDraft";
import { writeStatus } from "./WriteHeader";
import { WRITE_PRIMARY_BUTTON } from "./writeStyles";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => <div className="min-h-24 animate-pulse rounded-xl bg-canvas motion-reduce:animate-none" />,
});

const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";

export interface PostComposerProps {
  draft: ContributionDraft;
  mode: ComposerMode;
  authorName: string;
  avatarUrl: string | null;
  username: string | null;
  /** /write sits under the app navigation from md up. /edit has none. */
  hasAppNav: boolean;
  /** Shown above the byline: the device recovery notice. */
  notice?: ReactNode;
  onBack: () => void;
  onDiscard: () => void;
  onSwitchToArticle: () => void;
  withCompleteProfile: (next: () => void) => void;
}

/**
 * The quick path from the write-system mockup: a compact desktop card and a
 * full-screen phone composer. It has no title, one optional image, and posts
 * directly. The Article card is the explicit bridge into long-form writing.
 */
export default function PostComposer({
  draft,
  mode,
  authorName,
  avatarUrl,
  username,
  hasAppNav,
  notice,
  onBack,
  onDiscard,
  onSwitchToArticle,
  withCompleteProfile,
}: PostComposerProps) {
  const { snapshot, setSnapshot } = draft;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const isEdit = mode === "published-edit";
  const hasText = Boolean(draft.bodyText);
  const canPost = hasText && !imageUploading && !draft.publishing;
  const canSaveDraft = hasMeaningfulContribution(snapshot);
  const canDiscard = isEdit ? Boolean(draft.editDraftId) : Boolean(draft.draftId) || canSaveDraft;

  const attachImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setImageError("Choose a JPG, PNG, WebP or GIF image.");
        return;
      }
      setImageError(null);
      setImageUploading(true);
      const result = await uploadImage(file);
      setImageUploading(false);
      if (!result.ok) {
        setImageError(result.error);
        return;
      }
      const url = result.url;
      setSnapshot((current) => ({ ...current, coverImageUrl: url }));
    },
    [setSnapshot]
  );

  const postNow = () => {
    if (canPost) withCompleteProfile(() => void draft.publish());
  };

  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      postNow();
    }
  };

  const heading = isEdit ? "Edit post" : "New post";
  const action = isEdit ? "Update" : "Post";
  const status = writeStatus(draft, imageUploading);
  const statusLabel = status?.tone === "error" ? "Not saved" : status?.label;
  const characterCount = draft.bodyText.length;

  const imagePicker = (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={imageUploading}
      aria-label={snapshot.coverImageUrl ? "Replace image" : "Add image"}
      className="flex min-h-11 shrink-0 items-center gap-2 rounded-md px-2 text-sm font-semibold text-emerald-ink transition-colors hover:bg-green-wash disabled:opacity-40"
    >
      <Icon path={IMAGE_ICON} className="h-5 w-5" />
      <span className="hidden md:inline">Image</span>
    </button>
  );

  return (
    <div
      className={`min-h-dvh bg-canvas text-ink md:bg-[#F1EEE7] md:py-14 ${
        hasAppNav ? "md:min-h-[calc(100dvh-var(--app-nav-height))]" : ""
      }`}
    >
      <section
        data-write-canvas
        aria-label={heading}
        onKeyDownCapture={onKeyDownCapture}
        className="mx-auto min-h-dvh w-full bg-canvas md:min-h-0 md:w-[560px] md:overflow-visible md:rounded-[14px] md:border md:border-card-border md:shadow-[0_8px_30px_rgba(0,0,0,0.07)]"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_TYPES}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void attachImage(file);
          }}
        />
        <header className="relative grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 border-b border-card-border px-3 sm:px-5">
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-11 w-fit items-center rounded-md px-2 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand"
          >
            Cancel
          </button>
          <h1 className="truncate text-center text-sm font-semibold text-ink sm:text-[15px]">
            {heading}
          </h1>
          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
            {statusLabel ? (
              <span
                className={`hidden max-w-[64px] truncate text-xs md:inline ${status?.tone === "error" ? "text-red-600" : "text-ink-muted"}`}
                aria-hidden="true"
                title={status?.label}
              >
                {statusLabel}
              </span>
            ) : null}
            <ComposerMenu
              onOpenDrafts={username ? () => void draft.requestClose(`/${username}?tab=drafts`) : undefined}
              canSaveDraft={canSaveDraft}
              onSaveDraft={() => void draft.flush({ force: true })}
              discardLabel={isEdit ? "Discard changes" : "Discard"}
              canDiscard={canDiscard}
              onDiscard={onDiscard}
            />
            <Button
              type="button"
              onClick={postNow}
              disabled={!canPost}
              loading={draft.publishing}
              className={`${WRITE_PRIMARY_BUTTON} write-header-action !px-2 !text-xs sm:!px-3.5 sm:!text-[13px]`}
            >
              {action}
            </Button>
          </div>
        </header>

        {statusLabel && status?.tone !== "error" ? (
          <div
            className="px-4 py-1.5 text-[11px] text-ink-muted md:hidden"
            aria-hidden="true"
          >
            {status?.label}
          </div>
        ) : null}
        <p aria-live="polite" className="sr-only">{status?.label ?? ""}</p>

        {status?.tone === "error" ? (
          <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-center text-sm text-red-700">
            {status.label}
            <button type="button" onClick={() => void draft.flush({ force: true })} className="ml-2 inline-flex min-h-11 items-center rounded-md px-3 font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700">
              Retry saving
            </button>
          </p>
        ) : null}

        <main className="px-4 pb-[calc(var(--mobile-visual-viewport-bottom,0px)+6rem)] pt-3.5 sm:px-5 md:pb-5 md:pt-5">
          {notice}
          <div className="flex items-center gap-2.5">
            <UserAvatar name={authorName} src={avatarUrl} size={32} className="shrink-0" />
            <p className="text-sm font-semibold text-ink">{authorName}</p>
          </div>

          <div className="mt-3">
            <Editor
              variant="post"
              content={snapshot.content}
              placeholder="Share an idea, a link, a moment."
              ariaLabel="Publication body"
              autoFocus={!isEdit}
              onUpdate={(content) =>
                setSnapshot((current) => (current.content === content ? current : { ...current, content }))
              }
              onImageFile={(file) => void attachImage(file)}
            />
          </div>

          {snapshot.coverImageUrl ? (
            <figure className="relative mt-4 overflow-hidden rounded-[10px] bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={snapshot.coverImageUrl} alt="" className="mx-auto max-h-[420px] w-full object-contain" />
              <button
                type="button"
                onClick={() => setSnapshot((current) => ({ ...current, coverImageUrl: "" }))}
                aria-label="Remove image"
                className="group absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-white transition-colors group-hover:bg-ink">
                  <Icon path={CLOSE_ICON} className="h-3.5 w-3.5" />
                </span>
              </button>
            </figure>
          ) : null}

          {imageError ? (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {imageError}
            </p>
          ) : null}
          {draft.publishError ? (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {draft.publishError}
            </p>
          ) : null}

          <div className="mt-3 hidden items-center justify-between md:flex">
            <div className="-ml-2">{imagePicker}</div>
            <p className="text-xs text-ink-muted">{characterCount.toLocaleString()} characters, no hard limit</p>
          </div>

          <button
            type="button"
            onClick={onSwitchToArticle}
            aria-label={hasText ? "Switch to article" : "Article: Write something in depth"}
            className={`mt-3 flex min-h-11 items-center gap-2.5 rounded-[10px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand ${hasText ? "px-2 text-emerald-ink hover:bg-green-wash" : "w-full bg-[#EFEAE1] px-3 py-2.5 hover:bg-[#E8E1D6]"}`}
          >
            {hasText ? (
              <span className="text-xs font-semibold">Switch to article <span aria-hidden="true">→</span></span>
            ) : (
              <>
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-brand font-display text-xs font-bold text-[#FAF8F5]">A</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink">Article</span>
                  <span className="text-xs text-ink-muted">Write something in depth</span>
                </span>
              </>
            )}
          </button>
        </main>

        <div
          data-write-toolbar
          className="fixed inset-x-0 z-20 flex min-h-14 items-center border-t border-divider bg-surface px-3 md:hidden"
          style={{ bottom: "var(--mobile-visual-viewport-bottom, 0px)", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          {imagePicker}
        </div>
      </section>
    </div>
  );
}
