import type { EditorView } from "@tiptap/pm/view";

/** Use layout coordinates throughout: iOS can pan the visual viewport. */
export function revealMobileCaret(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView;
  const viewport = win?.visualViewport;
  const canvas = view.dom.closest("[data-write-canvas]");
  if (!win || !viewport || !canvas || !win.matchMedia("(max-width: 767px)").matches) return false;
  // Do not interfere with selection handles, dialogs, or an unfocused draft.
  if (!view.hasFocus() || !view.state.selection.empty) return true;

  const caret = view.coordsAtPos(view.state.selection.head);
  let top = viewport.offsetTop;
  let bottom = top + viewport.height;
  const header = canvas.querySelector("[data-write-header]")?.getBoundingClientRect();
  const toolbar = canvas.querySelector("[data-write-toolbar]")?.getBoundingClientRect();
  if (header && header.height > 0 && header.top <= top && header.bottom > top) top = header.bottom;
  if (toolbar && toolbar.height > 0 && toolbar.top < bottom && toolbar.bottom > top) bottom = toolbar.top;
  // Keep the complete line clear, with breathing room on both sides.
  top += 12;
  bottom -= 16;
  if (bottom <= top) return true;
  const delta = caret.bottom > bottom
    ? caret.bottom - bottom
    : caret.top < top ? caret.top - top : 0;
  if (delta) win.scrollBy({ top: delta, behavior: "instant" });
  return true;
}
