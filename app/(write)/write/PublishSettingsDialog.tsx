"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import TagInput from "@/components/ui/TagInput";
import { isWrittenExcerpt } from "@/lib/contribution";
import { lengthLabel } from "./ArticlePreview";
import FeedCardPreview from "./FeedCardPreview";
import WriteSheet from "./WriteSheet";
import { WRITE_PRIMARY_BUTTON, WRITE_TEXT_BUTTON } from "./writeStyles";

/** Room for three lines on the card and a little over. The opening lines stop at 240. */
const SUMMARY_MAX_LENGTH = 280;

interface PublishSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  authorName: string;
  avatarUrl: string | null;
  /** The summary as stored: empty means the feed uses the opening lines. */
  summary: string;
  /** The opening of the body, as the feed carries it when there is no summary. */
  openingLines: string;
  onSummaryChange: (summary: string) => void;
  coverImageUrl: string;
  onCoverChange: (coverImageUrl: string) => void;
  onCoverUploadingChange: (uploading: boolean) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  wordCount: number;
  error: string | null;
  publishing: boolean;
  isUpdate: boolean;
  canPublish: boolean;
  onPublish: () => void;
}

const FIELD_LABEL = "mb-2 block text-kicker font-semibold uppercase text-ink";

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  const text = (
    <>
      {children} <span className="font-normal normal-case tracking-normal text-ink-muted">(optional)</span>
    </>
  );
  return htmlFor ? (
    <label htmlFor={htmlFor} className={FIELD_LABEL}>
      {text}
    </label>
  ) : (
    <p className={FIELD_LABEL}>{text}</p>
  );
}

/**
 * The summary starts as the opening lines, as real text the writer can edit,
 * and nothing is stored until they do. Left alone, the feed keeps following
 * the body. Edited back to exactly the opening lines, or emptied, it follows
 * the body again.
 */
function SummaryField({
  summary,
  openingLines,
  onChange,
  disabled,
}: {
  summary: string;
  openingLines: string;
  onChange: (summary: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  const hintId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Null until the writer changes the field, so an emptied field stays empty
  // rather than filling itself back in.
  const [typed, setTyped] = useState<string | null>(null);
  const ownSummary = Boolean(summary.trim()) && summary.trim() !== openingLines.trim();
  const value = typed ?? (summary.trim() ? summary : openingLines);

  // As tall as what is in it: the opening lines run to six on a phone, and a
  // summary cut off at the fourth is not one anybody can check.
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [value]);

  return (
    <div>
      <FieldLabel htmlFor={id}>Summary</FieldLabel>
      <textarea
        ref={fieldRef}
        id={id}
        rows={3}
        value={value}
        maxLength={SUMMARY_MAX_LENGTH}
        placeholder={openingLines}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => {
          // One paragraph: the card prints it as one.
          const next = event.target.value.replace(/\s*\n+\s*/g, " ");
          setTyped(next);
          onChange(next.trim() === openingLines.trim() ? "" : next);
        }}
        onKeyDown={(event) => {
          // Cmd/Ctrl+Enter still reaches the dialog and publishes.
          if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) event.preventDefault();
        }}
        className="block w-full resize-none overflow-hidden rounded-lg border border-card-border bg-canvas px-3 py-2 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-muted/60 focus:border-emerald-brand focus:ring-2 focus:ring-emerald-brand/20 disabled:opacity-60"
      />
      <p id={hintId} className="mt-1.5 text-meta text-ink-muted">
        {!ownSummary
          ? "From your opening lines. Edit it to write your own."
          : // The page prints a summary under the title only when it is not
            // the start of the body, which would print the opening twice.
            isWrittenExcerpt(summary, openingLines)
            ? "Shown under the title, in the feed and on the page."
            : "Shown under the title in the feed."}
      </p>
      {ownSummary ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setTyped(null);
            onChange("");
          }}
          className="-ml-2 min-h-11 rounded-md px-2 text-sm font-semibold text-emerald-ink transition-colors hover:bg-green-wash disabled:opacity-40"
        >
          Use the opening lines
        </button>
      ) : null}
    </div>
  );
}

/**
 * The last step for an Article, and only an Article: a Post publishes from its
 * own button. It is the card as the feed will show it, then what changes the
 * card (the cover, the summary and the topics), then Publish now. On a phone
 * the card comes first and the fields follow it. From md up they sit side by
 * side, as on Medium's publish screen, so a change shows on the card without a
 * scroll. The reader preview is one tap away in the editor, so this does not
 * repeat it.
 */
export default function PublishSettingsDialog({
  open,
  onClose,
  title,
  authorName,
  avatarUrl,
  summary,
  openingLines,
  onSummaryChange,
  coverImageUrl,
  onCoverChange,
  onCoverUploadingChange,
  tags,
  onTagsChange,
  wordCount,
  error,
  publishing,
  isUpdate,
  canPublish,
  onPublish,
}: PublishSettingsDialogProps) {
  const previewLabelId = useId();

  return (
    <WriteSheet
      open={open}
      title="Publish settings"
      desktop="wide"
      onClose={onClose}
      busy={publishing}
      closeButton={false}
      // Cmd/Ctrl+Enter is the muscle memory for "send this", and this dialog
      // is the one place where it is unambiguous.
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canPublish && !publishing) {
          event.preventDefault();
          onPublish();
        }
      }}
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} disabled={publishing} className={`${WRITE_TEXT_BUTTON} -ml-2 disabled:opacity-40`}>
            Cancel
          </button>
          <Button type="button" onClick={onPublish} loading={publishing} disabled={!canPublish} className={`${WRITE_PRIMARY_BUTTON} px-6`}>
            {/* "now": the header's Publish opened this, and this one is final. */}
            {isUpdate ? "Update now" : "Publish now"}
          </Button>
        </div>
      }
    >
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-8">
        {/* Held in view from md up while the fields beside it scroll. */}
        <div className="md:sticky md:top-0">
          <p id={previewLabelId} className="mb-2 text-kicker font-semibold uppercase text-ink">
            In the feed
          </p>
          <div role="group" aria-labelledby={previewLabelId}>
            <FeedCardPreview
              title={title}
              summary={summary.trim() || openingLines}
              coverImageUrl={coverImageUrl}
              tags={tags}
              wordCount={wordCount}
              authorName={authorName}
              avatarUrl={avatarUrl}
            />
          </div>
        </div>

        <div className="mt-5 space-y-5 md:mt-0">
          <div>
            <FieldLabel>Cover</FieldLabel>
            {/* Keyed on the address, like the one under the title, so a cover
                changed in either place shows in both. */}
            <CoverImageUploader
              key={coverImageUrl}
              initialUrl={coverImageUrl || undefined}
              onUpload={onCoverChange}
              onRemove={() => onCoverChange("")}
              onUploadingChange={onCoverUploadingChange}
              variant="compact"
              emptyTitle="Add cover"
            />
          </div>

          <SummaryField summary={summary} openingLines={openingLines} onChange={onSummaryChange} disabled={publishing} />

          <div>
            <FieldLabel>Topics</FieldLabel>
            <TagInput
              value={tags}
              onChange={onTagsChange}
              showLabel={false}
              maxTags={5}
              placeholder="Add a topic"
              disabled={publishing}
            />
          </div>
          <p className="text-meta text-ink-muted">{lengthLabel(wordCount)}</p>
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </WriteSheet>
  );
}
