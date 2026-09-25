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
import WriteHeader, { writeStatus } from "./WriteHeader";
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

  const heading = isEdit ? "Edit post" : "New post";
  const status = writeStatus(draft, imageUploading);

  return (
    // Full page at every size, like the Article editor: /write has nothing
    // behind it that a floating card could sit over.
    <div className="min-h-dvh bg-canvas text-ink md:min-h-[calc(100dvh-var(--app-nav-height))]">
      <section aria-label={heading} onKeyDownCapture={onKeyDownCapture}>
        <WriteHeader
          status={status}
          onBack={onBack}
          hasAppNav={hasAppNav}
          heading={heading}
          menu={
            <ComposerMenu
              onOpenDrafts={username ? () => void draft.requestClose(`/${username}?tab=drafts`) : undefined}
              canSaveDraft={canSaveDraft}
              onSaveDraft={() => void draft.flush({ force: true })}
              discardLabel={isEdit ? "Discard changes" : "Discard"}
              canDiscard={canDiscard}
              onDiscard={onDiscard}
            />
          }
          primary={
            <Button
              type="button"
              onClick={postNow}
              disabled={!canPost}
              loading={draft.publishing}
              className={WRITE_PRIMARY_BUTTON}
            >
              {isEdit ? "Update" : "Post"}
            </Button>
          }
        />

        <main className="mx-auto w-full max-w-[680px] px-5 pb-28 pt-5 sm:px-8 md:pb-16 md:pt-10">
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
            <figure className="relative mt-4 overflow-hidden rounded-xl bg-surface">
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

          {/* One row under the writing, the same at every size: the image on
              the left, the way to an Article on the right. From md up it
              follows the text, and on a phone it rides the keyboard. */}
          <div
            className="fixed inset-x-0 z-20 flex items-center justify-between gap-2 border-t border-divider bg-canvas px-3 py-0.5 md:static md:mt-4 md:border-0 md:bg-transparent md:p-0"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + var(--mobile-visual-viewport-bottom, 0px))" }}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imageUploading}
              aria-label={snapshot.coverImageUrl ? "Replace image" : "Add image"}
              className="-ml-2 flex min-h-11 shrink-0 items-center gap-2 rounded-md px-2 text-sm font-semibold text-emerald-ink transition-colors hover:bg-green-wash disabled:opacity-40"
            >
              <Icon path={IMAGE_ICON} className="h-5 w-5" />
              Image
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
            <button
              type="button"
              onClick={onSwitchToArticle}
              className="-mr-2 flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              Write an article instead
            </button>
          </div>
        </main>
      </section>
    </div>
  );
}
