"use client";

import { useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import type { EditorHandle, TextAlignment } from "@/components/editor/Editor";
import {
  ALIGNMENT_OPTIONS,
  BULLETS_ICON,
  DIVIDER_ICON,
  IMAGE_ICON,
  Icon,
  NUMBERS_ICON,
  REDO_ICON,
  UNDO_ICON,
} from "@/components/editor/editorIcons";

export interface FormatState {
  bold: boolean;
  italic: boolean;
  heading: boolean;
  subheading: boolean;
  quote: boolean;
  bulletList: boolean;
  orderedList: boolean;
  link: boolean;
  align: TextAlignment;
}

export const NO_FORMATS: FormatState = {
  bold: false,
  italic: false,
  heading: false,
  subheading: false,
  quote: false,
  bulletList: false,
  orderedList: false,
  link: false,
  align: "left",
};

/**
 * A tap must not take focus from the body. If it did, the keyboard would close
 * and this toolbar, which sits on the keyboard, would drop to the bottom of
 * the screen.
 */
function keepFocus(event: MouseEvent) {
  event.preventDefault();
}

function ToolButton({
  label,
  pressed,
  expanded,
  disabled,
  onPress,
  children,
}: {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onPress}
      className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-2.5 text-[13px] font-medium transition-colors disabled:opacity-35 ${
        pressed || expanded ? "bg-white/20 text-white" : "text-white/90 active:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

/** A row inside one of the white popovers above the bar. */
function PopoverItem({
  label,
  pressed,
  onPress,
  children,
}: {
  label: string;
  pressed?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onMouseDown={keepFocus}
      onClick={onPress}
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors ${
        pressed ? "bg-green-tint text-emerald-ink" : "text-ink active:bg-canvas"
      }`}
    >
      {children}
    </button>
  );
}

type Drawer = "more" | "insert" | "link" | null;

interface ArticleMobileToolbarProps {
  editorRef: RefObject<EditorHandle | null>;
  formats: FormatState;
  history: { canUndo: boolean; canRedo: boolean };
}

const POPOVER =
  "absolute bottom-full right-2 mb-2 w-56 rounded-xl border border-card-border bg-surface p-1.5 text-ink shadow-lg shadow-ink/15";

/**
 * The Article editor's toolbar on a phone. It sits on the keyboard and
 * scrolls sideways, because nine 44px buttons do not fit in 390px. Undo and
 * Redo come first: a phone has no Cmd+Z, and a paragraph lost to a stray
 * gesture is otherwise gone for good. More and + open small white menus above
 * the bar rather than replacing it, so the writer never loses their place.
 */
export default function ArticleMobileToolbar({ editorRef, formats, history }: ArticleMobileToolbarProps) {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const editor = () => editorRef.current;
  const toggle = (next: Exclude<Drawer, null>) =>
    setDrawer((current) => (current === next ? null : next));
  const applyLink = () => {
    editor()?.insertLink(linkUrl);
    setLinkUrl("");
    setDrawer(null);
  };

  return (
    <div
      className="fixed inset-x-0 z-40 bg-emerald-brand text-white shadow-[0_-4px_16px_rgba(0,0,0,0.12)] md:hidden"
      style={{
        bottom: "var(--mobile-visual-viewport-bottom, 0px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {drawer === "more" ? (
        <div role="group" aria-label="More formatting" className={POPOVER}>
          <PopoverItem label="Subheading" pressed={formats.subheading} onPress={() => editor()?.toggleH3()}>
            <span className="w-4 text-center text-xs font-semibold">H3</span>
            Subheading
          </PopoverItem>
          <PopoverItem label="Bulleted list" pressed={formats.bulletList} onPress={() => editor()?.toggleBulletList()}>
            <Icon path={BULLETS_ICON} className="h-4 w-4" />
            Bulleted list
          </PopoverItem>
          <PopoverItem label="Numbered list" pressed={formats.orderedList} onPress={() => editor()?.toggleOrderedList()}>
            <Icon path={NUMBERS_ICON} className="h-4 w-4" />
            Numbered list
          </PopoverItem>
          <div className="mt-1 flex justify-between gap-1 border-t border-divider px-1 pt-1.5">
            {ALIGNMENT_OPTIONS.map((option) => {
              const pressed = formats.align === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={pressed}
                  onMouseDown={keepFocus}
                  onClick={() => editor()?.setTextAlign(option.value)}
                  className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
                    pressed
                      ? "border-emerald-brand bg-emerald-brand text-white"
                      : "border-card-border text-ink-muted active:bg-canvas"
                  }`}
                >
                  <Icon path={option.icon} className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {drawer === "insert" ? (
        <div role="group" aria-label="Insert" className={POPOVER}>
          <PopoverItem
            label="Image"
            onPress={() => {
              setDrawer(null);
              editor()?.triggerImageUpload();
            }}
          >
            <Icon path={IMAGE_ICON} className="h-4 w-4" />
            Image
          </PopoverItem>
          <PopoverItem
            label="Divider"
            onPress={() => {
              setDrawer(null);
              editor()?.insertDivider();
            }}
          >
            <Icon path={DIVIDER_ICON} className="h-4 w-4" />
            Divider
          </PopoverItem>
        </div>
      ) : null}

      {drawer === "link" ? (
        <div className="flex items-center gap-2 px-2 py-1">
          <input
            type="url"
            autoFocus
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
              if (event.key === "Escape") setDrawer(null);
            }}
            placeholder="https://…"
            aria-label="Link address"
            className="h-11 min-w-0 flex-1 rounded-lg border-0 bg-surface px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-gold"
          />
          <button type="button" onClick={applyLink} className="h-11 shrink-0 rounded-lg px-3 text-sm font-semibold">
            Apply
          </button>
          <button type="button" onClick={() => setDrawer(null)} className="h-11 shrink-0 rounded-lg px-3 text-sm text-white/80">
            Cancel
          </button>
        </div>
      ) : (
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex items-center justify-between gap-0.5 overflow-x-auto px-1.5 py-0.5 [scrollbar-width:none]"
        >
          <ToolButton label="Undo" disabled={!history.canUndo} onPress={() => editor()?.undo()}>
            <Icon path={UNDO_ICON} className="h-[18px] w-[18px]" />
          </ToolButton>
          <ToolButton label="Redo" disabled={!history.canRedo} onPress={() => editor()?.redo()}>
            <Icon path={REDO_ICON} className="h-[18px] w-[18px]" />
          </ToolButton>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-white/25" aria-hidden="true" />
          <ToolButton label="Bold" pressed={formats.bold} onPress={() => editor()?.toggleBold()}>
            <span className="font-bold">B</span>
          </ToolButton>
          <ToolButton label="Italic" pressed={formats.italic} onPress={() => editor()?.toggleItalic()}>
            <span className="font-serif italic">I</span>
          </ToolButton>
          <ToolButton label="Link" pressed={formats.link} onPress={() => setDrawer("link")}>
            Link
          </ToolButton>
          <ToolButton label="Heading" pressed={formats.heading} onPress={() => editor()?.toggleH2()}>
            H2
          </ToolButton>
          <ToolButton label="Quote" pressed={formats.quote} onPress={() => editor()?.toggleBlockquote()}>
            <span className="font-serif text-lg leading-none">&ldquo;</span>
          </ToolButton>
          <ToolButton label="More formatting" expanded={drawer === "more"} onPress={() => toggle("more")}>
            More
          </ToolButton>
          <ToolButton label="Insert" expanded={drawer === "insert"} onPress={() => toggle("insert")}>
            <span className="text-lg leading-none">+</span>
          </ToolButton>
        </div>
      )}
    </div>
  );
}
