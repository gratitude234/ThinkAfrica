"use client";

import { BubbleMenu, EditorContent, FloatingMenu, useEditor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { uploadImage } from "@/lib/uploadImage";
import {
  ALIGNMENT_OPTIONS,
  BULLETS_ICON,
  DIVIDER_ICON,
  IMAGE_ICON,
  Icon,
  NUMBERS_ICON,
  PLUS_ICON,
} from "./editorIcons";
import {
  caretInEmptyBlock,
  editorExtensions,
  stripPastedImages,
  TEXT_ALIGNMENTS,
  type TextAlignment,
} from "./extensions";

export type { TextAlignment } from "./extensions";

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
  setTextAlign: (alignment: TextAlignment) => void;
  /** The alignment at the caret, or "left" when a selection spans several. */
  getTextAlign: () => TextAlignment;
  /** Puts the caret at the start of the body, for the title field's Enter key. */
  focus: () => void;
}

export type EditorVariant = "post" | "article";

interface EditorProps {
  content?: string;
  placeholder?: string;
  /**
   * "article" is the full editor, with the selection toolbar and the "+"
   * insert menu. "post" shows no tools and never places an image in the
   * text: an image pasted or dropped into it goes to onImageFile, which
   * attaches it to the Post instead.
   */
  variant?: EditorVariant;
  onUpdate?: (html: string) => void;
  onSelectionUpdate?: () => void;
  /**
   * Reported so a host that hides this component's own chrome can still say
   * something is happening. Pasting a large photo otherwise looks like nothing
   * happened until it suddenly appears.
   */
  onImageUploadingChange?: (uploading: boolean) => void;
  onImageFile?: (file: File) => void;
  ariaLabel?: string;
  /** Places the caret in the body on mount. */
  autoFocus?: boolean;
}

// The live page's own classes, so what the writer sees is what gets published.
const EDITOR_CLASS: Record<EditorVariant, string> = {
  article: "tiptap write-article-editor publication-article-body focus:outline-none",
  post: "tiptap write-post-editor publication-post-body focus:outline-none",
};

type BubblePanel = "marks" | "link" | "align";
type InsertItem = "image" | "divider" | "bullets" | "numbers";

/** The "+" menu. Lists are here because the selection toolbar has no room for them. */
const INSERT_ITEMS: ReadonlyArray<{ value: InsertItem; label: string; icon: ReactNode }> = [
  { value: "image", label: "Image", icon: IMAGE_ICON },
  { value: "divider", label: "Divider", icon: DIVIDER_ICON },
  { value: "bullets", label: "Bulleted list", icon: BULLETS_ICON },
  { value: "numbers", label: "Numbered list", icon: NUMBERS_ICON },
];

function imageFilesFrom(data: DataTransfer | null) {
  if (!data) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
}

/** The part of a tippy instance the menus need, without importing tippy's types. */
interface MenuTip {
  hide: () => void;
  popper: Element;
}

/** Pressing a menu button must not move the selection it is about to format. */
function keepSelection(event: { preventDefault: () => void }) {
  event.preventDefault();
}

/**
 * A selection toolbar button. The toolbar appears only with a mouse or
 * trackpad, so 36px is enough here. Touch toolbars stay at 44px.
 */
