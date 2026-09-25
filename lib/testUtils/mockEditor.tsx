import { forwardRef, useEffect, useImperativeHandle } from "react";
import { vi } from "vitest";
import type { LinkResult, SelectedImage, TextAlignment } from "@/components/editor/Editor";

/**
 * Stands in for the Tiptap editor in component tests, which never render the
 * real one:
 *
 *   vi.mock("next/dynamic", () => import("@/lib/testUtils/mockEditor").then((m) => m.dynamicMock));
 *
 * The body is a textarea labelled like the real editor, so a test types into
 * it by label, and every handle method is a spy on `editorMock.handle`.
 * Focusing and blurring the textarea reports focus the way the real body does.
 */

interface MockEditorProps {
  content: string;
  placeholder?: string;
  ariaLabel?: string;
  variant?: "post" | "article";
  onUpdate: (html: string) => void;
  onSelectionUpdate?: () => void;
  onImageUploadingChange?: (uploading: boolean) => void;
  onImageFile?: (file: File) => void;
  onFocusChange?: (focused: boolean) => void;
}

export const editorMock = {
  handle: {
    toggleBold: vi.fn(),
    toggleItalic: vi.fn(),
    toggleH2: vi.fn(),
    toggleH3: vi.fn(),
    toggleBulletList: vi.fn(),
    toggleOrderedList: vi.fn(),
    toggleBlockquote: vi.fn(),
    insertDivider: vi.fn(),
    isActive: vi.fn(() => false),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: vi.fn(() => editorMock.history.canUndo),
    canRedo: vi.fn(() => editorMock.history.canRedo),
    triggerImageUpload: vi.fn(),
    insertLink: vi.fn((): LinkResult => "linked"),
    hasSelection: vi.fn(() => editorMock.hasSelection),
    getLinkHref: vi.fn((): string | null => null),
    insertCitation: vi.fn(),
    getSelectedImage: vi.fn(() => editorMock.selectedImage),
    updateSelectedImage: vi.fn(),
    setTextAlign: vi.fn(),
    getTextAlign: vi.fn((): TextAlignment => "left"),
    focus: vi.fn(),
    returnFocus: vi.fn(),
  },
  history: { canUndo: false, canRedo: false },
  hasSelection: false,
  selectedImage: null as SelectedImage | null,
  /** Mounts, not renders: a remount is what costs a writer their caret and undo history. */
  mounts: 0,
  /** The props of the editor most recently rendered, to call its callbacks directly. */
  props: null as MockEditorProps | null,
};

export function resetEditorMock() {
  for (const fn of Object.values(editorMock.handle)) fn.mockClear();
  editorMock.history = { canUndo: false, canRedo: false };
  editorMock.hasSelection = false;
  editorMock.selectedImage = null;
  editorMock.mounts = 0;
  editorMock.props = null;
}

export const MockEditor = forwardRef<unknown, MockEditorProps>(function MockEditor(props, ref) {
  useImperativeHandle(ref, () => editorMock.handle);
  useEffect(() => {
    editorMock.mounts += 1;
  }, []);
  useEffect(() => {
    editorMock.props = props;
  });
  return (
    <textarea
      aria-label={props.ariaLabel}
      placeholder={props.placeholder}
      data-variant={props.variant}
      value={props.content}
      onFocus={() => props.onFocusChange?.(true)}
      onBlur={() => props.onFocusChange?.(false)}
      // The real editor reports a selection change alongside every update.
      onChange={(event) => {
        props.onUpdate(event.target.value);
        props.onSelectionUpdate?.();
      }}
    />
  );
});

export const dynamicMock = { default: () => MockEditor };
