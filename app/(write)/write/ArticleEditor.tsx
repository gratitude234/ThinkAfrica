"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import ReferencesPanel from "@/components/post/ReferencesPanel";
import type { EditorHandle, SelectedImage } from "@/components/editor/Editor";
import { BACK_ICON, CLOSE_ICON, Icon } from "@/components/editor/editorIcons";
import { hasMeaningfulContribution, type ComposerMode } from "@/lib/contribution";
import ArticleMobileToolbar, { NO_FORMATS, type FormatState } from "./ArticleMobileToolbar";
import ArticlePreview from "./ArticlePreview";
import ComposerMenu from "./ComposerMenu";
import ImageDetailsPanel from "./ImageDetailsPanel";
import PublishSettingsDialog from "./PublishSettingsDialog";
import RevisionHistory, { type RestoredRevision } from "./RevisionHistory";
import type { ContributionDraft } from "./useContributionDraft";
import { useModalFocus } from "./useModalFocus";
import WriteSheet from "./WriteSheet";
import { WRITE_PRIMARY_BUTTON } from "./writeStyles";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[50vh] animate-pulse rounded-xl bg-surface motion-reduce:animate-none" />
  ),
});

export interface ArticleEditorProps {
  draft: ContributionDraft;
  mode: ComposerMode;
  authorName: string;
  avatarUrl: string | null;
  username: string | null;
  /** /write sits under the app navigation from md up. /edit has none. */
  hasAppNav: boolean;
  autoFocusTitle: boolean;
  /** Shown above the cover: the device recovery notice. */
  notice?: ReactNode;
  onBack: () => void;
  onDiscard: () => void;
  withCompleteProfile: (next: () => void) => void;
}

type Sheet = "sources" | "history" | null;

function sameFormats(left: FormatState, right: FormatState) {
  return (Object.keys(left) as Array<keyof FormatState>).every((key) => left[key] === right[key]);
}

/**
 * The long-form screen: a cover, a required title and a rich body, set in the
 * live article page's type. Formatting is a selection toolbar and a "+" menu
 * on a desktop, and a toolbar on the keyboard on a phone. Continue opens
 * Publish settings.
 */