function BubbleButton({
  label,
  pressed,
  expanded,
  onPress,
  children,
}: {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      title={label}
      onMouseDown={keepSelection}
      onClick={onPress}
      className={`flex h-9 min-w-9 items-center justify-center rounded px-2 text-[13px] font-medium transition-colors ${
        pressed || expanded ? "bg-white/20 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    content = "",
    placeholder = "Tell your story.",
    variant = "article",
    onUpdate,
    onSelectionUpdate,
    onImageUploadingChange,
    onImageFile,
    ariaLabel = "Article body",
    autoFocus = false,
  },
  ref
) {
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [bubblePanel, setBubblePanel] = useState<BubblePanel>("marks");
  const [bubbleLinkUrl, setBubbleLinkUrl] = useState("");
  const [insertOpen, setInsertOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tiptap captures the menus' shouldShow and the paste handlers once, when
  // the editor is created. They read these refs so they always see the
  // current value rather than the first one.
  const touchRef = useRef(false);
  const bubblePanelRef = useRef<BubblePanel>("marks");
  const onImageFileRef = useRef(onImageFile);
  const bubbleTipRef = useRef<MenuTip | null>(null);
  const floatingTipRef = useRef<MenuTip | null>(null);

  useEffect(() => {
    touchRef.current = navigator.maxTouchPoints > 0;
  }, []);
  useEffect(() => {
    bubblePanelRef.current = bubblePanel;
  }, [bubblePanel]);
  useEffect(() => {
    onImageFileRef.current = onImageFile;
  }, [onImageFile]);

  const showUploadError = useCallback((message: string) => {
    setImageUploadError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setImageUploadError(null), 6000);
  }, []);

  const uploadImageFile = useCallback(
    async (file: File): Promise<string | null> => {
      const result = await uploadImage(file);
      if (result.ok) {
        setImageUploadError(null);
        return result.url;
      }
      showUploadError(result.error);
      return null;
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
      // Held across the whole batch rather than per file, so a run of images
      // reads as one upload instead of flickering the indicator between each.
      setImageUploading(true);
      try {
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
      } finally {
        setImageUploading(false);
      }
    },
    [uploadImageFile]
  );

  useEffect(() => {
    onImageUploadingChange?.(imageUploading);
  }, [imageUploading, onImageUploadingChange]);

  /** A Post's image is attached, never placed in the text. */
  const placeImages = (view: EditorView, files: File[], at: number | null) => {
    if (variant === "post") {
      if (files[0]) onImageFileRef.current?.(files[0]);
      return;
    }
    void insertImageFiles(view, files, at);
  };

  const editor = useEditor({
    extensions: editorExtensions({ placeholder }),
    content,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: EDITOR_CLASS[variant],
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        role: "textbox",
      },
      transformPastedHTML: (html) => (variant === "post" ? stripPastedImages(html) : html),
      handlePaste: (view, event) => {
        // Copying from a word processor puts both markup and an image on the
        // clipboard. The markup is the thing the writer meant to paste.
        if (event.clipboardData?.getData("text/html")) return false;
        const files = imageFilesFrom(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        placeImages(view, files, null);
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
        const coords = view.posAtCoords({ left: dragEvent.clientX, top: dragEvent.clientY });
        placeImages(view, files, coords?.pos ?? null);
        return true;
      },
    },
    onUpdate({ editor }) {
      onUpdate?.(editor.getHTML());
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
    setTextAlign: (alignment) => editor?.chain().focus().setTextAlign(alignment).run(),
    getTextAlign: () =>
      TEXT_ALIGNMENTS.find((alignment) => editor?.isActive({ textAlign: alignment })) ?? "left",
    focus: () => editor?.commands.focus("start"),
  }));

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      editor?.destroy();
    };
  }, [editor]);

  // Tiptap hides its menus on the editor's blur, unless a mousedown inside a
  // menu asked it not to. Menu buttons keep focus in the body so the
  // selection they format stays put, so that blur never comes, the request is
  // left standing, and the next real blur (opening Preview or a sheet) would
  // leave the menu floating over the dialog. Focus moving to any control
  // outside the menus hides them here instead; clicks are handled by
  // onClickOutside below.
  useEffect(() => {
    if (!editor) return;
    const onBlur = ({ event }: { event: FocusEvent }) => {
      const next = event.relatedTarget;
      if (!(next instanceof Node)) return;
      for (const tip of [bubbleTipRef.current, floatingTipRef.current]) {
        if (tip && !tip.popper.contains(next)) tip.hide();
      }
    };
    editor.on("blur", onBlur);
    return () => {
      editor.off("blur", onBlur);
    };
  }, [editor]);

  // Escape closes the "+" menu or the alignment choices and returns the caret
  // to the body. Focus stays in the body while they are open, so the key
  // arrives at the document rather than at the menu.
  useEffect(() => {
    if (!insertOpen && bubblePanel !== "align") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setInsertOpen(false);
      setBubblePanel((panel) => (panel === "align" ? "marks" : panel));
      editor?.commands.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [bubblePanel, editor, insertOpen]);

  useEffect(() => {
    if (!editor || editor.getHTML() === content) return;
    editor.commands.setContent(content, false);
  }, [content, editor]);

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length || !editor) return;

    try {
      await insertImageFiles(editor.view, files, null);
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const applyLink = () => {
    const url = bubbleLinkUrl.trim();
    if (url) editor?.chain().focus().setLink({ href: url }).run();
    else editor?.chain().focus().unsetLink().run();
    setBubbleLinkUrl("");
    setBubblePanel("marks");
  };

  const runInsert = (item: InsertItem) => {
    setInsertOpen(false);
    if (item === "image") imageInputRef.current?.click();
    else if (item === "divider") editor?.chain().focus().setHorizontalRule().run();
    else if (item === "bullets") editor?.chain().focus().toggleBulletList().run();
    else editor?.chain().focus().toggleOrderedList().run();
  };

  const currentAlignment =
    ALIGNMENT_OPTIONS.find((option) => editor?.isActive({ textAlign: option.value })) ??
    ALIGNMENT_OPTIONS[0];

  return (
    <div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageFileChange}
      />

      {imageUploadError ? (
        <div role="alert" className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-xs text-red-700">
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

      {editor && variant === "article" ? (
        <BubbleMenu
          editor={editor}
          tippyOptions={{
            duration: 100,
            placement: "top",
            onCreate: (instance) => {
              bubbleTipRef.current = instance;
            },
            onClickOutside: (instance) => instance.hide(),
            onHidden: () => {
              setBubblePanel("marks");
              setBubbleLinkUrl("");
            },
          }}
          shouldShow={({ editor: current, from, to }) =>
            !touchRef.current &&
            !current.isActive("image") &&
            (bubblePanelRef.current !== "marks" || from !== to)
          }
        >
          {bubblePanel === "link" ? (
            <div className="flex items-center gap-1.5 rounded-md bg-emerald-brand p-1.5 shadow-lg shadow-ink/20">
              <input
                type="url"
                autoFocus
                value={bubbleLinkUrl}
                onChange={(event) => setBubbleLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyLink();
                  }
                  if (event.key === "Escape") {
                    setBubbleLinkUrl("");
                    setBubblePanel("marks");
                    editor.commands.focus();
                  }
                }}
                placeholder="https://…"
                aria-label="Link address"
                className="h-9 w-56 rounded border-0 bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold"
              />
              <BubbleButton label="Apply link" onPress={applyLink}>
                Apply
              </BubbleButton>
            </div>
          ) : (
            <div className="relative">
              {bubblePanel === "align" ? (
                <div
                  role="group"
                  aria-label="Alignment"
                  className="absolute bottom-full right-0 mb-2 flex items-center gap-1 rounded-lg border border-card-border bg-surface p-1 shadow-lg shadow-ink/10"
                >
                  {ALIGNMENT_OPTIONS.map((option) => {
                    const pressed = editor.isActive({ textAlign: option.value });
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-label={option.label}
                        aria-pressed={pressed}
                        title={option.label}
                        onMouseDown={keepSelection}
                        onClick={() => {
                          editor.chain().focus().setTextAlign(option.value).run();
                          setBubblePanel("marks");
                        }}
                        className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                          pressed
                            ? "border-emerald-brand bg-emerald-brand text-white"
                            : "border-card-border text-ink-muted hover:bg-canvas hover:text-ink"
                        }`}
                      >
                        <Icon path={option.icon} className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div
                role="toolbar"
                aria-label="Text formatting"
                className="flex items-center gap-0.5 rounded-md bg-emerald-brand p-1 shadow-lg shadow-ink/20"
              >
                <BubbleButton label="Bold" pressed={editor.isActive("bold")} onPress={() => editor.chain().focus().toggleBold().run()}>
                  <span className="font-bold">B</span>
                </BubbleButton>
                <BubbleButton label="Italic" pressed={editor.isActive("italic")} onPress={() => editor.chain().focus().toggleItalic().run()}>
                  <span className="font-serif italic">I</span>
                </BubbleButton>
                <BubbleButton
                  label="Link"
                  pressed={editor.isActive("link")}
                  onPress={() => {
                    if (editor.isActive("link")) {
                      editor.chain().focus().unsetLink().run();
                      return;
                    }
                    setBubbleLinkUrl(editor.getAttributes("link").href ?? "");
                    setBubblePanel("link");
                  }}
                >
                  Link
                </BubbleButton>
                <BubbleButton
                  label="Heading"
                  pressed={editor.isActive("heading", { level: 2 })}
                  onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                >
                  H2
                </BubbleButton>
                <BubbleButton
                  label="Subheading"
                  pressed={editor.isActive("heading", { level: 3 })}
                  onPress={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                >
                  H3
                </BubbleButton>
                <BubbleButton label="Quote" pressed={editor.isActive("blockquote")} onPress={() => editor.chain().focus().toggleBlockquote().run()}>
                  <span className="font-serif text-lg leading-none">&ldquo;</span>
                </BubbleButton>
                <BubbleButton
                  label="Alignment"
                  expanded={bubblePanel === "align"}
                  onPress={() => setBubblePanel((panel) => (panel === "align" ? "marks" : "align"))}
                >
                  <Icon path={currentAlignment.icon} className="h-4 w-4" />
                </BubbleButton>
              </div>
            </div>
          )}
        </BubbleMenu>
      ) : null}

      {editor && variant === "article" ? (
        <FloatingMenu
          editor={editor}
          tippyOptions={{
            duration: 100,
            placement: "left-start",
            offset: [0, 12],
            onCreate: (instance) => {
              floatingTipRef.current = instance;
            },
            onClickOutside: (instance) => instance.hide(),
            onHidden: () => setInsertOpen(false),
          }}
          shouldShow={({ view, state }) => !touchRef.current && view.hasFocus() && caretInEmptyBlock(state)}
        >
          <div className="relative">
            <button
              type="button"
              aria-label="Insert"
              aria-haspopup="menu"
              aria-expanded={insertOpen}
              onMouseDown={keepSelection}
              onClick={() => setInsertOpen((open) => !open)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-card-border bg-surface text-ink-muted shadow-sm transition-colors hover:border-emerald-brand hover:text-emerald-brand"
            >
              <Icon path={PLUS_ICON} className="h-4 w-4" />
            </button>
            {insertOpen ? (
              <div
                role="menu"
                aria-label="Insert"
                className="absolute left-0 top-12 z-10 w-52 rounded-lg border border-card-border bg-surface p-1 shadow-lg shadow-ink/10"
              >
                {INSERT_ITEMS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="menuitem"
                    onMouseDown={keepSelection}
                    onClick={() => runInsert(item.value)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-ink transition-colors hover:bg-canvas"
                  >
                    <Icon path={item.icon} className="h-4 w-4 text-ink-muted" />
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </FloatingMenu>
      ) : null}

      <EditorContent editor={editor} />
    </div>
  );
});

export default Editor;
