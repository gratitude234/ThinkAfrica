"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PostReferenceRecord, ReferenceType } from "@/lib/types";
import type { PostType } from "@/lib/utils";

export interface EditorHandle {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleH2: () => void;
  toggleBulletList: () => void;
  toggleBlockquote: () => void;
  isActive: (name: string, attrs?: Record<string, unknown>) => boolean;
  undo: () => void;
  redo: () => void;
  triggerImageUpload: () => void;
  insertLink: (url: string) => void;
}

interface EditorProps {
  content?: string;
  placeholder?: string;
  minWords?: number;
  postType?: PostType;
  references?: PostReferenceRecord[];
  onReferencesChange?: (references: PostReferenceRecord[]) => void;
  onUpdate?: (html: string, wordCount: number) => void;
  onAutoSave?: () => void | Promise<void>;
  onSelectionUpdate?: () => void;
}

type SaveStatus = "saved" | "saving" | "unsaved";

function countWordsFromHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function wordCountMessage(count: number, minWords: number) {
  if (minWords <= 50) return "";
  if (count < 50) return "Just getting started";
  if (count < minWords * 0.25) return "Keep going";
  if (count < minWords * 0.75) return "Good progress";
  if (count < minWords) return "Almost there";
  return "Target reached";
}

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({
  content = "",
  placeholder = "Start writing your piece...",
  minWords = 0,
  postType = "blog",
  references = [],
  onReferencesChange,
  onUpdate,
  onAutoSave,
  onSelectionUpdate,
}, ref) {
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [rawWordCount, setRawWordCount] = useState(() =>
    countWordsFromHtml(content)
  );
  const [displayWordCount, setDisplayWordCount] = useState(() =>
    countWordsFromHtml(content)
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [changeTick, setChangeTick] = useState(0);
  const [localReferences, setLocalReferences] = useState<PostReferenceRecord[]>(
    references
  );
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalReferences(references);
  }, [references]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      CharacterCount,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "tiptap prose max-w-none focus:outline-none p-4",
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      const words = editor.storage.characterCount.words() as number;

      setRawWordCount(words);
      setSaveStatus("unsaved");
      setChangeTick((current) => current + 1);
      onUpdate?.(html, words);
      onSelectionUpdate?.();
    },
    onSelectionUpdate() {
      onSelectionUpdate?.();
    },
    immediatelyRender: false,
  });

  useImperativeHandle(ref, () => ({
    toggleBold: () => editor?.chain().focus().toggleBold().run(),
    toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
    toggleH2: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
    toggleBlockquote: () => editor?.chain().focus().toggleBlockquote().run(),
    isActive: (name, attrs) => editor?.isActive(name, attrs) ?? false,
    undo: () => editor?.chain().focus().undo().run(),
    redo: () => editor?.chain().focus().redo().run(),
    triggerImageUpload: () => imageInputRef.current?.click(),
    insertLink: (url: string) => {
      if (!url.trim()) {
        editor?.chain().focus().unsetLink().run();
        return;
      }
      editor?.chain().focus().setLink({ href: url.trim() }).run();
    },
  }));

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayWordCount(rawWordCount);
    }, 300);

    return () => clearTimeout(timer);
  }, [rawWordCount]);

  useEffect(() => {
    if (!onAutoSave || changeTick === 0) {
      return;
    }

    const timer = setTimeout(async () => {
      setSaveStatus("saving");

      try {
        await onAutoSave();
      } catch {
        // Autosave is intentionally silent.
      } finally {
        setTimeout(() => {
          setSaveStatus("saved");
        }, 500);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [changeTick, onAutoSave]);

  const countClasses =
    minWords > 0 && displayWordCount >= minWords
      ? "text-xs font-medium text-emerald-600"
      : minWords > 0 && displayWordCount < 100
        ? "text-xs text-amber-500"
        : "text-xs text-gray-500";

  const handleImageFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;

    setImageUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/upload-image", {
        method: "POST",
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
        body: formData,
      });
      const json = await response.json();
      if (json.url) {
        editor.chain().focus().setImage({ src: json.url }).run();
        setImageUploadError(null);
      } else {
        const msg = json.error ?? "Upload failed. Check the file type and size.";
        setImageUploadError(msg);
        setTimeout(() => setImageUploadError(null), 6000);
      }
    } catch {
      setImageUploadError("Couldn't upload image. Check your connection and try again.");
      setTimeout(() => setImageUploadError(null), 6000);
    } finally {
      setImageUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const countMessage =
    minWords > 0 ? wordCountMessage(displayWordCount, minWords) : "";

  const showReferences = postType === "research" || postType === "policy_brief";

  const updateReferences = (nextReferences: PostReferenceRecord[]) => {
    setLocalReferences(nextReferences);
    onReferencesChange?.(nextReferences);
    setSaveStatus("unsaved");
    setChangeTick((current) => current + 1);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="hidden border-b border-gray-200 bg-canvas p-2 lg:block">
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive("bold")}
            title="Bold"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h8a4 4 0 010 8H6zm0 8h9a4 4 0 010 8H6z" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive("italic")}
            title="Italic"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 4h-9M14 20H5M15 4 9 20" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor?.isActive("heading", { level: 2 })}
            title="Heading 2"
          >
            <span className="text-sm font-bold">H2</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor?.isActive("heading", { level: 3 })}
            title="Heading 3"
          >
            <span className="text-sm font-bold">H3</span>
          </ToolbarButton>
          <div className="mx-1 h-5 w-px bg-gray-300" />
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive("bulletList")}
            title="Bullet list"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive("orderedList")}
            title="Ordered list"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10H3M3 14h2v1h-2v1h2M3 20h2" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            active={editor?.isActive("blockquote")}
            title="Blockquote"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleCode().run()}
            active={editor?.isActive("code")}
            title="Inline code"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
            </svg>
          </ToolbarButton>
          <div className="mx-1 h-5 w-px bg-gray-300" />
          <ToolbarButton
            onClick={() => imageInputRef.current?.click()}
            title="Insert image"
          >
            {imageUploading ? (
              <span className="text-xs text-gray-400">...</span>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </ToolbarButton>
          <div className="mx-1 h-5 w-px bg-gray-300" />
          <ToolbarButton
            onClick={() => editor?.chain().focus().undo().run()}
            title="Undo"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 010 16H9M3 10l4-4M3 10l4 4" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().redo().run()}
            title="Redo"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 000 16h4M21 10l-4-4M21 10l-4 4" />
            </svg>
          </ToolbarButton>
        </div>
      </div>

      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-1.5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <span className={countClasses}>
              {displayWordCount.toLocaleString()} words
              {countMessage ? ` · ${countMessage}` : ""}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {saveStatus === "saving" ? (
              <>
                <svg
                  className="h-3.5 w-3.5 animate-spin text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                <span className="text-xs text-gray-400">saving...</span>
              </>
            ) : null}

            {saveStatus === "saved" ? (
              <span className="text-xs text-emerald-500">Saved</span>
            ) : null}

            {saveStatus === "unsaved" ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                <span className="text-xs text-gray-300">Unsaved</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileChange}
      />

      {imageUploadError ? (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {imageUploadError}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="ml-2 font-medium underline hover:text-red-900"
          >
            Try again
          </button>
        </div>
      ) : null}

      <EditorContent editor={editor} className="min-h-[400px]" />

      {showReferences ? (
        <div className="border-t border-gray-200 bg-canvas px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">References</h3>
              <p className="text-xs text-gray-500">
                Use structured source data here and cite it inline with `[ref:1]`, `[ref:2]`, and so on in the body.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                updateReferences([
                  ...localReferences,
                  {
                    id: `temp-${Date.now()}-${localReferences.length}`,
                    post_id: "",
                    display_order: localReferences.length,
                    ref_type: "other",
                    authors: "",
                    title: "",
                    year: null,
                    source: "",
                    url: "",
                    doi: "",
                    raw: "",
                  },
                ])
              }
              className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              Add reference
            </button>
          </div>

          <div className="space-y-3">
            {localReferences.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500">
                No references yet.
              </div>
            ) : (
              localReferences.map((reference, index) => (
                <ReferenceRow
                  key={reference.id || `reference-${index}`}
                  index={index}
                  reference={reference}
                  canMoveUp={index > 0}
                  canMoveDown={index < localReferences.length - 1}
                  onMove={(direction) => {
                    const nextReferences = [...localReferences];
                    const targetIndex = direction === "up" ? index - 1 : index + 1;
                    const [item] = nextReferences.splice(index, 1);
                    nextReferences.splice(targetIndex, 0, item);
                    updateReferences(
                      nextReferences.map((row, rowIndex) => ({
                        ...row,
                        display_order: rowIndex,
                      }))
                    );
                  }}
                  onChange={(nextReference) => {
                    const nextReferences = localReferences.map((row, rowIndex) =>
                      rowIndex === index
                        ? {
                            ...nextReference,
                            display_order: index,
                          }
                        : row
                    );
                    updateReferences(nextReferences);
                  }}
                  onRemove={() => {
                    updateReferences(
                      localReferences
                        .filter((_, rowIndex) => rowIndex !== index)
                        .map((row, rowIndex) => ({
                          ...row,
                          display_order: rowIndex,
                        }))
                    );
                  }}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default Editor;

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded px-2 py-1 text-sm font-medium transition-colors ${
        active
          ? "bg-emerald-brand text-white"
          : "text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function ReferenceRow({
  index,
  reference,
  canMoveUp,
  canMoveDown,
  onMove,
  onChange,
  onRemove,
}: {
  index: number;
  reference: PostReferenceRecord;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down") => void;
  onChange: (reference: PostReferenceRecord) => void;
  onRemove: () => void;
}) {
  const inputClasses =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">Reference {index + 1}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={!canMoveUp}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={!canMoveDown}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-medium text-gray-600">
          Type
          <select
            value={reference.ref_type ?? "other"}
            onChange={(event) =>
              onChange({
                ...reference,
                ref_type: event.target.value as ReferenceType,
              })
            }
            className={`${inputClasses} mt-1`}
          >
            {["journal", "book", "website", "report", "other"].map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600">
          Authors
          <input
            type="text"
            value={reference.authors ?? ""}
            onChange={(event) =>
              onChange({ ...reference, authors: event.target.value })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600 md:col-span-2">
          Title
          <input
            type="text"
            value={reference.title}
            onChange={(event) =>
              onChange({ ...reference, title: event.target.value })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Year
          <input
            type="number"
            value={reference.year ?? ""}
            onChange={(event) =>
              onChange({
                ...reference,
                year: event.target.value ? Number(event.target.value) : null,
              })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Source
          <input
            type="text"
            value={reference.source ?? ""}
            onChange={(event) =>
              onChange({ ...reference, source: event.target.value })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          URL
          <input
            type="url"
            value={reference.url ?? ""}
            onChange={(event) =>
              onChange({ ...reference, url: event.target.value })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          DOI
          <input
            type="text"
            value={reference.doi ?? ""}
            onChange={(event) =>
              onChange({ ...reference, doi: event.target.value })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600 md:col-span-2">
          Note
          <textarea
            value={reference.raw ?? ""}
            onChange={(event) =>
              onChange({ ...reference, raw: event.target.value })
            }
            rows={2}
            className={`${inputClasses} mt-1 resize-none`}
            placeholder="Optional note for edition, page range, archive details, or context."
          />
        </label>
      </div>
    </div>
  );
}
