import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "@tiptap/pm/view";
import { revealMobileCaret } from "./mobileCaret";

let view: EditorView;
let caret: { top: number; bottom: number };
let viewport: { offsetTop: number; height: number };
let toolbar: HTMLElement;
const rect = (top: number, bottom: number) => ({ top, bottom, height: bottom - top }) as DOMRect;

beforeEach(() => {
  document.body.innerHTML = '<main data-write-canvas><header data-write-header></header><div contenteditable="true"></div><div data-write-toolbar></div></main>';
  toolbar = document.querySelector('[data-write-toolbar]')!;
  vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(rect(350, 420));
  vi.spyOn(document.querySelector('header')!, 'getBoundingClientRect').mockReturnValue(rect(0, 96));
  viewport = { offsetTop: 0, height: 420 };
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  vi.stubGlobal('scrollBy', vi.fn());
  caret = { top: 355, bottom: 379 };
  view = {
    dom: document.querySelector('[contenteditable]'),
    hasFocus: () => true,
    state: { selection: { empty: true, head: 5 } },
    coordsAtPos: () => caret,
  } as unknown as EditorView;
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('mobile writing caret clearance', () => {
  it('moves an obscured line above the actual formatting bar', () => {
    expect(revealMobileCaret(view)).toBe(true);
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 45, behavior: 'instant' });
  });
  it('accounts for iOS visual viewport panning without unnecessary jumps', () => {
    viewport.offsetTop = 180;
    vi.mocked(toolbar.getBoundingClientRect).mockReturnValue(rect(530, 600));
    caret = { top: 470, bottom: 494 };
    revealMobileCaret(view);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });
  it('reveals a line hidden behind the sticky header', () => {
    caret = { top: 80, bottom: 104 };
    revealMobileCaret(view);
    expect(window.scrollBy).toHaveBeenCalledWith({ top: -28, behavior: 'instant' });
  });
  it('uses the keyboard edge when the toolbar is absent', () => {
    toolbar.remove();
    caret = { top: 402, bottom: 426 };
    revealMobileCaret(view);
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 22, behavior: 'instant' });
  });
  it('does not disturb text selection handles', () => {
    view = { ...view, state: { selection: { empty: false } } } as unknown as EditorView;
    revealMobileCaret(view);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });
  it('does not scroll an unfocused editor when a link input or dialog is open', () => {
    view.hasFocus = () => false;
    revealMobileCaret(view);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });
  it('leaves desktop scrolling to ProseMirror', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(revealMobileCaret(view)).toBe(false);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });
  it('leaves other editor hosts alone', () => {
    view.dom.parentElement!.removeAttribute('data-write-canvas');
    expect(revealMobileCaret(view)).toBe(false);
  });
  it('does not move a fully visible line', () => {
    caret = { top: 250, bottom: 274 };
    revealMobileCaret(view);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });
});
