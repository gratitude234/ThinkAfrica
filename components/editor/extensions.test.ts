import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { editorExtensions } from "./extensions";

/**
 * The schema tested through @tiptap/core directly. Component tests replace the
 * editor with a textarea, so this file is where the HTML the editor writes is
 * checked against the sanitizer that stores it.
 */

const editors: Editor[] = [];

function editorWith(content: string) {
  const editor = new Editor({ extensions: editorExtensions({ placeholder: "" }), content });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

describe("editor alignment", () => {
  it("writes alignment as a style the sanitizer keeps", () => {
    const editor = editorWith("<p>Body</p>");
    editor.chain().selectAll().setTextAlign("justify").run();

    const html = editor.getHTML();
    // Tiptap's attribute merge ends the style with a semicolon. The CSS
    // matches on the substring, and the sanitizer drops it.
    expect(html).toBe('<p style="text-align: justify;">Body</p>');
    expect(sanitizePostHtml(html)).toBe('<p style="text-align:justify">Body</p>');
  });

  it("reads back the sanitizer's spelling when a saved piece is opened again", () => {
    const editor = editorWith('<h2 style="text-align:center">Heading</h2>');

    expect(editor.isActive({ textAlign: "center" })).toBe(true);
  });

  it("writes nothing for left, so pieces saved before alignment do not change", () => {
    const editor = editorWith("<p>Body</p>");
    expect(editor.getHTML()).toBe("<p>Body</p>");

    editor.chain().selectAll().setTextAlign("left").run();
    expect(editor.getHTML()).toBe("<p>Body</p>");
  });

  it("aligns headings and paragraphs, and nothing else", () => {
    const editor = editorWith('<blockquote style="text-align: center"><p>Quoted</p></blockquote>');

    expect(editor.getHTML()).toBe("<blockquote><p>Quoted</p></blockquote>");
  });
});

describe("justified text on the page", () => {
  it("hyphenates justified paragraphs in both spellings of the style", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toContain('[style*="text-align: justify"]');
    expect(css).toContain('[style*="text-align:justify"]');
    expect(css).toMatch(/hyphens:\s*auto/);
  });
});
