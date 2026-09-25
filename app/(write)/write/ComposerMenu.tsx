"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon, MORE_ICON } from "@/components/editor/editorIcons";

export interface ComposerMenuProps {
  canSaveDraft: boolean;
  onSaveDraft: () => void;
  /** "Discard", or "Discard changes" when editing something published. */
  discardLabel: string;
  canDiscard: boolean;
  onDiscard: () => void;
  onOpenDrafts?: () => void;
  /** The reader preview. A header button from md up, and in this menu at every size. */
  onPreview?: () => void;
  sourcesCount?: number;
  onOpenSources?: () => void;
  onOpenHistory?: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  ariaLabel?: string;
  count?: number;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

/**
 * The ••• menu on both write screens. What is not given is not shown: the Post
 * composer passes no preview, sources or history, and the Article editor
 * passes history only for a draft the account holds.
 */
export default function ComposerMenu({
  canSaveDraft,
  onSaveDraft,
  discardLabel,
  canDiscard,
  onDiscard,
  onOpenDrafts,
  onPreview,
  sourcesCount = 0,
  onOpenSources,
  onOpenHistory,
}: ComposerMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close, open]);

  const items: MenuItem[] = [];
  if (onPreview) items.push({ key: "preview", label: "Preview", onSelect: onPreview });
  if (onOpenSources) {
    items.push({
      key: "sources",
      label: "Sources",
      ariaLabel: sourcesCount ? `Sources, ${sourcesCount} added` : "Sources",
      count: sourcesCount,
      onSelect: onOpenSources,
    });
  }
  if (onOpenHistory) items.push({ key: "history", label: "Version history", onSelect: onOpenHistory });
  if (onOpenDrafts) items.push({ key: "drafts", label: "Drafts", onSelect: onOpenDrafts });
  items.push({ key: "save", label: "Save draft", disabled: !canSaveDraft, onSelect: onSaveDraft });
  if (canDiscard) items.push({ key: "discard", label: discardLabel, danger: true, onSelect: onDiscard });

  // Focus goes back to the button first, so a sheet the item opens records
  // the button as the place to return focus to when it closes.
  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    close(true);
    item.onSelect();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const entries = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    if (!entries.length) return;
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    entries[(index + step + entries.length) % entries.length]?.focus();
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand ${
          open ? "bg-canvas text-ink" : "text-ink-muted"
        }`}
      >
        <Icon path={MORE_ICON} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="More options"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-12 z-40 w-52 rounded-xl border border-card-border bg-surface p-1.5 shadow-lg shadow-ink/10"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              aria-label={item.ariaLabel}
              aria-disabled={item.disabled || undefined}
              onClick={() => choose(item)}
              className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors ${
                item.danger ? "text-red-600 hover:bg-red-50" : "text-ink hover:bg-canvas"
              } ${item.disabled ? "cursor-not-allowed opacity-40" : ""}`}
            >
              <span>{item.label}</span>
              {item.count ? (
                <span className="ml-auto rounded-full bg-green-tint px-2 py-0.5 text-xs font-semibold text-emerald-ink">
                  {item.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
