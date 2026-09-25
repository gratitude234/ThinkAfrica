"use client";

import Button from "@/components/ui/Button";
import TagInput from "@/components/ui/TagInput";
import { lengthLabel } from "./ArticlePreview";
import WriteSheet from "./WriteSheet";
import { WRITE_PRIMARY_BUTTON, WRITE_TEXT_BUTTON } from "./writeStyles";

interface PublishSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  wordCount: number;
  error: string | null;
  publishing: boolean;
  isUpdate: boolean;
  canPublish: boolean;
  onPublish: () => void;
}

/**
 * The last step for an Article, and only an Article: a Post publishes from its
 * own button. Topics, then the length, then Publish. The reader preview is one
 * tap away in the editor's header, so this does not repeat it.
 */
export default function PublishSettingsDialog({
  open,
  onClose,
  tags,
  onTagsChange,
  wordCount,
  error,
  publishing,
  isUpdate,
  canPublish,
  onPublish,
}: PublishSettingsDialogProps) {
  return (
    <WriteSheet
      open={open}
      title="Publish settings"
      desktop="dialog"
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
            {isUpdate ? "Update" : "Publish"}
          </Button>
        </div>
      }
    >
      <p className="mb-2 text-kicker font-semibold uppercase text-ink">
        Topics <span className="font-normal normal-case tracking-normal text-ink-muted">(optional)</span>
      </p>
      <TagInput
        value={tags}
        onChange={onTagsChange}
        showLabel={false}
        maxTags={5}
        placeholder="Add a topic"
        disabled={publishing}
      />
      <p className="mt-4 text-meta text-ink-muted">{lengthLabel(wordCount)}</p>
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </WriteSheet>
  );
}
