"use client";

import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

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
  onUpdate?: (html: string, wordCount: number) => void;
  onSelectionUpdate?: () => void;
  canvasMode?: boolean;
}

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
  onUpdate,
  onSelectionUpdate,
  canvasMode = false,
}, ref) {
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [bubbleLinkMode, setBubbleLinkMode] = useState(false);
  const [bubbleLinkUrl, setBubbleLinkUrl] = useState("");
  const [toolbarLinkOpen, setToolbarLinkOpen] = useState(false);
  const [toolbarLinkUrl, setToolbarLinkUrl] = useState("");
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice(navigator.maxTouchPoints > 0);
  }, []);
  const [rawWordCount, setRawWordCount] = useState(() =>
    countWordsFromHtml(content)
  );
  const [displayWordCount, setDisplayWordCount] = useState(() =>
    countWordsFromHtml(content)
  );
  const imageInputRef = useRef<HTMLInputElement>(null);

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
        class: canvasMode
          ? "tiptap write-canvas-editor prose max-w-none focus:outline-none"
          : "tiptap prose max-w-none focus:outline-none p-4",
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      const words = editor.storage.characterCount.words() as number;

      setRawWordCount(words);
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
    if (!editor || editor.getHTML() === content) return;

    editor.commands.setContent(content, false);
    const nextWordCount = countWordsFromHtml(content);
    setRawWordCount(nextWordCount);
    setDisplayWordCount(nextWordCount);
  }, [content, editor]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayWordCount(rawWordCount);
    }, 300);

    return () => clearTimeout(timer);
  }, [rawWordCount]);

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

  return (
    <div
      className={
        canvasMode && displayWordCount === 0 ? "write-canvas-compact" : undefined
      }
    >
      {!canvasMode ? (
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
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive("bulletList")}
            title="Bullet list"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => imageInputRef.current?.click()}
            title="Insert image in article"
          >
            {imageUploading ? (
              <span className="text-xs text-gray-400">...</span>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (editor?.isActive("link")) {
                editor.chain().focus().unsetLink().run();
                return;
              }
              setToolbarLinkUrl(editor?.getAttributes("link").href ?? "");
              setToolbarLinkOpen((prev) => !prev);
            }}
            active={editor?.isActive("link")}
            title="Link"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </ToolbarButton>
        </div>
        {toolbarLinkOpen ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="url"
              autoFocus
              value={toolbarLinkUrl}
              onChange={(e) => setToolbarLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (toolbarLinkUrl.trim()) {
                    editor?.chain().focus().setLink({ href: toolbarLinkUrl.trim() }).run();
                  }
                  setToolbarLinkOpen(false);
                  setToolbarLinkUrl("");
                }
                if (e.key === "Escape") setToolbarLinkOpen(false);
              }}
              placeholder="https://..."
              className="w-64 max-w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
            <button
              type="button"
              onClick={() => {
                if (toolbarLinkUrl.trim()) {
                  editor?.chain().focus().setLink({ href: toolbarLinkUrl.trim() }).run();
                }
                setToolbarLinkOpen(false);
                setToolbarLinkUrl("");
              }}
              className="shrink-0 text-xs font-semibold text-emerald-600"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setToolbarLinkOpen(false)}
              className="shrink-0 text-xs text-gray-400"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
      ) : null}

      {!canvasMode ? (
      <div className="sticky top-0 z-10 hidden border-b border-gray-100 bg-canvas px-4 py-1.5 lg:block">
        <span className={countClasses}>
          {displayWordCount.toLocaleString()} words
          {countMessage ? ` · ${countMessage}` : ""}
        </span>
      </div>
      ) : null}

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

      {editor ? (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100, placement: "top" }}
          shouldShow={({ from, to }) => !isTouchDevice && (bubbleLinkMode || from !== to)}
          className="flex items-center gap-0.5 rounded-xl border border-gray-100 bg-white p-1 shadow-lg shadow-gray-900/10"
        >
          {bubbleLinkMode ? (
            <div className="flex items-center gap-1.5 px-1">
              <input
                type="url"
                autoFocus
                value={bubbleLinkUrl}
                onChange={(e) => setBubbleLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (bubbleLinkUrl.trim()) editor.chain().focus().setLink({ href: bubbleLinkUrl.trim() }).run();
                    setBubbleLinkMode(false);
                    setBubbleLinkUrl("");
                  }
                  if (e.key === "Escape") {
                    setBubbleLinkMode(false);
                    setBubbleLinkUrl("");
                  }
                }}
                placeholder="https://..."
                className="w-44 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand"
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (bubbleLinkUrl.trim()) editor.chain().focus().setLink({ href: bubbleLinkUrl.trim() }).run();
                  setBubbleLinkMode(false);
                  setBubbleLinkUrl("");
                }}
                className="text-xs font-semibold text-emerald-600"
              >
                Apply
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setBubbleLinkMode(false);
                  setBubbleLinkUrl("");
                }}
                className="text-xs text-gray-400"
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-colors ${editor.isActive("bold") ? "bg-emerald-100 text-emerald-700" : "text-gray-700 hover:bg-gray-100"}`}
              >
                B
              </button>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm italic font-medium transition-colors ${editor.isActive("italic") ? "bg-emerald-100 text-emerald-700" : "text-gray-700 hover:bg-gray-100"}`}
              >
                I
              </button>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run(); }}
                className={`flex h-8 items-center justify-center rounded-lg px-2 text-xs font-bold transition-colors ${editor.isActive("heading", { level: 2 }) ? "bg-emerald-100 text-emerald-700" : "text-gray-700 hover:bg-gray-100"}`}
              >
                H2
              </button>
              <div className="mx-0.5 h-5 w-px bg-gray-200" />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (editor.isActive("link")) {
                    editor.chain().focus().unsetLink().run();
                  } else {
                    setBubbleLinkUrl(editor.getAttributes("link").href ?? "");
                    setBubbleLinkMode(true);
                  }
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${editor.isActive("link") ? "bg-emerald-100 text-emerald-700" : "text-gray-700 hover:bg-gray-100"}`}
                title="Link"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
            </>
          )}
        </BubbleMenu>
      ) : null}

      <EditorContent
        editor={editor}
        className={
          canvasMode
            ? displayWordCount === 0
              ? "min-h-[280px] lg:min-h-[380px]"
              : "min-h-[430px]"
            : "min-h-[400px]"
        }
      />

      {canvasMode && displayWordCount > 0 ? (
        <div className="pb-1 text-right text-xs text-gray-400">
          {displayWordCount.toLocaleString()} word{displayWordCount === 1 ? "" : "s"}
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

