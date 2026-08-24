"use client";

import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import { mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import type { EditorView } from "@tiptap/pm/view";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * An image on a publication is rarely just a picture. It has a source, a
 * photographer, or a chart it came from, and none of that survives in a bare
 * <img>. This renders as <figure><img><figcaption> when a caption exists and
 * as a plain <img> when it does not, so the many images already published
 * without one keep parsing and re-serializing unchanged.
 */
const CaptionedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-caption"),
        // The caption is rendered as figcaption text below, never as an
        // attribute on the img itself.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure",
        getAttrs: (element) => {
          const image = (element as HTMLElement).querySelector("img");
          if (!image?.getAttribute("src")) return false;
          return {
            src: image.getAttribute("src"),
            alt: image.getAttribute("alt"),
            title: image.getAttribute("title"),
            caption:
              (element as HTMLElement).querySelector("figcaption")?.textContent?.trim() || null,
          };
        },
      },
      { tag: "img[src]" },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const image = [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ] as DOMOutputSpec;
    const caption = typeof node.attrs.caption === "string" ? node.attrs.caption.trim() : "";
    return (
      caption ? ["figure", {}, image, ["figcaption", {}, caption]] : image
    ) as DOMOutputSpec;
  },
});

export interface SelectedImage {
  src: string;
  alt: string;
  caption: string;
}

export interface EditorHandle {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleH2: () => void;
  toggleH3: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleBlockquote: () => void;
  insertDivider: () => void;
  isActive: (name: string, attrs?: Record<string, unknown>) => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  triggerImageUpload: () => void;
  insertLink: (url: string) => void;
  insertCitation: (referenceId: string) => void;
  getSelectedImage: () => SelectedImage | null;
  updateSelectedImage: (attrs: { alt?: string; caption?: string }) => void;
}

interface EditorProps {
  content?: string;
  placeholder?: string;
  minWords?: number;
  onUpdate?: (html: string, wordCount: number) => void;
  onSelectionUpdate?: () => void;
  canvasMode?: boolean;
  ariaLabel?: string;
  showWordCount?: boolean;
  /** Places the caret in the body on mount, for a canvas that opens body-first. */
  autoFocus?: boolean;
}

function imageFilesFrom(data: DataTransfer | null) {
  if (!data) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
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
  placeholder = "Start writing…",
  minWords = 0,
  onUpdate,
  onSelectionUpdate,
  canvasMode = false,
  ariaLabel = "Article body",
  showWordCount = true,
  autoFocus = false,
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
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUploadError = useCallback((message: string) => {
    setImageUploadError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setImageUploadError(null), 6000);
  }, []);

  const uploadImageFile = useCallback(
    async (file: File): Promise<string | null> => {
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
          setImageUploadError(null);
          return json.url as string;
        }
        showUploadError(json.error ?? "Upload failed. Check the file type and size.");
        return null;
      } catch {
        showUploadError("Couldn't upload image. Check your connection and try again.");
        return null;
      } finally {
        setImageUploading(false);
      }
    },
    [showUploadError]
  );

  /**
   * Dropping onto a position and pasting at the caret are the same operation
   * once the file is uploaded, so both land here. Files upload one at a time
   * and each lands after the one before it, which is the order they were
   * dropped in.
   */
  const insertImageFiles = useCallback(
    async (view: EditorView, files: File[], at: number | null) => {
      let position = at;
      for (const file of files) {
        const url = await uploadImageFile(file);
        if (!url) continue;
        const { state } = view;
        const node = state.schema.nodes.image?.create({ src: url });
        if (!node) continue;
        const insertAt = Math.min(position ?? state.selection.to, state.doc.content.size);
        view.dispatch(state.tr.insert(insertAt, node));
        position = insertAt + node.nodeSize;
      }
    },
    [uploadImageFile]
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      CharacterCount,
      // Curly quotes, real ellipses and proper dashes, applied as the writer
      // types. A publication set in Bodoni should not ship typewriter quotes.
      Typography,
      CaptionedImage.configure({ inline: false, allowBase64: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: canvasMode
          ? "tiptap write-canvas-editor prose max-w-none focus:outline-none"
          : "tiptap prose max-w-none focus:outline-none p-4",
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        role: "textbox",
      },
      handlePaste: (view, event) => {
        // Copying from a word processor puts both markup and an image on the
        // clipboard. The markup is the thing the writer meant to paste.
        if (event.clipboardData?.getData("text/html")) return false;
        const files = imageFilesFrom(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        void insertImageFiles(view, files, null);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        // `moved` is an image already in the document being dragged to a new
        // position, which ProseMirror handles correctly on its own.
        if (moved) return false;
        const dragEvent = event as DragEvent;
        const files = imageFilesFrom(dragEvent.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        const coords = view.posAtCoords({
          left: dragEvent.clientX,
          top: dragEvent.clientY,
        });
        void insertImageFiles(view, files, coords?.pos ?? null);
        return true;
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
    toggleH3: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
    toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
    toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
    toggleBlockquote: () => editor?.chain().focus().toggleBlockquote().run(),
    insertDivider: () => editor?.chain().focus().setHorizontalRule().run(),
    isActive: (name, attrs) => editor?.isActive(name, attrs) ?? false,
    undo: () => editor?.chain().focus().undo().run(),
    redo: () => editor?.chain().focus().redo().run(),
    canUndo: () => editor?.can().undo() ?? false,
    canRedo: () => editor?.can().redo() ?? false,
    triggerImageUpload: () => imageInputRef.current?.click(),
    getSelectedImage: () => {
      if (!editor?.isActive("image")) return null;
      const attrs = editor.getAttributes("image");
      return {
        src: typeof attrs.src === "string" ? attrs.src : "",
        alt: typeof attrs.alt === "string" ? attrs.alt : "",
        caption: typeof attrs.caption === "string" ? attrs.caption : "",
      };
    },
    // Deliberately not chained through .focus(): the writer is typing in the
    // caption field at this moment, and pulling focus back into the body after
    // every keystroke would make the field unusable. ProseMirror keeps its
    // selection while the DOM focus is elsewhere, so the node still resolves.
    updateSelectedImage: ({ alt, caption }) => {
      if (!editor?.isActive("image")) return;
      // Stored exactly as typed. Trimming here would delete the space the
      // writer just typed between two words, because the trimmed value echoes
      // straight back into the field on the next selection update. The trim
      // that matters happens once, in renderHTML.
      const kept = (value: string) => (value.trim() ? value : null);
      editor.commands.updateAttributes("image", {
        ...(alt !== undefined ? { alt: kept(alt) } : {}),
        ...(caption !== undefined ? { caption: kept(caption) } : {}),
      });
    },
    insertLink: (url: string) => {
      if (!url.trim()) {
        editor?.chain().focus().unsetLink().run();
        return;
      }
      editor?.chain().focus().setLink({ href: url.trim() }).run();
    },
    insertCitation: (referenceId: string) => {
      const stableId = referenceId.replace(/^temp-/, "").trim();
      if (!stableId || !/^[a-zA-Z0-9-]+$/.test(stableId)) return;
      editor
        ?.chain()
        .focus()
        .insertContent(`<a href="#ref-id-${stableId}">[source]</a>`)
        .run();
    },
  }));

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
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
    const files = Array.from(event.target.files ?? []);
    if (!files.length || !editor) return;

    try {
      await insertImageFiles(editor.view, files, null);
    } finally {
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
        multiple
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

      {canvasMode && showWordCount && displayWordCount > 0 ? (
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