export default function ArticleEditor({
  draft,
  mode,
  authorName,
  avatarUrl,
  username,
  hasAppNav,
  autoFocusTitle,
  notice,
  onBack,
  onDiscard,
  withCompleteProfile,
}: ArticleEditorProps) {
  const { snapshot, setSnapshot } = draft;
  const editorRef = useRef<EditorHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [formats, setFormats] = useState<FormatState>(NO_FORMATS);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isEdit = mode === "published-edit";
  const hasTitle = Boolean(snapshot.title.trim());
  const hasBody = Boolean(draft.bodyText);
  const uploading = imageUploading || coverUploading;
  const canContinue = hasTitle && hasBody && !uploading;
  const missingTitle = hasBody && !hasTitle;
  const canSaveDraft = hasMeaningfulContribution(snapshot);
  const canDiscard = isEdit ? Boolean(draft.editDraftId) : Boolean(draft.draftId) || canSaveDraft;
  // An upload outranks the save state. It is the one the writer just started
  // by hand, and a pasted photo gives no other sign until it lands.
  const statusLabel = uploading ? "Adding image…" : draft.saveLabel;
  const statusIsError = !uploading && draft.saveState === "error";

  const closeSheet = useCallback(() => setSheet(null), []);
  const closePublish = useCallback(() => setShowPublish(false), []);
  const closePreview = useCallback(() => setShowPreview(false), []);
  useModalFocus(showPreview, previewRef, closePreview);

  // A one-line textarea with overflow hidden clips its second line, and a
  // title long enough to wrap is exactly the kind someone wants to read back.
  useEffect(() => {
    const field = titleRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [snapshot.title]);

  // This runs on every keystroke, so each piece of derived state is compared
  // before it is set, and a typing session does not re-render the toolbars.
  const handleSelectionUpdate = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next: FormatState = {
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      heading: editor.isActive("heading", { level: 2 }),
      subheading: editor.isActive("heading", { level: 3 }),
      quote: editor.isActive("blockquote"),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      link: editor.isActive("link"),
      align: editor.getTextAlign(),
    };
    setFormats((current) => (sameFormats(current, next) ? current : next));

    const canUndo = editor.canUndo();
    const canRedo = editor.canRedo();
    setHistory((current) =>
      current.canUndo === canUndo && current.canRedo === canRedo ? current : { canUndo, canRedo }
    );

    const image = editor.getSelectedImage();
    setSelectedImage((current) => {
      if (!image) return current === null ? current : null;
      if (
        current &&
        current.src === image.src &&
        current.alt === image.alt &&
        current.caption === image.caption
      ) {
        return current;
      }
      return image;
    });
  }, []);

  const updateImage = useCallback((attrs: { alt?: string; caption?: string }) => {
    editorRef.current?.updateSelectedImage(attrs);
    setSelectedImage((current) => (current ? { ...current, ...attrs } : current));
  }, []);

  const restoreRevision = useCallback(
    (revision: RestoredRevision) => {
      setSnapshot((current) => ({
        ...current,
        title: revision.title,
        excerpt: revision.excerpt,
        content: revision.content,
      }));
      setSheet(null);
    },
    [setSnapshot]
  );

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header
        className={`sticky z-30 border-b border-divider bg-canvas/95 backdrop-blur ${
          hasAppNav ? "top-0 md:top-[var(--app-nav-height)]" : "top-0"
        }`}
      >
        {/* A phone: Back, then the actions, with the status on its own row.
            From md up: Back, the status centred, the actions on the right. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 px-2 py-1 sm:px-4 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-x-4 md:px-8 md:py-2">
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-11 items-center gap-1.5 justify-self-start rounded-md px-2 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand"
          >
            <Icon path={BACK_ICON} className="h-4 w-4" />
            Back
          </button>
          {/* One status region at every size: its own row on a phone, centred
              between Back and the actions from md up. */}
          <p
            aria-live="polite"
            className={`order-last flex min-h-5 w-full min-w-0 items-center gap-1.5 truncate px-2 pb-1 text-xs md:order-none md:w-auto md:justify-center md:pb-0 ${
              statusIsError ? "text-red-600" : "text-ink-muted"
            }`}
          >
            {statusLabel ? (
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusIsError ? "bg-red-600" : "bg-gold"}`}
              />
            ) : null}
            {statusLabel}
          </p>
          <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-2 md:justify-self-end">
            <ComposerMenu
              sourcesCount={snapshot.references.length}
              onOpenSources={() => setSheet("sources")}
              onOpenHistory={!isEdit && draft.draftId ? () => setSheet("history") : undefined}
              onOpenDrafts={username ? () => void draft.requestClose(`/${username}?tab=drafts`) : undefined}
              canSaveDraft={canSaveDraft}
              onSaveDraft={() => void draft.flush({ force: true })}
              discardLabel={isEdit ? "Discard changes" : "Discard"}
              canDiscard={canDiscard}
              onDiscard={onDiscard}
            />
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              disabled={!hasBody}
              className="flex min-h-11 shrink-0 items-center justify-center rounded-md px-3 text-sm font-semibold text-emerald-ink transition-colors hover:bg-green-wash disabled:cursor-not-allowed disabled:text-ink-muted/60 md:border md:border-emerald-brand md:px-4 md:disabled:border-divider"
            >
              Preview
            </button>
            <Button
              type="button"
              onClick={() => withCompleteProfile(() => setShowPublish(true))}
              disabled={!canContinue}
              className={WRITE_PRIMARY_BUTTON}
            >
              {isEdit ? "Update Article" : "Continue"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[680px] px-5 pb-40 pt-5 sm:px-8 md:pb-28 md:pt-10">
        {notice}
        <div className="mb-6">
          {/* Keyed on the address so a cover restored from a device copy, or
              carried over from a Post, shows at full size once it exists. */}
          <CoverImageUploader
            key={snapshot.coverImageUrl}
            initialUrl={snapshot.coverImageUrl || undefined}
            onUpload={(coverImageUrl) => setSnapshot((current) => ({ ...current, coverImageUrl }))}
            onRemove={() => setSnapshot((current) => ({ ...current, coverImageUrl: "" }))}
            onUploadingChange={setCoverUploading}
            variant={snapshot.coverImageUrl ? "dropzone" : "compact"}
            previewHeightClass="aspect-[16/9] h-auto"
            emptyTitle="Add cover"
          />
        </div>
        <textarea
          ref={titleRef}
          autoFocus={autoFocusTitle}
          rows={1}
          value={snapshot.title}
          // A title is one line. A pasted one arrives with its line breaks,
          // and Enter moves on to the body.
          onChange={(event) => {
            const title = event.target.value.replace(/\s*\n+\s*/g, " ");
            setSnapshot((current) => ({ ...current, title }));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              editorRef.current?.focus();
            }
          }}
          placeholder="Title"
          aria-label="Title"
          aria-describedby={missingTitle ? "article-title-required" : undefined}
          className="publication-article-title block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[32px] font-semibold leading-[1.16] tracking-[-0.01em] text-ink outline-none placeholder:text-ink-muted/35 sm:text-[44px]"
        />
        {missingTitle ? (
          <p id="article-title-required" className="mt-2 text-sm text-red-600">
            Add a title to continue. An Article needs one, a Post never does.
          </p>
        ) : null}
        <div className="mt-6 sm:mt-8">
          <Editor
            ref={editorRef}
            variant="article"
            content={snapshot.content}
            placeholder="Tell your story."
            ariaLabel="Publication body"
            onUpdate={(content) =>
              setSnapshot((current) => (current.content === content ? current : { ...current, content }))
            }
            onSelectionUpdate={handleSelectionUpdate}
            onImageUploadingChange={setImageUploading}
          />
        </div>
      </main>

      <ArticleMobileToolbar editorRef={editorRef} formats={formats} history={history} />
      {selectedImage ? <ImageDetailsPanel image={selectedImage} onChange={updateImage} /> : null}

      <WriteSheet open={sheet === "sources"} title="Sources" onClose={closeSheet}>
        <p className="mb-3 text-meta text-ink-muted">
          Add a source, then place a citation in the body where it belongs.
        </p>
        <ReferencesPanel
          references={snapshot.references}
          onChange={(references) => setSnapshot((current) => ({ ...current, references }))}
          onInsertCitation={(id) => editorRef.current?.insertCitation(id)}
        />
      </WriteSheet>

      <WriteSheet open={sheet === "history"} title="Version history" onClose={closeSheet}>
        {draft.draftId ? (
          <RevisionHistory
            postId={draft.draftId}
            currentSnapshot={{ title: snapshot.title, excerpt: snapshot.excerpt, content: snapshot.content }}
            onRestore={restoreRevision}
          />
        ) : null}
      </WriteSheet>

      <PublishSettingsDialog
        open={showPublish}
        onClose={closePublish}
        tags={snapshot.tags}
        onTagsChange={(tags) => setSnapshot((current) => ({ ...current, tags }))}
        wordCount={draft.wordCount}
        error={draft.publishError}
        publishing={draft.publishing}
        isUpdate={isEdit}
        canPublish={canContinue}
        onPublish={() => void draft.publish()}
      />

      {/* Reading the piece back at full size, in the type it will be set in. */}
      {showPreview ? (
        <div
          ref={previewRef}
          role="dialog"
          aria-modal="true"
          aria-label="Reader preview"
          className="fixed inset-0 z-[75] overflow-y-auto overscroll-contain bg-canvas"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-divider bg-canvas/95 px-4 py-2 backdrop-blur sm:px-6">
            <p className="text-kicker font-semibold uppercase text-ink-muted">How this reads</p>
            <button
              type="button"
              onClick={closePreview}
              aria-label="Close preview"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <Icon path={CLOSE_ICON} />
            </button>
          </div>
          <ArticlePreview snapshot={snapshot} authorName={authorName} avatarUrl={avatarUrl} wordCount={draft.wordCount} />
        </div>
      ) : null}
    </div>
  );
}
