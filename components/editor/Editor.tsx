"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Image from "@tiptap/extension-image";
import { useEffect, useRef, useState } from "react";

interface EditorProps {
  content?: string;
  placeholder?: string;
  minWords?: number;
  onUpdate?: (html: string, wordCount: number) => void;
  onAutoSave?: () => void | Promise<void>;
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

export default function Editor({
  content = "",
  placeholder = "Start writing your piece...",
  minWords = 0,
  onUpdate,
  onAutoSave,
}: EditorProps) {
  const [imageUploading, setImageUploading] = useState(false);
  const [rawWordCount, setRawWordCount] = useState(() =>
    countWordsFromHtml(content)
  );
  const [displayWordCount, setDisplayWordCount] = useState(() =>
    countWordsFromHtml(content)
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [changeTick, setChangeTick] = useState(0);
  const [showMoreToolbar, setShowMoreToolbar] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      CharacterCount,
      Image.configure({ inline: false, allowBase64: false }),
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
    },
    immediatelyRender: false,
  });

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
      }
    } catch {
      // silently fail
    } finally {
      setImageUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const countMessage =
    minWords > 0 ? wordCountMessage(displayWordCount, minWords) : "";

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-canvas p-2">
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive("bold")}
            title="Bold"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive("italic")}
            title="Italic"
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 2 }).run()
            }
            active={editor?.isActive("heading", { level: 2 })}
            title="Heading 2"
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive("bulletList")}
            title="Bullet list"
          >
            List
          </ToolbarButton>
          <button
            type="button"
            onClick={() => setShowMoreToolbar((current) => !current)}
            className="rounded px-2 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 md:hidden"
          >
            More...
          </button>

          <div className="hidden items-center gap-1 md:flex">
            <ToolbarButton
              onClick={() =>
                editor?.chain().focus().toggleHeading({ level: 3 }).run()
              }
              active={editor?.isActive("heading", { level: 3 })}
              title="Heading 3"
            >
              H3
            </ToolbarButton>
            <div className="mx-1 h-5 w-px bg-gray-300" />
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              active={editor?.isActive("orderedList")}
              title="Ordered list"
            >
              1.
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              active={editor?.isActive("blockquote")}
              title="Blockquote"
            >
              &ldquo;
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleCode().run()}
              active={editor?.isActive("code")}
              title="Inline code"
            >
              &lt;&gt;
            </ToolbarButton>
            <div className="mx-1 h-5 w-px bg-gray-300" />
            <ToolbarButton
              onClick={() => imageInputRef.current?.click()}
              title="Insert image"
            >
              {imageUploading ? (
                <span className="text-xs">...</span>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              )}
            </ToolbarButton>
            <div className="mx-1 h-5 w-px bg-gray-300" />
            <ToolbarButton
              onClick={() => editor?.chain().focus().undo().run()}
              title="Undo"
            >
              Undo
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().redo().run()}
              title="Redo"
            >
              Redo
            </ToolbarButton>
          </div>
        </div>

        {showMoreToolbar ? (
          <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-gray-200 pt-2 md:hidden">
            <ToolbarButton
              onClick={() =>
                editor?.chain().focus().toggleHeading({ level: 3 }).run()
              }
              active={editor?.isActive("heading", { level: 3 })}
              title="Heading 3"
            >
              H3
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              active={editor?.isActive("orderedList")}
              title="Ordered list"
            >
              1.
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              active={editor?.isActive("blockquote")}
              title="Blockquote"
            >
              &ldquo;
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().toggleCode().run()}
              active={editor?.isActive("code")}
              title="Inline code"
            >
              &lt;&gt;
            </ToolbarButton>
            <ToolbarButton
              onClick={() => imageInputRef.current?.click()}
              title="Insert image"
            >
              {imageUploading ? (
                <span className="text-xs">...</span>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              )}
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().undo().run()}
              title="Undo"
            >
              Undo
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor?.chain().focus().redo().run()}
              title="Redo"
            >
              Redo
            </ToolbarButton>
          </div>
        ) : null}
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

      <EditorContent editor={editor} className="min-h-[400px]" />
    </div>
  );
}

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
