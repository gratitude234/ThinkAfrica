"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import UserAvatar from "@/components/ui/UserAvatar";
import { ArticleMark, CLOSE_ICON, IMAGE_ICON, Icon } from "@/components/editor/editorIcons";
import { hasMeaningfulContribution, type ComposerMode } from "@/lib/contribution";
import { uploadImage } from "@/lib/uploadImage";
import ComposerMenu from "./ComposerMenu";
import type { ContributionDraft } from "./useContributionDraft";
import { WRITE_PRIMARY_BUTTON, WRITE_TEXT_BUTTON } from "./writeStyles";

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
  /** Shown above the byline: the device recovery notice. */
  notice?: ReactNode;
  onCancel: () => void;
  onDiscard: () => void;
  onSwitchToArticle: () => void;
  withCompleteProfile: (next: () => void) => void;
}

/**
 * The quick path: no title, one optional image, and a Post button that
 * publishes straight away. Topics and the reader preview belong to Articles.
 * The root never shows this screen over a title, so a Post never carries one.
 */
export default function PostComposer({
  draft,
  mode,
  authorName,
  avatarUrl,
  username,
  notice,
  onCancel,
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
  const statusLabel = imageUploading ? "Adding image…" : draft.saveLabel;
  const statusIsError = !imageUploading && draft.saveState === "error";

  // A Post's one image is its cover_image_url, which the feed card and the
  // Post page already show. Switching to the Article editor makes it the cover.
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

  // Cmd/Ctrl+Enter is the muscle memory for "send this". It is taken in the
  // capture phase, before the editor sees it: Tiptap binds the same keys to a
  // line break, which would otherwise land in the text as the Post goes out.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      postNow();
    }
  };

  return (
    // From md up the page sits under the app navigation, so it fills what is
    // left of the screen rather than a whole screen's height below it.
    <div className="min-h-dvh bg-surface md:min-h-[calc(100dvh-var(--app-nav-height))] md:bg-canvas md:px-4 md:pb-16 md:pt-14">
      <section
        aria-labelledby="post-composer-title"
        onKeyDownCapture={onKeyDownCapture}
        className="flex min-h-dvh flex-col bg-surface text-ink md:mx-auto md:min-h-0 md:max-w-[560px] md:rounded-2xl md:border md:border-card-border md:shadow-[0_10px_30px_-12px_rgba(26,26,26,0.18)]"
      >
        {/* A phone: Cancel, the title centred, the actions, and the status on
            a line of its own. From md up the status sits beside the menu. */}
        <header className="sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center border-b border-divider bg-surface px-2 pt-1 md:static md:flex md:gap-2 md:rounded-t-2xl md:px-4 md:py-2">
          <button type="button" onClick={onCancel} className={`${WRITE_TEXT_BUTTON} justify-self-start`}>
            Cancel
          </button>
          <h1 id="post-composer-title" className="text-center text-[15px] font-semibold text-ink md:flex-1">
            {isEdit ? "Edit post" : "New post"}
          </h1>
          {/* One status region at every size. */}
          <p
            aria-live="polite"
            className={`order-last col-span-3 min-h-5 truncate px-2 pb-1.5 text-xs md:order-none md:max-w-[10rem] md:px-0 md:pb-0 md:text-right ${
              statusIsError ? "text-red-600" : "text-ink-muted"
            }`}
          >
            {statusLabel}
          </p>
          <div className="flex items-center gap-1 justify-self-end">
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
              className={WRITE_PRIMARY_BUTTON}
            >
              {isEdit ? "Update" : "Post"}
            </Button>
          </div>
        </header>

        <div className="flex-1 px-4 pb-24 pt-4 md:px-5 md:pb-5 md:pt-5">
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
            <figure className="relative mt-4 overflow-hidden rounded-xl bg-canvas">
              {/* At its natural shape, not cropped: a Post's image is often a
                  screenshot or a chart, and cropping loses the point of it. */}
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

          {/* The image button: a row inside the card from md up, and a bar on
              the keyboard on a phone. */}
          <div
            className="fixed inset-x-0 z-20 flex items-center border-t border-divider bg-surface px-2 py-0.5 md:static md:mt-3 md:border-0 md:bg-transparent md:p-0"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + var(--mobile-visual-viewport-bottom, 0px))" }}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imageUploading}
              aria-label={snapshot.coverImageUrl ? "Replace image" : "Add image"}
              className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-emerald-ink transition-colors hover:bg-green-wash disabled:opacity-40 md:-ml-3"
            >
              <Icon path={IMAGE_ICON} />
            </button>
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
          </div>

          <button
            type="button"
            onClick={onSwitchToArticle}
            className="mt-4 flex min-h-11 w-full items-center gap-3 rounded-lg bg-divider/50 px-3 py-2 text-left transition-colors hover:bg-divider/80 md:mt-3"
          >
            <ArticleMark />
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight text-ink">Article</span>
              {/* On a phone, once there is writing, the card gives the room back to it. */}
              <span className={`text-xs text-ink-muted ${hasText ? "hidden md:inline" : ""}`}>
                Write something in depth
              </span>
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
