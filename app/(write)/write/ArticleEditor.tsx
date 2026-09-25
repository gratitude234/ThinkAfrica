"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import ReferencesPanel from "@/components/post/ReferencesPanel";
import type { EditorHandle, SelectedImage } from "@/components/editor/Editor";
import { CLOSE_ICON, Icon } from "@/components/editor/editorIcons";
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
import WriteHeader, { writeStatus } from "./WriteHeader";
import { WRITE_OUTLINE_BUTTON, WRITE_PRIMARY_BUTTON } from "./writeStyles";

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
/** What the writer last pressed before the piece was ready for it. */
type Nudge = "publish" | "preview" | null;

function sameFormats(left: FormatState, right: FormatState) {
  return (Object.keys(left) as Array<keyof FormatState>).every((key) => left[key] === right[key]);
}

/**
 * The long-form screen: a required title, a cover and a rich body, set in the
 * live article page's type and in the order the published page shows them.
 * Formatting is a selection toolbar and a "+" menu on a desktop, and a
 * toolbar on the keyboard on a phone. Publish opens Publish settings.
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
  const [bodyFocused, setBodyFocused] = useState(false);
  const [nudge, setNudge] = useState<Nudge>(null);

  const isEdit = mode === "published-edit";
  const hasTitle = Boolean(snapshot.title.trim());
  const hasBody = Boolean(draft.bodyText);
  const uploading = imageUploading || coverUploading;
  const canPublish = hasTitle && hasBody && !uploading;
  // Publish and Preview stay pressable when the piece is not ready, and a
  // press says what is missing next to the field that is missing it. A button
  // that only turns grey tells a new writer nothing.
  const missingTitle = !hasTitle && (hasBody || nudge === "publish");
  const missingBody = !hasBody && nudge !== null;
  const canSaveDraft = hasMeaningfulContribution(snapshot);
  const canDiscard = isEdit ? Boolean(draft.editDraftId) : Boolean(draft.draftId) || canSaveDraft;
  const status = writeStatus(draft, uploading);

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
      hasSelection: editor.hasSelection(),
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

  const openPreview = () => {
    if (!hasBody) {
      setNudge("preview");
      editorRef.current?.focus();
      return;
    }
    setShowPreview(true);
  };

  const openPublish = () => {
    if (!hasTitle || !hasBody) {
      setNudge("publish");
      if (!hasTitle) titleRef.current?.focus();
      else editorRef.current?.focus();
      return;
    }
    withCompleteProfile(() => setShowPublish(true));
  };

  return (
    <div className="min-h-dvh bg-canvas text-ink md:min-h-[calc(100dvh-var(--app-nav-height))]">
      <WriteHeader
        status={status}
        onBack={onBack}
        hasAppNav={hasAppNav}
        heading={isEdit ? "Edit article" : "New article"}
        menu={
          <ComposerMenu
            onPreview={openPreview}
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
        }
        secondary={
          <button
            type="button"
            onClick={openPreview}
            aria-disabled={!hasBody || undefined}
            aria-describedby={missingBody ? "article-body-required" : undefined}
            className={`${WRITE_OUTLINE_BUTTON} aria-disabled:border-divider aria-disabled:text-ink-muted/60 aria-disabled:hover:bg-transparent`}
          >
            Preview
          </button>
        }
        primary={
          <Button
            type="button"
            onClick={openPublish}
            // An image still uploading is the one wait that explains itself:
            // the status already says "Adding image…".
            disabled={uploading}
            aria-disabled={!canPublish || undefined}
            aria-describedby={
              missingTitle ? "article-title-required" : missingBody ? "article-body-required" : undefined
            }
            className={WRITE_PRIMARY_BUTTON}
          >
            {isEdit ? "Update" : "Publish"}
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-[680px] px-5 pb-40 pt-5 sm:px-8 md:pb-28 md:pt-10">
        {notice}
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
          className="publication-article-title block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[32px] font-semibold leading-[1.16] tracking-[-0.01em] text-ink outline-none placeholder:text-ink-muted/60 sm:text-[44px]"
        />
        {missingTitle ? (
          <p id="article-title-required" aria-live="polite" className="mt-2 text-sm text-red-600">
            Add a title to publish. An Article needs one, a Post never does.
          </p>
        ) : null}
        {/* Below the title, where the published page shows it. Keyed on the
            address so a cover restored from a device copy, or carried over
            from a Post, shows at full size once it exists. */}
        <div className="mt-5">
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
            onFocusChange={setBodyFocused}
          />
          {missingBody ? (
            <p id="article-body-required" aria-live="polite" className="mt-3 text-sm text-red-600">
              {nudge === "preview" ? "Write something here to preview it." : "Write something here to publish."}
            </p>
          ) : null}
        </div>
      </main>

      <ArticleMobileToolbar editorRef={editorRef} formats={formats} history={history} active={bodyFocused} />
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
        canPublish={canPublish}
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
