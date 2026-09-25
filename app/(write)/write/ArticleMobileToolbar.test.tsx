import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorHandle } from "@/components/editor/Editor";
import ArticleMobileToolbar, { NO_FORMATS, type FormatState } from "./ArticleMobileToolbar";

const editor = {
  undo: vi.fn(),
  redo: vi.fn(),
  toggleBold: vi.fn(),
  toggleItalic: vi.fn(),
  toggleH2: vi.fn(),
  toggleH3: vi.fn(),
  toggleBulletList: vi.fn(),
  toggleOrderedList: vi.fn(),
  toggleBlockquote: vi.fn(),
  insertDivider: vi.fn(),
  triggerImageUpload: vi.fn(),
  insertLink: vi.fn(),
  setTextAlign: vi.fn(),
};
const editorRef = { current: editor as unknown as EditorHandle };

function show(formats: Partial<FormatState> = {}, history = { canUndo: true, canRedo: false }) {
  render(<ArticleMobileToolbar editorRef={editorRef} formats={{ ...NO_FORMATS, ...formats }} history={history} />);
}

describe("ArticleMobileToolbar", () => {
  beforeEach(() => {
    for (const fn of Object.values(editor)) fn.mockClear();
  });

  it("puts undo and redo first, since a phone has no Cmd+Z", () => {
    show();

    const labels = within(screen.getByRole("toolbar", { name: "Formatting" }))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Undo", "Redo", "Bold", "Italic", "Link", "Heading", "Quote", "More formatting", "Insert",
    ]);
  });

  it("calls the editor, and disables what history cannot do", () => {
    show();

    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(editor.undo).toHaveBeenCalled();
  });

  it("keeps focus in the body when a button is tapped", () => {
    show();

    // A default mousedown moves focus to the button, which closes the phone's
    // keyboard and drops this toolbar to the bottom of the screen.
    expect(fireEvent.mouseDown(screen.getByRole("button", { name: "Bold" }))).toBe(false);
  });

  it("marks the formats already applied", () => {
    show({ bold: true });

    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps H3, lists and alignment under More", () => {
    show({ align: "center" });

    fireEvent.click(screen.getByRole("button", { name: "More formatting" }));

    for (const label of ["Subheading", "Bulleted list", "Numbered list", "Align left", "Align centre", "Align right", "Justify"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Align centre" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Justify" }));
    expect(editor.setTextAlign).toHaveBeenCalledWith("justify");
  });

  it("offers an image and a divider under +", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    fireEvent.click(screen.getByRole("button", { name: "Image" }));

    expect(editor.triggerImageUpload).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Divider" })).not.toBeInTheDocument();
  });

  it("swaps the row for a link field", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(screen.queryByRole("toolbar", { name: "Formatting" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Link address"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(editor.insertLink).toHaveBeenCalledWith("https://example.com");
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
  });
});
