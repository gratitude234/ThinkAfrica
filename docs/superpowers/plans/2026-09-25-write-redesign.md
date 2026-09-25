# Write Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single body-first canvas at `/write` with the mockup's two screens: a Post composer that publishes in one tap, and an Article editor with a cover, a required title, rich formatting and a Publish settings step. How writing is saved does not change.

**Architecture:** The saving logic in `UniversalComposer.tsx` moves unchanged into a `useContributionDraft` hook. `UniversalComposer` becomes a small root that owns the hook and renders `PostComposer` or `ArticleEditor`, each built from small single-purpose components. Alignment reaches the published page through Tiptap's TextAlign extension, a narrow sanitizer allowance and CSS. The feed summary stops repeating the body through `isWrittenExcerpt()`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 3.4, Tiptap 2.27.2, sanitize-html, Vitest 4 with jsdom, React Testing Library 16.

**Spec:** `docs/superpowers/specs/2026-09-25-write-redesign-design.md`

## Before starting

- The repository is on `main`. Create a branch first: `git switch -c write-redesign`.
- `node_modules` is not installed in this checkout. Run `npm ci`, then `npm test` and `npm run typecheck` once, and write down any failures that already exist so they are not mistaken for regressions later.
- Every task ends with a commit step. Run those steps only once the user has approved executing this plan.
- Paths containing parentheses must be quoted in the shell: `npx vitest run "app/(write)/write"`.
- No component test renders real Tiptap. Test files mock `next/dynamic` with `lib/testUtils/mockEditor.tsx` (created in Task 16), except the untouched `UniversalComposer.test.tsx` until Task 18. The editor schema is tested directly through `@tiptap/core` in `components/editor/extensions.test.ts`.
- Type checks: `npm run typecheck` checks whatever `tsconfig.check.json` reaches. That file already lists `UniversalComposer.tsx`, `Editor.tsx`, and the write page and layout, so anything they import is covered. The screens built in Tasks 10 to 17 are imported by nothing until Task 18, so those tasks type-check the whole project and filter to their own files instead: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "<pattern>"`. No lines printed means no new type errors there.

## Global Constraints

- User-facing strings contain no em dashes. ESLint enforces this across `app/`, `components/` and `lib/`.
- Every touch control is at least 44px (`h-11`, `min-h-11`, `min-w-11`). Only the desktop selection toolbar, which never appears on a touch device, may use 36px (`h-9`).
- Colours come from the brand tokens: `emerald-brand`, `emerald-ink`, `gold`, `gold-ink`, `gold-tint`, `green-tint`, `canvas`, `surface`, `ink`, `ink-muted`, `divider`, `card-border`. Errors follow the existing `text-red-600` / `bg-red-50` / `text-red-700` idiom.
- Titles and body text on both write screens use the live page classes (`publication-article-title`, `publication-article-body`, `publication-post-body`). No `font-display` (Bodoni) on the write screens.
- No database access from client code. Only existing server actions are called (`lib/browserWriteBoundary.test.ts`, `lib/browserDatabaseBoundary.test.ts`).
- `@tiptap/extension-text-align` is `2.27.2`, the version of `@tiptap/core` in `package-lock.json`.
- The breakpoint is `md` (768px): app navigation and the Post card from `md` up, full-screen screens below it.
- Copy, verbatim: "New post", "Edit post", "Post", "Update", "Share an idea, a link, a moment.", "Article", "Write something in depth", "Title", "Tell your story.", "Add a title to continue. An Article needs one, a Post never does.", "Continue", "Update Article", "Preview", "Publish settings", "Publish", "Cancel", "Save draft", "Drafts", "Discard", "Discard changes", "Sources", "Version history", "Align left", "Align centre", "Align right", "Justify", "Add cover", "Remove image".
- Save status wording is unchanged: "Adding image…", "Saving…", "Saved", "Saved on this device", or the error text.

## Review Focus

1. **An older Post opened in the Post composer.** A published Post may already contain headings, lists or an inline image. The Post variant hides the tools but keeps the whole schema, so opening one must not strip anything. Pinned in Task 9 ("keeps an older Post's headings, lists and image").
2. **Pasting from a word processor into a Post.** The clipboard carries markup and images. The markup should paste, and no image should land inside a Post's text. Pinned in Task 9 (`stripPastedImages`).
3. **Switching screens with an image attached.** A Post's image becomes the Article's cover, and Back returns it as the Post's image. Nothing is lost in either direction. Pinned in Task 18.
4. **Discarding while an autosave is in flight.** The save that is creating the draft must finish first, so the row it creates is the one deleted, and no later autosave recreates it. Pinned in Task 7.
5. **Tapping the phone toolbar.** A tap must not move focus out of the body, or the keyboard closes and the toolbar drops to the bottom of the screen. Pinned in Task 14.

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/sanitizePostHtml.ts` | modify | Keeps `text-align` on `p`, `h2`, `h3` |
| `components/editor/extensions.ts` | create | The editor schema, the alignment list, `caretInEmptyBlock`, `stripPastedImages` |
| `components/editor/editorIcons.tsx` | create | `Icon`, the icon paths, `ALIGNMENT_OPTIONS` |
| `components/editor/Editor.tsx` | modify | React wrapper: two variants, restyled menus, uploads |
| `app/globals.css` | modify | Hyphenation for justified text, the two editor surfaces, old canvas rules removed |
| `lib/contribution.ts` | modify | `isWrittenExcerpt()` |
| `lib/contentModel.ts` | modify | Rule text, `composerSurfaceFor()` |
| `app/(main)/post/[slug]/page.tsx` | modify | Prints the dek only when someone wrote it |
| `app/(main)/edit/[slug]/page.tsx` | modify | Drops a generated excerpt; reads `avatar_url` |
| `app/(write)/write/editActions.ts` | modify | Excerpt fallback on published edits |
| `lib/uploadImage.ts` | create | One image upload through `/api/upload-image` |
| `app/(write)/write/useModalFocus.ts` | create | Focus trap; returns focus on close |
| `app/(write)/write/useContributionDraft.ts` | create | Saving, recovery, publishing, leaving, discarding |
| `app/(write)/write/WriteSheet.tsx` | create | Side panel or dialog on desktop, bottom sheet on a phone |
| `app/(write)/write/ArticlePreview.tsx` | modify | Live page typography; `lengthLabel()` |
| `app/(write)/write/PublishSettingsDialog.tsx` | create | Topics, the length line, Publish |
| `app/(write)/write/ComposerMenu.tsx` | create | The ••• menu both screens use |
| `app/(write)/write/ArticleMobileToolbar.tsx` | create | The keyboard toolbar |
| `app/(write)/write/ImageDetailsPanel.tsx` | create | Caption and alt text for the selected image |
| `app/(write)/write/ArticleEditor.tsx` | create | The Article screen |
| `app/(write)/write/PostComposer.tsx` | create | The Post screen |
| `app/(write)/write/UniversalComposer.tsx` | rewrite | Root: picks the screen, shared dialogs |
| `app/(write)/write/page.tsx` | modify | `?editor=article`; reads `avatar_url` |
| `lib/navigationViewer.ts` | create | The viewer lookup both layouts share |
| `app/(main)/layout.tsx` | modify | Uses `getNavigationViewer()` |
| `app/(write)/layout.tsx` | rewrite | Server layout |
| `app/(write)/WriteChrome.tsx` | create | Desktop navigation and search for `/write` |
| `lib/testUtils/mockEditor.tsx` | create | Shared `MockEditor` for component tests |
| `lib/testUtils/contributionDraft.ts` | create | `fakeDraft()` for testing one screen alone |

---

## Phase 1: Alignment

### Task 1: The sanitizer keeps alignment

**Files:**
- Modify: `lib/sanitizePostHtml.ts`
- Test: `lib/sanitizePostHtml.test.ts`

**Interfaces:**
- Produces: `sanitizePostHtml()` keeps `style="text-align:<left|center|right|justify>"` on `p`, `h2` and `h3`. sanitize-html rebuilds the attribute, so it is written with no space after the colon.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("sanitizePostHtml", ...)` block in `lib/sanitizePostHtml.test.ts`:

```ts
  it("keeps an alignment the editor can set on paragraphs and headings", () => {
    const result = sanitizePostHtml(
      '<p style="text-align: justify">A</p><h2 style="text-align: center">B</h2><h3 style="text-align: right">C</h3>'
    );

    // sanitize-html rebuilds the style attribute, so the space after the colon
    // goes. The article CSS matches both spellings.
    expect(result).toContain('<p style="text-align:justify">A</p>');
    expect(result).toContain('<h2 style="text-align:center">B</h2>');
    expect(result).toContain('<h3 style="text-align:right">C</h3>');
  });

  it("drops every other style, and any alignment the editor cannot set", () => {
    const result = sanitizePostHtml(
      '<p style="text-align: center; color: red; background: url(https://x/a.png)">A</p><p style="text-align: start">B</p>'
    );

    expect(result).toContain('<p style="text-align:center">A</p>');
    expect(result).toContain("<p>B</p>");
    expect(result).not.toContain("color");
    expect(result).not.toContain("url(");
  });

  it("keeps no style on any other tag", () => {
    const result = sanitizePostHtml(
      '<blockquote style="text-align: center"><p>Q</p></blockquote><span style="text-align: center">S</span><img src="https://x/a.png" style="float: left">'
    );

    expect(result).not.toContain("style=");
  });

  it("leaves a piece with no alignment exactly as it was", () => {
    const html = '<h2>Section</h2><p>Plain <strong>text</strong> and <a href="#ref-id-abc">[source]</a>.</p>';

    expect(sanitizePostHtml(html)).toBe(html);
  });
```

- [ ] **Step 2: Run the tests to see the first two fail**

Run: `npx vitest run lib/sanitizePostHtml.test.ts`
Expected: "keeps an alignment the editor can set" and "drops every other style" FAIL, because every style is removed today. The other two new tests already pass.

- [ ] **Step 3: Allow alignment, and nothing else**

In `lib/sanitizePostHtml.ts`, add below the `allowedTags` array:

```ts
/**
 * Alignment is the one style a writer can set, and only on the blocks the
 * editor's TextAlign extension covers. Every other property, and any value
 * outside these four, is removed, so a pasted `color` or `background:url()`
 * never reaches a published page.
 */
const ALIGNMENT_STYLE = { "text-align": [/^(left|center|right|justify)$/] };
```

and replace the `allowedAttributes` entry in `sanitizePostHtml()` with:

```ts
    allowedAttributes: {
      a: ["href"],
      img: ["alt", "src", "title"],
      p: ["style"],
      h2: ["style"],
      h3: ["style"],
    },
    allowedStyles: {
      p: ALIGNMENT_STYLE,
      h2: ALIGNMENT_STYLE,
      h3: ALIGNMENT_STYLE,
    },
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/sanitizePostHtml.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/sanitizePostHtml.ts lib/sanitizePostHtml.test.ts
git commit -m "Keep paragraph and heading alignment through the sanitizer"
```

### Task 2: The editor can align paragraphs and headings

**Files:**
- Create: `components/editor/extensions.ts`
- Create: `components/editor/extensions.test.ts`
- Modify: `components/editor/Editor.tsx` (imports at lines 3-13, `CaptionedImage` at lines 15-64, `EditorHandle` at lines 72-91, the `extensions` array at lines 232-243, the imperative handle at lines 297-356)
- Modify: `app/globals.css` (after the line `.publication-detail :is(td, th) { ... }`)
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces, from `components/editor/extensions.ts`: `TEXT_ALIGNMENTS` (`readonly ["left", "center", "right", "justify"]`), `type TextAlignment`, `CaptionedImage`, `editorExtensions({ placeholder }: { placeholder: string }): Extensions`.
- Produces, on `EditorHandle`: `setTextAlign(alignment: TextAlignment): void` and `getTextAlign(): TextAlignment`. `Editor.tsx` re-exports `type TextAlignment`.

- [ ] **Step 1: Install the extension**

Run: `npm install @tiptap/extension-text-align@2.27.2`
Expected: `package.json` gains `"@tiptap/extension-text-align": "^2.27.2"` and the lockfile resolves it to `2.27.2`.

- [ ] **Step 2: Write the failing tests**

Create `components/editor/extensions.test.ts`:

```ts
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
    expect(html).toBe('<p style="text-align: justify">Body</p>');
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
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run components/editor/extensions.test.ts`
Expected: FAIL with "Failed to resolve import "./extensions"".

- [ ] **Step 4: Move the schema into `extensions.ts` and add TextAlign**

Create `components/editor/extensions.ts`. The `CaptionedImage` block, including its doc comment, moves here from `Editor.tsx` without any change:

```ts
import { mergeAttributes, type Extensions } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import type { DOMOutputSpec } from "@tiptap/pm/model";

export const TEXT_ALIGNMENTS = ["left", "center", "right", "justify"] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

/**
 * An image on a publication is rarely just a picture. It has a source, a
 * photographer, or a chart it came from, and none of that survives in a bare
 * <img>. This renders as <figure><img><figcaption> when a caption exists and
 * as a plain <img> when it does not, so the many images already published
 * without one keep parsing and re-serializing unchanged.
 */
export const CaptionedImage = Image.extend({
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

/**
 * The editor's schema, in one place so it can be tested without React.
 */
export function editorExtensions({ placeholder }: { placeholder: string }): Extensions {
  return [
    StarterKit,
    Placeholder.configure({ placeholder }),
    CharacterCount,
    // Curly quotes, real ellipses and proper dashes, applied as the writer
    // types. A publication should not ship typewriter quotes.
    Typography,
    CaptionedImage.configure({ inline: false, allowBase64: false }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
    }),
    // Only the blocks the live page sets as text. The sanitizer allows the
    // same four values on the same tags (p, h2, h3), and left writes nothing,
    // so every piece saved before alignment existed round-trips unchanged.
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: [...TEXT_ALIGNMENTS],
      defaultAlignment: "left",
    }),
  ];
}
```

In `components/editor/Editor.tsx`:

1. Replace the import lines 3-13 with:

```ts
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { editorExtensions, TEXT_ALIGNMENTS, type TextAlignment } from "./extensions";

export type { TextAlignment } from "./extensions";
```

2. Delete the `CaptionedImage` doc comment and definition (lines 15-64). It now lives in `extensions.ts`.

3. Add to the `EditorHandle` interface, after `updateSelectedImage`:

```ts
  setTextAlign: (alignment: TextAlignment) => void;
  /** The alignment at the caret, or "left" when a selection spans several. */
  getTextAlign: () => TextAlignment;
```

4. Replace the `extensions: [ ... ],` array inside `useEditor({ ... })` with:

```ts
    extensions: editorExtensions({ placeholder }),
```

5. Add to the object returned by `useImperativeHandle`, after `updateSelectedImage`:

```ts
    setTextAlign: (alignment) => editor?.chain().focus().setTextAlign(alignment).run(),
    getTextAlign: () =>
      TEXT_ALIGNMENTS.find((alignment) => editor?.isActive({ textAlign: alignment })) ?? "left",
```

In `app/globals.css`, add after the line that starts `.publication-detail :is(td, th)`:

```css
/* Justified text opens rivers of space in a narrow column unless long words
   can break. The editor writes `text-align: justify` and the sanitizer
   rewrites it as `text-align:justify`, so both spellings are matched.
   Hyphenation also needs a document language, which app/layout.tsx sets on
   <html>. `.tiptap` covers both write screens. */
:is(.publication-article-body, .publication-post-body, .tiptap)
  p:is([style*="text-align: justify"], [style*="text-align:justify"]) {
  -webkit-hyphens: auto;
  hyphens: auto;
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/editor/extensions.test.ts lib/sanitizePostHtml.test.ts "app/(write)/write"`
Expected: PASS. The composer tests are unaffected because they replace the editor.

- [ ] **Step 6: Type-check**

Run: `npm run typecheck`
Expected: no errors. `tsconfig.check.json` lists `Editor.tsx`, which reaches `extensions.ts`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json components/editor/extensions.ts components/editor/extensions.test.ts components/editor/Editor.tsx app/globals.css
git commit -m "Add paragraph and heading alignment to the editor"
```

---

## Phase 2: Groundwork

### Task 3: A generated summary is not printed under the title

**Files:**
- Modify: `lib/contribution.ts` (new import at the top; new function directly after `deriveContributionExcerpt`)
- Test: `lib/contribution.test.ts`
- Modify: `app/(main)/post/[slug]/page.tsx` (import from `@/lib/contribution`; line 577; lines 668-672)
- Create: `app/(main)/post/[slug]/articleDek.test.ts`

**Interfaces:**
- Produces: `isWrittenExcerpt(excerpt: string | null | undefined, content: string | null | undefined): boolean` from `lib/contribution.ts`.

The function goes **before** `derivePresentationClassification`: `lib/postArticleOnlyModel.test.ts` slices `lib/contribution.ts` from that function to the end of the file and asserts nothing in the slice contains `type:`.

- [ ] **Step 1: Write the failing tests**

In `lib/contribution.test.ts`, add `isWrittenExcerpt` to the import list from `./contribution`, then append:

```ts
describe("isWrittenExcerpt", () => {
  const body =
    "<p>Solar microgrids are changing <strong>Jos</strong>. Here is how the first ones were paid for.</p>";

  it("recognises the opening of the body as generated", () => {
    expect(isWrittenExcerpt(deriveContributionExcerpt(body), body)).toBe(false);
    // Cut short, it ends in an ellipsis and is still the opening.
    expect(isWrittenExcerpt(deriveContributionExcerpt(body, 30), body)).toBe(false);
  });

  it("recognises the older generator's three-dot cut", () => {
    expect(isWrittenExcerpt("Solar microgrids are changing Jos. Here is...", body)).toBe(false);
  });

  it("keeps a summary the writer wrote", () => {
    expect(isWrittenExcerpt("How a city paid for its first solar microgrids", body)).toBe(true);
  });

  it("treats a missing or blank summary as not written", () => {
    for (const blank of ["", "   ", null, undefined]) {
      expect(isWrittenExcerpt(blank, body), String(blank)).toBe(false);
    }
  });

  it("compares text, not markup or entities", () => {
    const quoted = "<p>Tom &amp; Jerry&#39;s <em>last</em> stand.</p>";

    expect(isWrittenExcerpt("Tom & Jerry's last stand.", quoted)).toBe(false);
  });
});
```

Create `app/(main)/post/[slug]/articleDek.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "app/(main)/post/[slug]/page.tsx"), "utf8");

describe("the article's dek", () => {
  it("is printed only when someone wrote it", () => {
    // The rule is tested in lib/contribution.test.ts. This pins the page to
    // it, because a server component this size has no render test.
    expect(page).toContain("isWrittenExcerpt(sanitizedExcerpt, sanitizedContent)");
    expect(page).toMatch(/\{writtenExcerpt \? \(/);
    expect(page).not.toMatch(/\{sanitizedExcerpt \? \(/);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/contribution.test.ts "app/(main)/post/[slug]/articleDek.test.ts"`
Expected: FAIL. `isWrittenExcerpt` is not exported, and the page still prints `sanitizedExcerpt`.

- [ ] **Step 3: Implement `isWrittenExcerpt`**

In `lib/contribution.ts`, add to the imports:

```ts
import { stripHtmlToText } from "@/lib/utils";
```

and add directly after `deriveContributionExcerpt`:

```ts
/** Text as a reader sees it, for comparing a summary with the body it came from. */
function comparableText(value: string) {
  return stripHtmlToText(value)
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/(?:…|\.{3})$/, "")
    .trim();
}

/**
 * Whether a stored excerpt is a summary someone wrote, as opposed to the
 * opening of the body cut off by deriveContributionExcerpt() or by the older
 * generateExcerpt(). A generated one repeats the first lines of the piece, so
 * a page that prints it under the title prints the opening twice.
 *
 * Known limit: a generated excerpt whose body was later rewritten no longer
 * starts the body, so it reads as written and is kept. That is what every
 * surface does today, so it is no worse.
 */
export function isWrittenExcerpt(
  excerpt: string | null | undefined,
  content: string | null | undefined
) {
  const summary = comparableText(excerpt ?? "");
  if (!summary) return false;
  return !comparableText(content ?? "").startsWith(summary);
}
```

- [ ] **Step 4: Print the dek only when it was written**

In `app/(main)/post/[slug]/page.tsx`, add `import { isWrittenExcerpt } from "@/lib/contribution";` beside the other `@/lib` imports. After the line `const sanitizedExcerpt = sanitizePostExcerpt(post.excerpt);` add:

```ts
  // Printed under the title only when someone wrote it. A generated excerpt is
  // the body's own opening, and printing it would show those lines twice.
  const writtenExcerpt =
    sanitizedExcerpt && isWrittenExcerpt(sanitizedExcerpt, sanitizedContent)
      ? sanitizedExcerpt
      : null;
```

and replace the dek block (lines 668-672) with:

```tsx
            {writtenExcerpt ? (
              <p className="mt-3 max-w-[690px] font-public-sans text-[16px] leading-[1.5] sm:mt-4 sm:leading-[1.55] text-[#4B5550] sm:text-[19px]">
                {writtenExcerpt}
              </p>
            ) : null}
```

The other uses of `sanitizedExcerpt` (sharing, the conversation view) stay as they are.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/contribution.test.ts "app/(main)/post/[slug]" lib/postArticleOnlyModel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/contribution.ts lib/contribution.test.ts "app/(main)/post/[slug]/page.tsx" "app/(main)/post/[slug]/articleDek.test.ts"
git commit -m "Print an article's dek only when someone wrote it"
```

### Task 4: Editing a published piece refreshes its summary

**Files:**
- Modify: `app/(write)/write/editActions.ts` (the `ContributionSnapshot` import; the upsert in `savePublishedEditDraft`)
- Test: `app/(write)/write/editActions.test.ts`
- Modify: `app/(main)/edit/[slug]/page.tsx` (imports; the `initialSnapshot` block)
- Create: `app/(main)/edit/[slug]/page.test.tsx`

**Interfaces:**
- Consumes: `isWrittenExcerpt()` from Task 3; `deriveContributionExcerpt()` from `lib/contribution.ts`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("savePublishedEditDraft", ...)` in `app/(write)/write/editActions.test.ts`:

```ts
  it("fills an empty summary from the opening of the edited body", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: editablePost(), error: null }),
      post_edit_drafts: queueResults({ data: { id: "edit-1" }, error: null }),
    });

    await savePublishedEditDraft({
      postId: "post-1",
      snapshot: snapshot({ excerpt: "", content: "<p>The new opening.</p>" }),
    });

    const payload = fakeSupabase.current.builders.post_edit_drafts[0].upsertedWith as {
      excerpt: string;
    };
    // Publishing a new piece already does this. Editing one used to store the
    // empty string, so the feed kept showing the old opening.
    expect(payload.excerpt).toBe("The new opening.");
  });

  it("keeps a summary the writer wrote", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: editablePost(), error: null }),
      post_edit_drafts: queueResults({ data: { id: "edit-1" }, error: null }),
    });

    await savePublishedEditDraft({
      postId: "post-1",
      snapshot: snapshot({ excerpt: "Why the grid failed", content: "<p>The new opening.</p>" }),
    });

    const payload = fakeSupabase.current.builders.post_edit_drafts[0].upsertedWith as {
      excerpt: string;
    };
    expect(payload.excerpt).toBe("Why the grid failed");
  });
```

Create `app/(main)/edit/[slug]/page.test.tsx`:

```tsx
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";
import type { ContributionSnapshot } from "@/lib/contribution";

const { fakeSupabase } = vi.hoisted(() => ({
  fakeSupabase: { current: null as ReturnType<typeof makeFakeSupabase> | null },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase.current),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock("@/app/(write)/write/UniversalComposer", () => ({ default: () => null }));

import EditPage from "./page";

function published(overrides: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    title: null,
    slug: "hello",
    excerpt: "The opening line of the post.",
    content: "<p>The opening line of the post. And more.</p>",
    content_kind: "post",
    status: "published",
    tags: [],
    cover_image_url: null,
    author_id: "user-1",
    ...overrides,
  };
}

async function openedSnapshot(
  post: Record<string, unknown>,
  editDraft: Record<string, unknown> | null = null
) {
  fakeSupabase.current = makeFakeSupabase({
    posts: queueResults({ data: post, error: null }),
    post_references: queueResults({ data: [], error: null }),
    post_edit_drafts: queueResults({ data: editDraft, error: null }),
    profiles: queueResults({
      data: { full_name: "Ada", username: "ada", university: null, avatar_url: null },
      error: null,
    }),
  });
  const element = (await EditPage({ params: Promise.resolve({ slug: "hello" }) })) as ReactElement<{
    initialSnapshot: ContributionSnapshot;
  }>;
  return element.props.initialSnapshot;
}

describe("editing a published piece", () => {
  beforeEach(() => {
    fakeSupabase.current = null;
  });

  it("starts from no summary when the saved one was generated", async () => {
    expect((await openedSnapshot(published())).excerpt).toBe("");
  });

  it("keeps a summary someone wrote", async () => {
    const snapshot = await openedSnapshot(published({ excerpt: "Why this matters" }));

    expect(snapshot.excerpt).toBe("Why this matters");
  });

  it("judges an edit draft's summary against the edit draft's body", async () => {
    const snapshot = await openedSnapshot(published({ excerpt: "Why this matters" }), {
      id: "edit-1",
      title: null,
      excerpt: "The rewritten opening.",
      content: "<p>The rewritten opening. Then more.</p>",
      tags: [],
      cover_image_url: null,
      reference_snapshot: null,
      updated_at: "2026-09-25T10:00:00.000Z",
    });

    expect(snapshot.excerpt).toBe("");
    expect(snapshot.content).toBe("<p>The rewritten opening. Then more.</p>");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run "app/(write)/write/editActions.test.ts" "app/(main)/edit/[slug]/page.test.tsx"`
Expected: FAIL. The payload excerpt is `""`, and the edit page passes the generated excerpt through.

- [ ] **Step 3: Add the fallback to `savePublishedEditDraft`**

In `app/(write)/write/editActions.ts`, change the import

```ts
import type { ContributionSnapshot } from "@/lib/contribution";
```

to

```ts
import { deriveContributionExcerpt, type ContributionSnapshot } from "@/lib/contribution";
```

In `savePublishedEditDraft`, add directly before `const { data, error } = await editable.supabase`:

```ts
  const content = sanitizePostHtml(input.snapshot.content);
```

and in the upsert payload replace

```ts
        excerpt: input.snapshot.excerpt,
        content: sanitizePostHtml(input.snapshot.content),
```

with

```ts
        // The same fallback publishContribution applies: no written summary
        // means the feed carries the opening of the body as it now reads.
        excerpt: input.snapshot.excerpt.trim() || deriveContributionExcerpt(content),
        content,
```

- [ ] **Step 4: Start published edits from a written excerpt only**

In `app/(main)/edit/[slug]/page.tsx`, change `import type { ContributionSnapshot } from "@/lib/contribution";` to:

```ts
import { isWrittenExcerpt, type ContributionSnapshot } from "@/lib/contribution";
```

and replace the `const initialSnapshot: ContributionSnapshot = { ... };` block with:

```ts
    const excerpt = editDraft?.excerpt ?? post.excerpt ?? "";
    const content = editDraft?.content ?? post.content ?? "";
    const initialSnapshot: ContributionSnapshot = {
      title: editDraft?.title ?? post.title ?? "",
      // A generated summary is dropped here, so saving the edit derives a new
      // one from the body as it now reads. A written one is kept.
      excerpt: isWrittenExcerpt(excerpt, content) ? excerpt : "",
      content,
      tags: (editDraft?.tags as string[] | null) ?? (post.tags as string[] | null) ?? [],
      coverImageUrl: editDraft?.cover_image_url ?? post.cover_image_url ?? "",
      references: draftReferences,
    };
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run "app/(write)/write/editActions.test.ts" "app/(main)/edit/[slug]/page.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(write)/write/editActions.ts" "app/(write)/write/editActions.test.ts" "app/(main)/edit/[slug]/page.tsx" "app/(main)/edit/[slug]/page.test.tsx"
git commit -m "Refresh a published piece's summary when it is edited"
```

### Task 5: The writer chooses the screen

**Files:**
- Modify: `lib/contentModel.ts` (header comment lines 4-6; new function after `contentKindForTitle`)
- Test: `lib/contentModel.test.ts`
- Modify: `CLAUDE.md` (line 56 and line 169)
- Modify: `docs/content-model.md` (lines 8-9)

**Interfaces:**
- Produces: `composerSurfaceFor({ title, requested }: { title: string | null | undefined; requested?: unknown }): ContentKind` from `lib/contentModel.ts`.

- [ ] **Step 1: Write the failing tests**

In `lib/contentModel.test.ts`, add `composerSurfaceFor` to the import list. Rename the test `"is the product rule: a title makes it an Article"` to `"a title makes it an Article, whichever screen it was written on"`. Append:

```ts
describe("composerSurfaceFor", () => {
  it("opens a titled piece in the Article editor, whatever was asked for", () => {
    expect(composerSurfaceFor({ title: "On the price of maize", requested: "post" })).toBe("article");
    expect(composerSurfaceFor({ title: "On the price of maize", requested: null })).toBe("article");
  });

  it("honours the writer's choice for an untitled piece", () => {
    expect(composerSurfaceFor({ title: "", requested: "article" })).toBe("article");
    expect(composerSurfaceFor({ title: "  ", requested: "post" })).toBe("post");
  });

  it("opens anything else as a Post", () => {
    for (const requested of [undefined, null, "", "research", "ARTICLE", ["article"]]) {
      expect(composerSurfaceFor({ title: null, requested }), JSON.stringify(requested)).toBe("post");
    }
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/contentModel.test.ts`
Expected: FAIL with "composerSurfaceFor is not a function".

- [ ] **Step 3: Implement it and restate the rule**

In `lib/contentModel.ts`, replace header lines 4-6:

```ts
 * A piece of writing is a Post or an Article, and its title decides which: no
 * title is a Post, a title is an Article. There is no type picker, no format
 * picker, and no third kind. See docs/content-model.md.
```

with:

```ts
 * A piece of writing is a Post or an Article. The writer chooses which by
 * choosing the screen they write on, the Post composer or the Article editor,
 * and a title still makes a piece an Article: `content_kind` is derived from
 * the title on every write, and the Post composer has no title field. There is
 * no format picker and no third kind. See docs/content-model.md.
```

Add after `contentKindForTitle`:

```ts
/**
 * Which screen a piece opens on. A titled piece is an Article wherever it came
 * from, so it always opens in the Article editor. Otherwise the writer's own
 * choice, carried as `?editor=article`, decides, and anything else is a Post.
 */
export function composerSurfaceFor({
  title,
  requested,
}: {
  title: string | null | undefined;
  requested?: unknown;
}): ContentKind {
  if (contentKindForTitle(title) === "article") return "article";
  return parseContentKind(requested) ?? "post";
}
```

- [ ] **Step 4: Update the documentation**

In `CLAUDE.md`, line 56, replace `# UniversalComposer: the one canvas for posts and articles` with `# UniversalComposer: the Post composer and the Article editor`.

In `CLAUDE.md`, line 169, replace the first sentence `Posts and Articles are \`draft\` or \`published\`; the title decides which one a piece is.` with:

```markdown
Posts and Articles are `draft` or `published`. The writer chooses which by choosing the screen, the Post composer or the Article editor, and the title still decides the stored kind: an Article has one and a Post never does (`composerSurfaceFor()` and `contentKindForTitle()` in `lib/contentModel.ts`).
```

In `docs/content-model.md`, replace:

```markdown
> What is true now: a piece is a **Post** or an **Article**, and its title
> decides which. `posts.content_kind` is NOT NULL and constrained to those two
```

with:

```markdown
> What is true now: a piece is a **Post** or an **Article**. The writer
> chooses which by choosing the screen they write on (the 2026-09-25 write
> redesign), and a title still makes a piece an Article, which is what the
> database records. `posts.content_kind` is NOT NULL and constrained to those two
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/contentModel.test.ts lib/postArticleOnlyModel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/contentModel.ts lib/contentModel.test.ts CLAUDE.md docs/content-model.md
git commit -m "Let the writer choose Post or Article; a title still makes an Article"
```

---

## Phase 3: Take out the saving logic

### Task 6: Move the saving logic into `useContributionDraft`

This task moves code and changes no behaviour. The 33 tests in `UniversalComposer.test.tsx` are the check, and they are not edited.

**Files:**
- Create: `app/(write)/write/useModalFocus.ts`
- Create: `app/(write)/write/useContributionDraft.ts`
- Modify: `app/(write)/write/UniversalComposer.tsx`
- Test: `app/(write)/write/UniversalComposer.test.tsx` (unchanged)

**Interfaces:**
- Produces, from `useModalFocus.ts`: `useModalFocus(open: boolean, dialogRef: RefObject<HTMLDivElement | null>, onClose: () => void, busy?: boolean): void`.
- Produces, from `useContributionDraft.ts`: `type SaveState`, `interface ContributionDraftOptions`, `useContributionDraft(options)`, and `type ContributionDraft = ReturnType<typeof useContributionDraft>`. After this task the hook returns `{ snapshot, setSnapshot, saveState, saveError, saveLabel, recovery, restoreRecovery(): ContributionSnapshot | null, dismissRecovery(), draftId, editDraftId, documentKey, flush(): Promise<boolean>, requestClose(): Promise<void>, navigateAway(), showLeave, closeLeave(), publish(): Promise<void>, publishing, discardDraft(): Promise<void>, bodyText, wordCount }`. Task 7 extends it.

- [ ] **Step 1: Run the composer tests before touching anything**

Run: `npx vitest run "app/(write)/write/UniversalComposer.test.tsx"`
Expected: PASS, 33 tests. This is the baseline the move must keep.

- [ ] **Step 2: Move `useModalFocus` into its own file**

Create `app/(write)/write/useModalFocus.ts`, holding the `FOCUSABLE` constant and the `useModalFocus` function exactly as they are in `UniversalComposer.tsx` (lines 163-164 and 215-256), now exported:

```ts
"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside an open dialog or sheet, closes it on Escape
 * unless it is busy, and stops the page behind it from scrolling.
 */
export function useModalFocus(
  open: boolean,
  dialogRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
  busy = false
) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [busy, dialogRef, onClose, open]);
}
```

- [ ] **Step 3: Create the hook**

Create `app/(write)/write/useContributionDraft.ts`. Three helpers move verbatim from `UniversalComposer.tsx`: `snapshotsMatch` (lines 166-168), `safeSnapshot` (lines 170-200) and `textToHtml` (lines 202-213). The effects and callbacks are lines 336-574 of the component with the interface parts taken out.

```ts
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  contributionText,
  deservesCloudDraft,
  hasMeaningfulContribution,
  type ComposerMode,
  type ContributionSnapshot,
} from "@/lib/contribution";
import { ensureContributionDraft, publishContribution } from "./actions";
import {
  applyPublishedEditDraft,
  discardPublishedEditDraft,
  savePublishedEditDraft,
} from "./editActions";

/**
 * Everything the composer does that is not drawing a screen: the working copy,
 * the device and account saves, recovering a copy left on this device,
 * publishing, and leaving. It was the top half of UniversalComposer.tsx and
 * moved here unchanged, so the Post composer and the Article editor share one
 * implementation of the part that must never lose writing.
 */

export type SaveState = "idle" | "saving" | "cloud" | "device" | "error";

const LOCAL_PREFIX = "indegenius:contribution-draft:v1";
const LOCAL_DELAY = 350;
const CLOUD_DELAY = 2000;

// snapshotsMatch, safeSnapshot and textToHtml: moved verbatim from
// UniversalComposer.tsx lines 166-213.

export interface ContributionDraftOptions {
  mode: ComposerMode;
  userId: string;
  initialSnapshot: ContributionSnapshot;
  draftId?: string | null;
  editDraftId?: string | null;
  publishedPostId?: string | null;
  publishedSlug?: string | null;
  /** When the account copy was last written, so a stale device copy can be told apart from a newer one. */
  draftUpdatedAt?: string | null;
  returnTo: string;
  /**
   * Called after the hook has reset itself for a genuinely different document,
   * so the screen can reset what it holds too.
   */
  onDocumentChange?: (snapshot: ContributionSnapshot) => void;
}

export function useContributionDraft({
  mode,
  userId,
  initialSnapshot,
  draftId: initialDraftId = null,
  editDraftId: initialEditDraftId = null,
  publishedPostId = null,
  publishedSlug = null,
  draftUpdatedAt = null,
  returnTo,
  onDocumentChange,
}: ContributionDraftOptions) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [draftId, setDraftId] = useState(initialDraftId);
  const [editDraftId, setEditDraftId] = useState(initialEditDraftId);
  const draftIdRef = useRef(initialDraftId);
  const editDraftIdRef = useRef(initialEditDraftId);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ snapshot: ContributionSnapshot; key: string } | null>(null);
  const [showLeave, setShowLeave] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const localTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRef = useRef(0);
  const latestRef = useRef(snapshot);
  const lastPersistedRef = useRef(initialSnapshot);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const mountedRef = useRef(true);
  const localKeyRef = useRef(
    `${LOCAL_PREFIX}:${userId}:${mode}:${publishedPostId ?? initialDraftId ?? "new"}`
  );
  // The document this canvas is currently editing. It picks up an id when the
  // first autosave mints a draft, so a later arrival of that same id reads as
  // "still the same piece" rather than as a switch to a different one.
  const documentIdRef = useRef(publishedPostId ?? initialDraftId ?? null);
  const [documentKey, setDocumentKey] = useState(publishedPostId ?? initialDraftId ?? "new");
  const scannedRef = useRef(false);
  const onDocumentChangeRef = useRef(onDocumentChange);

  // Declared before the reset below, so the reset always calls the newest callback.
  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    };
  }, []);

  // Resuming another draft is a client-side navigation into this same
  // component instance, so none of the state below re-derives on its own.
  // Without this the canvas would keep the previous draft's text and keep
  // autosaving it to the previous draft, under the new draft's address.
  useEffect(() => {
    const incoming = publishedPostId ?? initialDraftId ?? null;
    if (!incoming || incoming === documentIdRef.current) return;
    documentIdRef.current = incoming;
    draftIdRef.current = initialDraftId;
    editDraftIdRef.current = initialEditDraftId;
    revisionRef.current += 1;
    latestRef.current = initialSnapshot;
    lastPersistedRef.current = initialSnapshot;
    localKeyRef.current = `${LOCAL_PREFIX}:${userId}:${mode}:${incoming}`;
    scannedRef.current = false;
    setSnapshot(initialSnapshot);
    setDraftId(initialDraftId);
    setEditDraftId(initialEditDraftId);
    setRecovery(null);
    setSaveState("idle");
    setSaveError(null);
    setDocumentKey(incoming);
    onDocumentChangeRef.current?.(initialSnapshot);
  }, [initialDraftId, initialEditDraftId, initialSnapshot, mode, publishedPostId, userId]);

  // The device-copy scan: UniversalComposer.tsx lines 377-422, verbatim.

  // persist: lines 424-471, verbatim.

  // The autosave effect on `snapshot`: lines 473-499, verbatim.

  // flush: lines 501-515, verbatim.

  const navigateAway = useCallback(() => router.push(returnTo), [returnTo, router]);
  const closeLeave = useCallback(() => setShowLeave(false), []);

  const requestClose = async () => {
    if (!hasMeaningfulContribution(snapshot)) {
      navigateAway();
      return;
    }
    const saved = await flush();
    if (saved) navigateAway();
    else setShowLeave(true);
  };

  // publish: the body of finishPublication, lines 540-574, verbatim, under
  // the name `publish`.

  // Both recovery actions clear the key the copy actually came from, which is
  // not always this canvas's own key.
  const restoreRecovery = () => {
    if (!recovery) return null;
    localStorage.removeItem(recovery.key);
    setSnapshot(recovery.snapshot);
    setRecovery(null);
    return recovery.snapshot;
  };

  const dismissRecovery = () => {
    if (!recovery) return;
    localStorage.removeItem(recovery.key);
    setRecovery(null);
  };

  const discardDraft = async () => {
    if (!editDraftIdRef.current) return;
    const result = await discardPublishedEditDraft({ editDraftId: editDraftIdRef.current });
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    localStorage.removeItem(localKeyRef.current);
    router.push(`/post/${publishedSlug}`);
  };

  // "Saved" is the resting state. Only the device-only case earns more words,
  // because it is the only one that carries a consequence for the writer. The
  // screens put an image upload ahead of this, because only they know of it.
  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "cloud"
        ? "Saved"
        : saveState === "device"
          ? "Saved on this device"
          : saveState === "error"
            ? saveError ?? "Save failed"
            : mode === "published-edit" && editDraftId
              ? "Saved"
              : "";
  const bodyText = contributionText(snapshot.content);
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;

  return {
    snapshot,
    setSnapshot,
    saveState,
    saveError,
    saveLabel,
    recovery,
    restoreRecovery,
    dismissRecovery,
    draftId,
    editDraftId,
    documentKey,
    flush,
    requestClose,
    navigateAway,
    showLeave,
    closeLeave,
    publish,
    publishing,
    discardDraft,
    bodyText,
    wordCount,
  };
}

export type ContributionDraft = ReturnType<typeof useContributionDraft>;
```

Each comment of the form "lines N-M, verbatim" stands for the exact code at those lines of the current `UniversalComposer.tsx`, pasted in and then the comment deleted. Paste them in the order shown: the reset effect must stay before the scan effect, which must stay before the autosave effect, as they are in the component today. `publish` is the old `finishPublication` renamed. The original's body calls `setSaveError`, `setPublishing`, `setEditDraftId`, `flush`, `router.replace` and reads `saveError`, `snapshot`, `mode`, `publishedPostId` and `publishedSlug`, all of which are in scope.

- [ ] **Step 4: Make `UniversalComposer` use the hook**

In `app/(write)/write/UniversalComposer.tsx`:

1. Replace the imports on lines 3-34 with:

```tsx
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import ProfileGate from "@/components/ui/ProfileGate";
import TagInput from "@/components/ui/TagInput";
import ReferencesPanel from "@/components/post/ReferencesPanel";
import type { EditorHandle, SelectedImage } from "@/components/editor/Editor";
import {
  deriveContributionExcerpt,
  type ComposerMode,
  type ContributionSnapshot,
} from "@/lib/contribution";
import ArticlePreview, { readingMinutes } from "./ArticlePreview";
import RevisionHistory, { type RestoredRevision } from "./RevisionHistory";
import { useContributionDraft } from "./useContributionDraft";
import { useModalFocus } from "./useModalFocus";
```

2. Delete `type SaveState` (line 43), the constants `LOCAL_PREFIX` to `FOCUSABLE` (lines 160-164), and the functions `snapshotsMatch`, `safeSnapshot`, `textToHtml` and `useModalFocus` (lines 166-256).

3. Replace everything from `const router = useRouter();` (line 270) through the closing `};` of `finishPublication` (line 574) with:

```tsx
  const editorRef = useRef<EditorHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const subtitleRef = useRef<HTMLTextAreaElement>(null);
  const publishDialogRef = useRef<HTMLDivElement>(null);
  const leaveDialogRef = useRef<HTMLDivElement>(null);
  const discardDialogRef = useRef<HTMLDivElement>(null);
  const previewDialogRef = useRef<HTMLDivElement>(null);
  const imagePanelRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState(initialProfile);
  const [showTitle, setShowTitle] = useState(Boolean(initialSnapshot.title.trim()));
  const [showSubtitle, setShowSubtitle] = useState(Boolean(initialSnapshot.excerpt.trim()));
  // One drawer at a time. Independent toggles let a writer stack the format
  // row, the link field, the source list and the drawer all at once, which
  // pushes the canvas off screen behind its own controls.
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [linkUrl, setLinkUrl] = useState("");
  const [activeMarks, setActiveMarks] = useState<Record<string, boolean>>({});
  const [showPublish, setShowPublish] = useState(false);
  const [showProfileGate, setShowProfileGate] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);

  // A different draft arriving resets the screen along with the saving state.
  const resetScreen = useCallback((next: ContributionSnapshot) => {
    setShowTitle(Boolean(next.title.trim()));
    setShowSubtitle(Boolean(next.excerpt.trim()));
    setShowPublish(false);
    setShowPreview(false);
    setPanel(null);
    setSelectedImage(null);
    setImageUploading(false);
    setHistory({ canUndo: false, canRedo: false });
  }, []);

  const {
    snapshot,
    setSnapshot,
    saveState,
    saveError,
    saveLabel: savedLabel,
    recovery,
    restoreRecovery,
    dismissRecovery,
    draftId,
    editDraftId,
    documentKey,
    requestClose,
    navigateAway,
    showLeave,
    closeLeave,
    publish: finishPublication,
    publishing,
    discardDraft,
    bodyText,
    wordCount,
  } = useContributionDraft({
    mode,
    userId,
    initialSnapshot,
    draftId: initialDraftId,
    editDraftId: initialEditDraftId,
    publishedPostId,
    publishedSlug,
    draftUpdatedAt,
    returnTo,
    onDocumentChange: resetScreen,
  });

  const closePublish = useCallback(() => setShowPublish(false), []);
  const closeDiscard = useCallback(() => setShowDiscard(false), []);
  const closePreview = useCallback(() => setShowPreview(false), []);
  const togglePanel = useCallback(
    (next: PanelName) => setPanel((current) => (current === next ? null : next)),
    []
  );
  useModalFocus(showPublish, publishDialogRef, closePublish, publishing);
  useModalFocus(showLeave, leaveDialogRef, closeLeave);
  useModalFocus(showDiscard, discardDialogRef, closeDiscard);
  useModalFocus(showPreview, previewDialogRef, closePreview);

  const openPublishSheet = () => {
    if (!profile?.full_name?.trim() || !profile.username?.trim()) {
      setShowProfileGate(true);
      return;
    }
    // The subtitle is written on the canvas now, so nothing is auto-filled
    // into it here. An empty one still becomes a feed summary, derived from
    // the opening on the server at publish time, which is why the sheet shows
    // that derived line rather than writing it into the writer's own field.
    setShowPublish(true);
  };
```

4. Replace lines 672-691 (from the comment `// "Saved" is the resting state.` through `const wordCount = ...`) with:

```tsx
  // An upload outranks the save state here. It is the only one of the two the
  // writer just started by hand, and a pasted photo gives no other sign that
  // anything is happening until it lands.
  const saveLabel = imageUploading ? "Adding image…" : savedLabel;
```

5. In the recovery banner, replace the Restore button's `onClick` with:

```tsx
onClick={() => { const restored = restoreRecovery(); if (restored) setShowTitle(Boolean(restored.title.trim())); }}
```

and the banner's Discard button's `onClick` with `onClick={dismissRecovery}`.

6. In the discard dialog, replace the Discard button's `onClick` with `onClick={() => void discardDraft()}`.

- [ ] **Step 5: Run the composer tests**

Run: `npx vitest run "app/(write)/write/UniversalComposer.test.tsx"`
Expected: PASS, 33 tests, none of them edited.

- [ ] **Step 6: Type-check and lint the touched files**

Run: `npm run typecheck`
Expected: no errors.

Run: `npx eslint "app/(write)/write"`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(write)/write/useModalFocus.ts" "app/(write)/write/useContributionDraft.ts" "app/(write)/write/UniversalComposer.tsx"
git commit -m "Move the composer's saving logic into useContributionDraft"
```

### Task 7: Save a draft on request, and discard any draft

**Files:**
- Modify: `app/(write)/write/useContributionDraft.ts`
- Create: `app/(write)/write/useContributionDraft.test.ts`
- Modify: `app/(write)/write/UniversalComposer.tsx` (the publish sheet's error line)

**Interfaces:**
- Consumes: `deleteOwnDraftPosts({ postIds }): Promise<ActionResult<DeletePostsResult>>` from `./deleteActions`.
- Produces, changed or added on the hook's return value:
  - `flush(options?: { force?: boolean }): Promise<boolean>`. With `force`, it saves anything `hasMeaningfulContribution` accepts, below the autosave minimum.
  - `requestClose(destination?: string): Promise<void>`. It leaves for `destination`, which defaults to `returnTo`. If the account save fails it opens the leave dialog, and "Leave with device copy" (`navigateAway()`) goes to that same destination.
  - `discardDraft(): Promise<boolean>`. It handles a published edit, a saved draft, and a piece never saved to the account. It waits for an in-flight save and stops autosave while it runs. It returns `false` and reports the error through the save status if the server refuses.
  - `discarding: boolean`.
  - `publishError: string | null`. `publish()` reports failures here, not in `saveError`, so a failed publish is never confused with a failed save.

- [ ] **Step 1: Write the failing tests**

Create `app/(write)/write/useContributionDraft.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionSnapshot } from "@/lib/contribution";
import { useContributionDraft, type ContributionDraftOptions } from "./useContributionDraft";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  ensure: vi.fn(),
  publish: vi.fn(),
  saveEdit: vi.fn(),
  applyEdit: vi.fn(),
  discardEdit: vi.fn(),
  deleteDrafts: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock("./actions", () => ({
  ensureContributionDraft: (input: unknown) => mocks.ensure(input),
  publishContribution: (input: unknown) => mocks.publish(input),
}));
vi.mock("./editActions", () => ({
  savePublishedEditDraft: (input: unknown) => mocks.saveEdit(input),
  applyPublishedEditDraft: (input: unknown) => mocks.applyEdit(input),
  discardPublishedEditDraft: (input: unknown) => mocks.discardEdit(input),
}));
vi.mock("./deleteActions", () => ({
  deleteOwnDraftPosts: (input: unknown) => mocks.deleteDrafts(input),
}));

const empty: ContributionSnapshot = {
  title: "", content: "", excerpt: "", tags: [], coverImageUrl: "", references: [],
};
const written: ContributionSnapshot = {
  ...empty,
  content: "<p>A paragraph that is long enough to keep.</p>",
};

function open(options: Partial<ContributionDraftOptions> = {}) {
  return renderHook(() =>
    useContributionDraft({
      mode: "new",
      userId: "user-1",
      initialSnapshot: empty,
      returnTo: "/",
      ...options,
    })
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.ensure.mockResolvedValue({ error: null, draftId: "draft-1" });
  mocks.publish.mockResolvedValue({ error: null, slug: "hello" });
  mocks.discardEdit.mockResolvedValue({ error: null });
  mocks.deleteDrafts.mockResolvedValue({ ok: true, data: { deleted: ["draft-1"], refusedCount: 0 } });
  localStorage.clear();
  window.history.replaceState(null, "", "/write");
});

afterEach(() => vi.useRealTimers());

describe("saving on request", () => {
  it("saves a short piece when the writer asks, below the autosave minimum", async () => {
    const { result } = open();
    act(() => result.current.setSnapshot({ ...empty, content: "<p>Short.</p>" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(mocks.ensure).not.toHaveBeenCalled();

    let saved = false;
    await act(async () => { saved = await result.current.flush({ force: true }); });

    expect(saved).toBe(true);
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
    expect(result.current.draftId).toBe("draft-1");
  });

  it("has nothing to save when nothing is written", async () => {
    const { result } = open();

    let saved = false;
    await act(async () => { saved = await result.current.flush({ force: true }); });

    expect(saved).toBe(true);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});

describe("leaving", () => {
  it("leaves for the drafts list through the same save as Close", async () => {
    const { result } = open();
    act(() => result.current.setSnapshot(written));

    await act(async () => { await result.current.requestClose("/ada?tab=drafts"); });

    expect(mocks.ensure).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/ada?tab=drafts");
  });

  it("leaves with the device copy for the place the writer was going", async () => {
    mocks.ensure.mockResolvedValue({ error: "Network down", draftId: null });
    const { result } = open({ initialSnapshot: written });
    act(() => result.current.setSnapshot({ ...written, content: "<p>An edit that will not reach the server.</p>" }));

    await act(async () => { await result.current.requestClose("/ada?tab=drafts"); });
    expect(result.current.showLeave).toBe(true);

    act(() => result.current.navigateAway());
    expect(mocks.push).toHaveBeenCalledWith("/ada?tab=drafts");
  });
});

describe("discarding", () => {
  const LOCAL_KEY = "indegenius:contribution-draft:v1:user-1:draft:draft-1";

  it("deletes a saved draft, forgets the device copy and leaves", async () => {
    const { result } = open({ mode: "draft", draftId: "draft-1", initialSnapshot: written });
    localStorage.setItem(LOCAL_KEY, "{}");

    let discarded = false;
    await act(async () => { discarded = await result.current.discardDraft(); });

    expect(discarded).toBe(true);
    expect(mocks.deleteDrafts).toHaveBeenCalledWith({ postIds: ["draft-1"] });
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("deletes the draft a save in flight is creating, and saves nothing after", async () => {
    let finishSave: (value: { error: null; draftId: string }) => void = () => {};
    mocks.ensure.mockImplementationOnce(
      () => new Promise((resolve) => { finishSave = resolve; })
    );
    const { result } = open();
    act(() => result.current.setSnapshot(written));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(mocks.ensure).toHaveBeenCalledTimes(1);

    let discarding: Promise<boolean> = Promise.resolve(false);
    act(() => { discarding = result.current.discardDraft(); });
    await act(async () => {
      finishSave({ error: null, draftId: "draft-1" });
      await discarding;
    });

    expect(mocks.deleteDrafts).toHaveBeenCalledWith({ postIds: ["draft-1"] });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
  });

  it("cancels an autosave that has not started yet", async () => {
    const { result } = open();
    act(() => result.current.setSnapshot(written));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    await act(async () => { await result.current.discardDraft(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.deleteDrafts).not.toHaveBeenCalled();
    expect(localStorage.getItem("indegenius:contribution-draft:v1:user-1:new:new")).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("keeps the draft and says why when the delete fails", async () => {
    mocks.deleteDrafts.mockResolvedValue({ ok: false, error: "We couldn't delete this draft." });
    const { result } = open({ mode: "draft", draftId: "draft-1", initialSnapshot: written });

    let discarded = true;
    await act(async () => { discarded = await result.current.discardDraft(); });

    expect(discarded).toBe(false);
    expect(result.current.saveLabel).toBe("We couldn't delete this draft.");
    expect(result.current.discarding).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("discards a published edit and returns to the live post", async () => {
    const { result } = open({
      mode: "published-edit",
      publishedPostId: "post-1",
      publishedSlug: "hello",
      editDraftId: "edit-1",
      initialSnapshot: written,
      returnTo: "/post/hello",
    });

    await act(async () => { await result.current.discardDraft(); });

    expect(mocks.discardEdit).toHaveBeenCalledWith({ editDraftId: "edit-1" });
    expect(mocks.deleteDrafts).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/post/hello");
  });

  it("returns to the live post when there was no edit to discard", async () => {
    const { result } = open({
      mode: "published-edit",
      publishedPostId: "post-1",
      publishedSlug: "hello",
      initialSnapshot: written,
      returnTo: "/post/hello",
    });

    await act(async () => { await result.current.discardDraft(); });

    expect(mocks.discardEdit).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/post/hello");
  });
});

describe("publishing", () => {
  it("reports a failed publish apart from the save state", async () => {
    mocks.publish.mockResolvedValue({ error: "Add a title.", slug: null });
    const { result } = open({ initialSnapshot: written });

    await act(async () => { await result.current.publish(); });

    expect(result.current.publishError).toBe("Add a title.");
    expect(result.current.saveState).not.toBe("error");
    expect(result.current.publishing).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run "app/(write)/write/useContributionDraft.test.ts"`
Expected: FAIL. `flush` ignores `force`, `requestClose` ignores its destination, `discardDraft` handles only published edits, and `publishError` and `discarding` do not exist.

- [ ] **Step 3: Implement the changes in the hook**

In `app/(write)/write/useContributionDraft.ts`:

1. Add the import:

```ts
import { deleteOwnDraftPosts } from "./deleteActions";
```

2. Replace `const [showLeave, setShowLeave] = useState(false);` with:

```ts
  // Where the writer was going when the account save failed, so "Leave with
  // device copy" goes there rather than always to returnTo.
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  // Set while a discard runs. An autosave now would recreate what it deletes.
  const discardedRef = useRef(false);
```

3. In `persist`, make the first line inside `.then(async () => {` be:

```ts
          if (discardedRef.current) return;
```

4. In the autosave effect, directly after `latestRef.current = snapshot;`, add:

```ts
    if (discardedRef.current) return;
```

5. Replace `flush` with:

```ts
  const flush = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
      const current = latestRef.current;
      // Below the cloud bar there is nothing to flush, and reporting that as a
      // failed save would raise the "didn't save" dialog over three characters.
      // The device copy still holds them. Save draft is the deliberate act that
      // bar waits for, so a forced save only needs something written.
      const worthSaving = options.force
        ? hasMeaningfulContribution(current)
        : deservesCloudDraft(current);
      if (!worthSaving || snapshotsMatch(current, lastPersistedRef.current)) {
        return true;
      }
      const revision = ++revisionRef.current;
      await persist(current, revision);
      await saveQueueRef.current;
      return snapshotsMatch(current, lastPersistedRef.current);
    },
    [persist]
  );
```

6. Replace `navigateAway`, `closeLeave` and `requestClose` with:

```ts
  const showLeave = leaveTarget !== null;
  const navigateAway = useCallback(
    () => router.push(leaveTarget ?? returnTo),
    [leaveTarget, returnTo, router]
  );
  const closeLeave = useCallback(() => setLeaveTarget(null), []);

  const requestClose = async (destination: string = returnTo) => {
    if (!hasMeaningfulContribution(snapshot)) {
      router.push(destination);
      return;
    }
    const saved = await flush();
    if (saved) router.push(destination);
    else setLeaveTarget(destination);
  };
```

7. In `publish`, replace `setSaveError(null);` at the top of the function with `setPublishError(null);`, and in its `catch` replace `setSaveError(...)` with:

```ts
      setPublishError(error instanceof Error ? error.message : "We couldn't finish this publication.");
```

8. Replace `discardDraft` with:

```ts
  const discardDraft = async () => {
    if (localTimerRef.current) clearTimeout(localTimerRef.current);
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    discardedRef.current = true;
    setDiscarding(true);
    setSaveError(null);
    // An autosave already in flight may be creating the draft at this moment.
    // Waiting for it means the id deleted below is the one it created.
    await saveQueueRef.current.catch(() => undefined);

    let error: string | null = null;
    if (mode === "published-edit") {
      if (editDraftIdRef.current) {
        error = (await discardPublishedEditDraft({ editDraftId: editDraftIdRef.current })).error;
      }
    } else if (draftIdRef.current) {
      const result = await deleteOwnDraftPosts({ postIds: [draftIdRef.current] });
      if (!result.ok) error = result.error;
    }

    if (error) {
      discardedRef.current = false;
      if (mountedRef.current) {
        setSaveState("error");
        setSaveError(error);
        setDiscarding(false);
      }
      return false;
    }
    localStorage.removeItem(localKeyRef.current);
    router.push(mode === "published-edit" ? `/post/${publishedSlug}` : returnTo);
    return true;
  };
```

9. Add `publishError` and `discarding` to the returned object, after `publishing` and `discardDraft`.

- [ ] **Step 4: Point the old publish sheet at `publishError`**

In `app/(write)/write/UniversalComposer.tsx`, add `publishError` to the destructured hook values. Replace

```tsx
            {saveError ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p> : null}
```

with

```tsx
            {publishError ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{publishError}</p> : null}
```

and remove `saveError` from the destructuring, since nothing in the component reads it now.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run "app/(write)/write"`
Expected: PASS. That covers the new hook tests and the 33 composer tests.

- [ ] **Step 6: Commit**

```bash
git add "app/(write)/write/useContributionDraft.ts" "app/(write)/write/useContributionDraft.test.ts" "app/(write)/write/UniversalComposer.tsx"
git commit -m "Save drafts on request and discard any draft from the composer"
```

---

## Phase 4: The Article editor

Everything in this phase is built and tested on its own. Nothing is connected to `/write` until Task 18.

### Task 8: One image upload for both screens

**Files:**
- Create: `lib/uploadImage.ts`
- Create: `lib/uploadImage.test.ts`
- Modify: `components/editor/Editor.tsx` (`uploadImageFile`)

**Interfaces:**
- Produces: `type UploadImageResult = { ok: true; url: string } | { ok: false; error: string }` and `uploadImage(file: File): Promise<UploadImageResult>` from `lib/uploadImage.ts`.

- [ ] **Step 1: Write the failing tests**

Create `lib/uploadImage.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ token: "token-1" as string | null }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: auth.token ? { access_token: auth.token } : null },
      }),
    },
  }),
}));

import { uploadImage } from "./uploadImage";

const file = new File(["png"], "chart.png", { type: "image/png" });

function respondWith(body: unknown) {
  const fetchMock = vi.fn(async () => ({ json: async () => body }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("uploadImage", () => {
  beforeEach(() => {
    auth.token = "token-1";
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends the file with the session's token and returns the stored address", async () => {
    const fetchMock = respondWith({ url: "https://cdn.example/chart.png" });

    await expect(uploadImage(file)).resolves.toEqual({ ok: true, url: "https://cdn.example/chart.png" });

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/upload-image");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer token-1" });
    expect(((init.body as FormData).get("file") as File).name).toBe("chart.png");
  });

  it("sends no token when there is no session", async () => {
    auth.token = null;
    const fetchMock = respondWith({ url: "https://cdn.example/chart.png" });

    await uploadImage(file);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({});
  });

  it("passes on the server's reason for refusing", async () => {
    respondWith({ error: "That file is not an image." });

    await expect(uploadImage(file)).resolves.toEqual({ ok: false, error: "That file is not an image." });
  });

  it("explains a refusal the server gave no reason for", async () => {
    respondWith({});

    await expect(uploadImage(file)).resolves.toEqual({
      ok: false,
      error: "Upload failed. Check the file type and size.",
    });
  });

  it("reports a failed connection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));

    await expect(uploadImage(file)).resolves.toEqual({
      ok: false,
      error: "Couldn't upload image. Check your connection and try again.",
    });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/uploadImage.test.ts`
Expected: FAIL with "Failed to resolve import "./uploadImage"".

- [ ] **Step 3: Implement `uploadImage`**

Create `lib/uploadImage.ts`:

```ts
export type UploadImageResult = { ok: true; url: string } | { ok: false; error: string };

const REFUSED = "Upload failed. Check the file type and size.";
const OFFLINE = "Couldn't upload image. Check your connection and try again.";

/**
 * One image, uploaded through /api/upload-image, which checks the bytes are
 * really an image before storing them. The Article editor's inline images
 * and the Post composer's single image both come through here, so both get
 * the same checks and the same messages.
 */
export async function uploadImage(file: File): Promise<UploadImageResult> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const { createClient } = await import("@/lib/supabase/client");
    const {
      data: { session },
    } = await createClient().auth.getSession();

    const response = await fetch("/api/upload-image", {
      method: "POST",
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      body: formData,
    });
    const json = (await response.json()) as { url?: unknown; error?: unknown };
    if (typeof json.url === "string" && json.url) return { ok: true, url: json.url };
    return { ok: false, error: typeof json.error === "string" && json.error ? json.error : REFUSED };
  } catch {
    return { ok: false, error: OFFLINE };
  }
}
```

In `components/editor/Editor.tsx`, add `import { uploadImage } from "@/lib/uploadImage";` and replace the whole `uploadImageFile` callback with:

```ts
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/uploadImage.test.ts lib/browserDatabaseBoundary.test.ts lib/browserWriteBoundary.test.ts`
Expected: PASS. The boundary tests allow `supabase.auth.*` from the browser.

- [ ] **Step 5: Commit**

```bash
git add lib/uploadImage.ts lib/uploadImage.test.ts components/editor/Editor.tsx
git commit -m "Share one image upload between the editor and the Post composer"
```

### Task 9: The editor comes in two variants

**Files:**
- Create: `components/editor/editorIcons.tsx`
- Modify: `components/editor/extensions.ts` (remove `CharacterCount`; add `caretInEmptyBlock` and `stripPastedImages`)
- Test: `components/editor/extensions.test.ts`
- Rewrite: `components/editor/Editor.tsx`
- Modify: `app/(write)/write/UniversalComposer.tsx` (the `<Editor>` call)
- Modify: `app/globals.css` (after the `.write-canvas-editor h2, .write-canvas-editor h3` rule)
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `editorExtensions`, `TEXT_ALIGNMENTS`, `TextAlignment` (Task 2); `uploadImage` (Task 8).
- Produces, from `components/editor/editorIcons.tsx`: `Icon({ path, className? })`; the icon constants `BOLD_ICON`, `ITALIC_ICON`, `QUOTE_ICON`, `BULLETS_ICON`, `NUMBERS_ICON`, `DIVIDER_ICON`, `UNDO_ICON`, `REDO_ICON`, `SOURCES_ICON`, `PREVIEW_ICON`, `CLOSE_ICON`, `PLUS_ICON`, `MORE_ICON`, `IMAGE_ICON`, `LINK_ICON`, `BACK_ICON`, `ARTICLE_ICON`; and `ALIGNMENT_OPTIONS: ReadonlyArray<{ value: TextAlignment; label: string; icon: ReactNode }>` in the order left, center, right, justify, labelled "Align left", "Align centre", "Align right", "Justify".
- Produces, from `components/editor/extensions.ts`: `caretInEmptyBlock(state: EditorState): boolean` and `stripPastedImages(html: string): string`.
- Produces, from `components/editor/Editor.tsx`: `type EditorVariant = "post" | "article"`. The props are `{ content?, placeholder?, variant?, onUpdate?(html: string), onSelectionUpdate?(), onImageUploadingChange?(uploading: boolean), onImageFile?(file: File), ariaLabel?, autoFocus? }`. `canvasMode`, `minWords` and `showWordCount` are gone. `EditorHandle` gains `focus(): void`.

- [ ] **Step 1: Write the failing tests**

In `components/editor/extensions.test.ts`, change the import from `./extensions` to:

```ts
import { caretInEmptyBlock, editorExtensions, stripPastedImages } from "./extensions";
```

and append:

```ts
describe("one schema for both variants", () => {
  it("keeps an older Post's headings, lists and image when it is opened again", () => {
    // The Post composer hides the tools, not the formats. A Post published
    // before the redesign must come back exactly as it was.
    const older = '<h2>Heading</h2><ul><li><p>One</p></li></ul><img src="https://x/a.png" alt="A chart">';

    expect(editorWith(older).getHTML()).toBe(older);
  });
});

describe("the insert button", () => {
  it("appears only in an empty top-level block", () => {
    const editor = editorWith("<p>Text</p><p></p><blockquote><p></p></blockquote>");

    editor.commands.setTextSelection(7);
    expect(caretInEmptyBlock(editor.state)).toBe(true);

    editor.commands.setTextSelection(2);
    expect(caretInEmptyBlock(editor.state)).toBe(false);

    editor.commands.setTextSelection(10);
    expect(caretInEmptyBlock(editor.state)).toBe(false);
  });
});

describe("pasting into a Post", () => {
  it("takes out images and keeps the text and its formatting", () => {
    const pasted =
      '<p>From <strong>Word</strong></p><img src="https://x/a.png"><figure><img src="https://x/b.png"><figcaption>Chart</figcaption></figure><p>After</p>';

    expect(stripPastedImages(pasted)).toBe("<p>From <strong>Word</strong></p><p>After</p>");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/editor/extensions.test.ts`
Expected: FAIL. `caretInEmptyBlock` and `stripPastedImages` are not exported.

- [ ] **Step 3: Add the two helpers and drop `CharacterCount`**

In `components/editor/extensions.ts`, delete the `CharacterCount` import and the `CharacterCount,` line in `editorExtensions`. Nothing reads a count any more, because neither screen shows one. Add the import:

```ts
import type { EditorState } from "@tiptap/pm/state";
```

and append:

```ts
/**
 * Whether the caret sits alone in an empty top-level paragraph or heading.
 * That is where the Article editor's "+" insert button appears. It is the rule
 * Tiptap's own FloatingMenu uses, without the focus check, which needs a live
 * view and stays in Editor.tsx.
 */
export function caretInEmptyBlock(state: EditorState): boolean {
  const { $anchor, empty } = state.selection;
  return (
    empty &&
    $anchor.depth === 1 &&
    $anchor.parent.isTextblock &&
    !$anchor.parent.type.spec.code &&
    $anchor.parent.content.size === 0
  );
}

/**
 * A Post has one image, attached below the text, and never one inside it.
 * Copying from a web page or a word processor brings images along with the
 * markup, so the Post editor takes them out before the paste lands. The text
 * and its formatting still paste.
 */
export function stripPastedImages(html: string): string {
  return html.replace(/<figure\b[\s\S]*?<\/figure>/gi, "").replace(/<img\b[^>]*>/gi, "");
}
```

Run: `npm uninstall @tiptap/extension-character-count`
Expected: the package leaves `package.json`. It is imported nowhere else (`BroadcastEditor.tsx` uses StarterKit, Link and Placeholder only).

- [ ] **Step 4: Create the icon set**

Create `components/editor/editorIcons.tsx`. The first nine constants are the ones in `UniversalComposer.tsx` today, with the same paths:

```tsx
import type { ReactNode } from "react";
import type { TextAlignment } from "./extensions";

/** One stroke icon. Every write-screen icon is drawn at this weight so the toolbars read as one set. */
export function Icon({ path, className = "h-5 w-5" }: { path: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const UNDO_ICON = <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />;
export const REDO_ICON = <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />;
export const SOURCES_ICON = (
  <>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z" />
  </>
);
export const PREVIEW_ICON = (
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12" />
    <circle cx="12" cy="12" r="2.75" />
  </>
);
export const CLOSE_ICON = <path d="M6 6l12 12M18 6 6 18" />;
export const PLUS_ICON = <path d="M12 5v14M5 12h14" />;
export const MORE_ICON = (
  <>
    <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </>
);
export const IMAGE_ICON = (
  <>
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="m5.5 17 4.25-4.25 3 3 2.25-2.25 3.5 3.5" />
    <circle cx="15.5" cy="9" r="1.25" />
  </>
);
export const LINK_ICON = (
  <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" />
);
export const BOLD_ICON = <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zm0 7h7a3.5 3.5 0 0 1 0 7H7z" />;
export const ITALIC_ICON = <path d="M15 5h-5m4 14H9M14 5l-4 14" />;
export const QUOTE_ICON = <path d="M5 5v14M10 8h9M10 12h9M10 16h6" />;
export const BULLETS_ICON = (
  <>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
  </>
);
export const NUMBERS_ICON = (
  <>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M4 5.5h1V9M3.6 15.2a1.2 1.2 0 1 1 1.9 1.4L3.6 18.6H5.6" />
  </>
);
export const DIVIDER_ICON = <path d="M4 12h16" />;
export const BACK_ICON = <path d="M19 12H5m6-6-6 6 6 6" />;
export const ARTICLE_ICON = (
  <>
    <path d="M6 3.5h9l3 3v14H6z" />
    <path d="M9 10h6M9 13.5h6M9 17h4" />
  </>
);

export const ALIGNMENT_OPTIONS: ReadonlyArray<{
  value: TextAlignment;
  label: string;
  icon: ReactNode;
}> = [
  { value: "left", label: "Align left", icon: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" /> },
  { value: "center", label: "Align centre", icon: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" /> },
  { value: "right", label: "Align right", icon: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" /> },
  { value: "justify", label: "Justify", icon: <path d="M4 6h16M4 10h16M4 14h16M4 18h16" /> },
];
```

- [ ] **Step 5: Rewrite `Editor.tsx`**

Replace the whole of `components/editor/Editor.tsx` with the following. The dead non-canvas toolbar, the word-count bar, `ToolbarButton` and the word-count state go. `imageFilesFrom`, `insertImageFiles`, `showUploadError`, `handleImageFileChange`, the content-sync effect and every existing handle method keep their current behaviour.

```tsx
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
  BOLD_ICON,
  BULLETS_ICON,
  DIVIDER_ICON,
  IMAGE_ICON,
  ITALIC_ICON,
  Icon,
  LINK_ICON,
  NUMBERS_ICON,
  PLUS_ICON,
  QUOTE_ICON,
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

function imageFilesFrom(data: DataTransfer | null) {
  if (!data) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
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
      title={label}
      onMouseDown={keepSelection}
      onClick={onPress}
      className={`flex h-9 min-w-9 items-center justify-center rounded px-2 text-sm font-semibold transition-colors ${
        pressed ? "bg-white/20 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
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

  const insertItems = editor
    ? [
        { label: "Image", icon: IMAGE_ICON, run: () => imageInputRef.current?.click() },
        { label: "Divider", icon: DIVIDER_ICON, run: () => editor.chain().focus().setHorizontalRule().run() },
        { label: "Bulleted list", icon: BULLETS_ICON, run: () => editor.chain().focus().toggleBulletList().run() },
        { label: "Numbered list", icon: NUMBERS_ICON, run: () => editor.chain().focus().toggleOrderedList().run() },
      ]
    : [];

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
          ) : bubblePanel === "align" ? (
            <div
              role="group"
              aria-label="Alignment"
              className="flex items-center gap-0.5 rounded-md border border-card-border bg-surface p-1 text-ink shadow-lg shadow-ink/10"
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
                    className={`flex h-9 w-9 items-center justify-center rounded transition-colors ${
                      pressed ? "bg-green-tint text-emerald-ink" : "text-ink-muted hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <Icon path={option.icon} className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              role="toolbar"
              aria-label="Text formatting"
              className="flex items-center gap-0.5 rounded-md bg-emerald-brand p-1 shadow-lg shadow-ink/20"
            >
              <BubbleButton label="Bold" pressed={editor.isActive("bold")} onPress={() => editor.chain().focus().toggleBold().run()}>
                <Icon path={BOLD_ICON} className="h-4 w-4" />
              </BubbleButton>
              <BubbleButton label="Italic" pressed={editor.isActive("italic")} onPress={() => editor.chain().focus().toggleItalic().run()}>
                <Icon path={ITALIC_ICON} className="h-4 w-4" />
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
                <Icon path={LINK_ICON} className="h-4 w-4" />
              </BubbleButton>
              <span className="mx-0.5 h-5 w-px bg-white/25" aria-hidden="true" />
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
                <Icon path={QUOTE_ICON} className="h-4 w-4" />
              </BubbleButton>
              <BubbleButton label="Alignment" onPress={() => setBubblePanel("align")}>
                <Icon path={currentAlignment.icon} className="h-4 w-4" />
              </BubbleButton>
            </div>
          )}
        </BubbleMenu>
      ) : null}

      {editor && variant === "article" ? (
        <FloatingMenu
          editor={editor}
          tippyOptions={{ duration: 100, placement: "left", offset: [0, 12], onHidden: () => setInsertOpen(false) }}
          shouldShow={({ view, state }) => !touchRef.current && view.hasFocus() && caretInEmptyBlock(state)}
        >
          <div
            className="relative"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setInsertOpen(false);
                editor.commands.focus();
              }
            }}
          >
            <button
              type="button"
              aria-label="Insert"
              aria-haspopup="menu"
              aria-expanded={insertOpen}
              onMouseDown={keepSelection}
              onClick={() => setInsertOpen((open) => !open)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-card-border bg-surface text-ink-muted shadow-sm transition-colors hover:border-emerald-brand hover:text-emerald-brand"
            >
              <Icon path={PLUS_ICON} />
            </button>
            {insertOpen ? (
              <div
                role="menu"
                aria-label="Insert"
                className="absolute left-0 top-12 z-10 w-52 rounded-lg border border-card-border bg-surface p-1 shadow-lg shadow-ink/10"
              >
                {insertItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onMouseDown={keepSelection}
                    onClick={() => {
                      setInsertOpen(false);
                      item.run();
                    }}
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
```

- [ ] **Step 6: Give the two surfaces their CSS**

In `app/globals.css`, add after the `.write-canvas-editor h2, .write-canvas-editor h3 { font-weight: 600; }` rule:

```css
/* The two write screens. Their type comes from the live page classes they
   sit on (.publication-article-body, .publication-post-body), so these add
   only what an editable surface needs. */
.write-article-editor {
  min-height: 50vh;
  padding-bottom: 4rem;
}

.write-post-editor {
  min-height: 9rem;
}

.write-article-editor p.is-editor-empty:first-child::before,
.write-post-editor p.is-editor-empty:first-child::before {
  color: #7d7986;
}
```

- [ ] **Step 7: Update the old composer's editor call**

In `app/(write)/write/UniversalComposer.tsx`, in the `<Editor ... />` element, delete the `canvasMode` and `showWordCount={false}` props and add `variant="article"`. The canvas takes on the article typography until Task 18 replaces it.

- [ ] **Step 8: Run the tests and the type check**

Run: `npx vitest run components/editor "app/(write)/write"`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json components/editor "app/(write)/write/UniversalComposer.tsx" app/globals.css
git commit -m "Give the editor Post and Article variants with restyled menus"
```

### Task 10: Sheets, and focus that comes back

**Files:**
- Modify: `app/(write)/write/useModalFocus.ts`
- Create: `app/(write)/write/WriteSheet.tsx`
- Create: `app/(write)/write/WriteSheet.test.tsx`

**Interfaces:**
- Consumes: `useModalFocus` (Task 6); `Icon`, `CLOSE_ICON` (Task 9).
- Produces: `useModalFocus` also returns focus to whatever had it when the dialog opened. `WriteSheet` default export with props `{ open: boolean; title: string; onClose: () => void; desktop?: "side" | "dialog"; busy?: boolean; footer?: ReactNode; onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void; children: ReactNode }`. From `md` up, "side" is a 420px panel on the right and "dialog" a centred 480px dialog. Both are bottom sheets below `md`.

- [ ] **Step 1: Write the failing tests**

Create `app/(write)/write/WriteSheet.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import WriteSheet from "./WriteSheet";

function Harness({ busy = false, onClose }: { busy?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open sources
      </button>
      <WriteSheet
        open={open}
        title="Sources"
        busy={busy}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <input aria-label="Source title" />
      </WriteSheet>
    </>
  );
}

describe("WriteSheet", () => {
  it("renders nothing until it is opened", () => {
    render(<Harness />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a labelled dialog that closes on Escape and hands focus back", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open sources" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Sources" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("stays open on Escape while it is busy", () => {
    const onClose = vi.fn();
    render(<Harness busy onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sources" }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Sources" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run "app/(write)/write/WriteSheet.test.tsx"`
Expected: FAIL with "Failed to resolve import "./WriteSheet"".

- [ ] **Step 3: Return focus on close**

In `app/(write)/write/useModalFocus.ts`, add this effect at the top of `useModalFocus`, before the existing one. It has to come first so that it records the opener before the existing effect moves focus into the dialog:

```ts
  // Whatever had focus when the dialog opened gets it back when it closes, so
  // a keyboard user lands where they were rather than at the top of the page.
  // Keyed on `open` alone: `busy` changing mid-publish must not bounce focus.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);
```

- [ ] **Step 4: Create `WriteSheet`**

Create `app/(write)/write/WriteSheet.tsx`:

```tsx
"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CLOSE_ICON, Icon } from "@/components/editor/editorIcons";
import { useModalFocus } from "./useModalFocus";

interface WriteSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** From md up: "side" is a 420px panel on the right, "dialog" a centred 480px dialog. Both are bottom sheets on a phone. */
  desktop?: "side" | "dialog";
  /** While true, Escape and the close controls do nothing. */
  busy?: boolean;
  footer?: ReactNode;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

const FRAME = {
  side: "md:inset-y-0 md:bottom-auto md:left-auto md:right-0 md:h-dvh md:max-h-none md:w-[420px] md:rounded-none md:border-l",
  dialog:
    "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85dvh] md:w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl",
} as const;

export default function WriteSheet({
  open,
  title,
  onClose,
  desktop = "side",
  busy = false,
  footer,
  onKeyDown,
  children,
}: WriteSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Callers pass inline handlers. Routing them through a ref keeps
  // useModalFocus from re-running, and refocusing, on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const close = useCallback(() => onCloseRef.current(), []);
  useModalFocus(open, dialogRef, close, busy);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Close ${title}`}
        onClick={busy ? undefined : close}
        className="absolute inset-0 bg-ink/40"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={`absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl border-divider bg-surface text-ink shadow-2xl ${FRAME[desktop]}`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-divider md:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3 md:pt-5">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-40"
          >
            <Icon path={CLOSE_ICON} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer ? (
          <div
            className="shrink-0 border-t border-divider px-5 pt-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run "app/(write)/write"`
Expected: PASS. The old composer's dialogs also return focus now, which none of its tests contradict.

- [ ] **Step 6: Commit**

```bash
git add "app/(write)/write/useModalFocus.ts" "app/(write)/write/WriteSheet.tsx" "app/(write)/write/WriteSheet.test.tsx"
git commit -m "Add a sheet for the write screens and return focus when dialogs close"
```

### Task 11: The reader preview in the live page's type

**Files:**
- Modify: `app/(write)/write/ArticlePreview.tsx` (whole file)
- Create: `app/(write)/write/ArticlePreview.test.tsx`
- Modify: `app/(write)/write/UniversalComposer.tsx` (the publish sheet's `<ArticlePreview>`)

**Interfaces:**
- Consumes: `isWrittenExcerpt` (Task 3).
- Produces: `readingMinutes(wordCount): number | null` (unchanged); `lengthLabel(wordCount: number): string`, which returns for example "1,240 words · 7 min read" or "1 word"; the default export `ArticlePreview({ snapshot, authorName, avatarUrl?, wordCount })`. The `variant` prop is removed.

- [ ] **Step 1: Write the failing tests**

Create `app/(write)/write/ArticlePreview.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContributionSnapshot } from "@/lib/contribution";
import ArticlePreview, { lengthLabel } from "./ArticlePreview";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <div role="img" aria-label={props.alt} />,
}));
vi.mock("@/components/ui/UserAvatar", () => ({
  default: ({ name }: { name: string }) => <span>{`Avatar of ${name}`}</span>,
}));

const body = "<p>Solar microgrids are changing Jos. Here is how.</p>";
const piece: ContributionSnapshot = {
  title: "Power to the people",
  content: body,
  excerpt: "",
  tags: ["energy"],
  coverImageUrl: "",
  references: [],
};

describe("ArticlePreview", () => {
  it("sets the title and body in the live page's type", () => {
    const { container } = render(<ArticlePreview snapshot={piece} authorName="Ada" wordCount={9} />);

    expect(screen.getByRole("heading", { level: 1, name: "Power to the people" })).toHaveClass(
      "publication-article-title"
    );
    expect(container.querySelector(".publication-article-body")?.innerHTML).toBe(body);
  });

  it("prints a summary under the title only when someone wrote it", () => {
    const { rerender } = render(
      <ArticlePreview snapshot={{ ...piece, excerpt: "Solar microgrids are changing Jos." }} authorName="Ada" wordCount={9} />
    );
    expect(screen.queryByText("Solar microgrids are changing Jos.")).not.toBeInTheDocument();

    rerender(
      <ArticlePreview snapshot={{ ...piece, excerpt: "How a city paid for its grid" }} authorName="Ada" wordCount={9} />
    );
    expect(screen.getByText("How a city paid for its grid")).toBeInTheDocument();
  });

  it("bylines the writer with the length, and ends on the topics", () => {
    render(<ArticlePreview snapshot={piece} authorName="Ada" wordCount={1240} />);

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("1,240 words · 7 min read")).toBeInTheDocument();
    expect(screen.getByText("energy")).toBeInTheDocument();
  });
});

describe("lengthLabel", () => {
  it("counts words and minutes", () => {
    expect(lengthLabel(1)).toBe("1 word · 1 min read");
    expect(lengthLabel(0)).toBe("0 words");
    expect(lengthLabel(1240)).toBe("1,240 words · 7 min read");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run "app/(write)/write/ArticlePreview.test.tsx"`
Expected: FAIL. `lengthLabel` does not exist, the title uses `font-display`, and a generated summary is printed.

- [ ] **Step 3: Rewrite `ArticlePreview.tsx`**

Replace `app/(write)/write/ArticlePreview.tsx` with:

```tsx
"use client";

import Image from "next/image";
import UserAvatar from "@/components/ui/UserAvatar";
import { isWrittenExcerpt, type ContributionSnapshot } from "@/lib/contribution";

/**
 * The publication as a reader meets it. The question a writer opens a preview
 * to answer is "does this read well": whether the headings breathe, whether an
 * image lands in the right paragraph, whether section four is a wall of text.
 *
 * The title and body use the live article page's own classes
 * (app/(main)/post/[slug]/page.tsx). A preview in different type from the
 * real page is worse than no preview, because it is confidently wrong.
 */

export function readingMinutes(wordCount: number) {
  if (wordCount <= 0) return null;
  return Math.max(1, Math.ceil(wordCount / 200));
}

/** "1,240 words · 7 min read". Shared by this byline and Publish settings. */
export function lengthLabel(wordCount: number) {
  const words = wordCount === 1 ? "1 word" : `${wordCount.toLocaleString()} words`;
  const minutes = readingMinutes(wordCount);
  return minutes ? `${words} · ${minutes} min read` : words;
}

interface ArticlePreviewProps {
  snapshot: ContributionSnapshot;
  authorName: string;
  avatarUrl?: string | null;
  wordCount: number;
}

export default function ArticlePreview({
  snapshot,
  authorName,
  avatarUrl = null,
  wordCount,
}: ArticlePreviewProps) {
  const title = snapshot.title.trim();
  // The live page's rule: a summary is printed under the title only when
  // someone wrote it, never when it is the body's own opening.
  const dek = isWrittenExcerpt(snapshot.excerpt, snapshot.content) ? snapshot.excerpt.trim() : "";

  return (
    <article className="mx-auto max-w-[680px] px-5 py-10 sm:px-8">
      {snapshot.coverImageUrl ? (
        <div className="relative mb-8 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-canvas">
          <Image
            src={snapshot.coverImageUrl}
            alt=""
            fill
            sizes="(max-width: 680px) 100vw, 680px"
            className="object-cover"
          />
        </div>
      ) : null}

      {title ? (
        <h1 className="publication-article-title text-[36px] font-semibold leading-[1.16] tracking-[-0.01em] text-ink sm:text-[44px]">
          {title}
        </h1>
      ) : null}

      {dek ? (
        <p className="mt-3 font-public-sans text-[16px] leading-[1.5] text-ink-muted sm:mt-4 sm:text-[19px] sm:leading-[1.55]">
          {dek}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-3 border-b border-divider pb-6">
        <UserAvatar name={authorName} src={avatarUrl} size={40} />
        <div className="min-w-0 text-meta text-ink-muted">
          <p className="font-medium text-ink">{authorName}</p>
          <p>{lengthLabel(wordCount)}</p>
        </div>
      </div>

      {/* The body is this writer's own editor output, constrained by the
          Tiptap schema, and the server sanitizes it again on save. */}
      <div
        className="publication-article-body mt-8"
        dangerouslySetInnerHTML={{ __html: snapshot.content }}
      />

      {snapshot.references.length ? (
        <section className="mt-12 border-t border-divider pt-8">
          <h2 className="text-kicker font-semibold uppercase text-ink-muted">Sources</h2>
          <ol className="mt-3 space-y-2.5">
            {snapshot.references.map((reference, index) => (
              <li key={reference.id ?? index} className="text-sm leading-relaxed text-ink-soft">
                <span className="text-ink">{reference.title}</span>
                {reference.authors ? `. ${reference.authors}` : ""}
                {reference.year ? `, ${reference.year}` : ""}
                {reference.source ? `. ${reference.source}` : ""}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {snapshot.tags.length ? (
        <div className="mt-10 flex flex-wrap gap-2">
          {snapshot.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-green-tint px-3 py-1 text-xs font-medium text-emerald-ink"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
```

In `app/(write)/write/UniversalComposer.tsx`, delete the `variant="compact"` prop from the `<ArticlePreview>` inside the publish sheet. The sheet shows the full preview until Task 18 removes it.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run "app/(write)/write"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(write)/write/ArticlePreview.tsx" "app/(write)/write/ArticlePreview.test.tsx" "app/(write)/write/UniversalComposer.tsx"
git commit -m "Set the reader preview in the live article page's type"
```

### Task 12: Publish settings

**Files:**
- Create: `app/(write)/write/PublishSettingsDialog.tsx`
- Create: `app/(write)/write/PublishSettingsDialog.test.tsx`

**Interfaces:**
- Consumes: `WriteSheet` (Task 10); `lengthLabel` (Task 11); `TagInput` (`{ value, onChange, showLabel?, maxTags?, placeholder?, disabled? }`); `Button` (`variant?`, `loading?`).
- Produces: default export `PublishSettingsDialog` with props `{ open: boolean; onClose: () => void; tags: string[]; onTagsChange: (tags: string[]) => void; wordCount: number; error: string | null; publishing: boolean; isUpdate: boolean; canPublish: boolean; onPublish: () => void }`.

- [ ] **Step 1: Write the failing tests**

Create `app/(write)/write/PublishSettingsDialog.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublishSettingsDialog from "./PublishSettingsDialog";

vi.mock("@/components/ui/TagInput", () => ({ default: () => <input aria-label="Topics" /> }));

function open(overrides: Partial<Parameters<typeof PublishSettingsDialog>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    tags: [],
    onTagsChange: vi.fn(),
    wordCount: 1240,
    error: null,
    publishing: false,
    isUpdate: false,
    canPublish: true,
    onPublish: vi.fn(),
    ...overrides,
  };
  render(<PublishSettingsDialog {...props} />);
  return props;
}

describe("PublishSettingsDialog", () => {
  it("asks for topics and states the length, and nothing about the feed", () => {
    open();

    expect(screen.getByRole("dialog", { name: "Publish settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Topics")).toBeInTheDocument();
    expect(screen.getByText("1,240 words · 7 min read")).toBeInTheDocument();
    expect(screen.queryByText(/In the feed/)).not.toBeInTheDocument();
  });

  it("publishes from its button", () => {
    const props = open();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(props.onPublish).toHaveBeenCalled();
  });

  it("says Update for a piece that is already published", () => {
    open({ isUpdate: true });

    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("publishes on Cmd+Enter", () => {
    const props = open();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Publish settings" }), { key: "Enter", metaKey: true });

    expect(props.onPublish).toHaveBeenCalled();
  });

  it("does not publish on a bare Enter, which belongs to the topic field", () => {
    const props = open();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Publish settings" }), { key: "Enter" });

    expect(props.onPublish).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const props = open();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(props.onClose).toHaveBeenCalled();
  });

  it("stays open on Escape while publishing", () => {
    const props = open({ publishing: true });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("says why a publish failed", () => {
    open({ error: "Each source needs a title." });

    expect(screen.getByRole("alert")).toHaveTextContent("Each source needs a title.");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run "app/(write)/write/PublishSettingsDialog.test.tsx"`
Expected: FAIL with "Failed to resolve import "./PublishSettingsDialog"".

- [ ] **Step 3: Implement it**

Create `app/(write)/write/PublishSettingsDialog.tsx`:

```tsx
"use client";

import Button from "@/components/ui/Button";
import TagInput from "@/components/ui/TagInput";
import { lengthLabel } from "./ArticlePreview";
import WriteSheet from "./WriteSheet";

interface PublishSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  wordCount: number;
  error: string | null;
  publishing: boolean;
  isUpdate: boolean;
  canPublish: boolean;
  onPublish: () => void;
}

/**
 * The last step for an Article, and only an Article: a Post publishes from its
 * own button. Topics, then the length, then Publish. The reader preview is one
 * tap away in the editor's header, so this does not repeat it.
 */
export default function PublishSettingsDialog({
  open,
  onClose,
  tags,
  onTagsChange,
  wordCount,
  error,
  publishing,
  isUpdate,
  canPublish,
  onPublish,
}: PublishSettingsDialogProps) {
  return (
    <WriteSheet
      open={open}
      title="Publish settings"
      desktop="dialog"
      onClose={onClose}
      busy={publishing}
      // Cmd/Ctrl+Enter is the muscle memory for "send this", and this dialog
      // is the one place where it is unambiguous.
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canPublish && !publishing) {
          event.preventDefault();
          onPublish();
        }
      }}
      footer={
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={publishing} className="min-h-11 flex-1">
            Cancel
          </Button>
          <Button type="button" onClick={onPublish} loading={publishing} disabled={!canPublish} className="min-h-11 flex-1">
            {isUpdate ? "Update" : "Publish"}
          </Button>
        </div>
      }
    >
      <p className="mb-2 text-sm font-semibold text-ink">
        Topics <span className="font-normal text-ink-muted">(optional)</span>
      </p>
      <TagInput
        value={tags}
        onChange={onTagsChange}
        showLabel={false}
        maxTags={5}
        placeholder="Add a topic"
        disabled={publishing}
      />
      <p className="mt-5 text-meta text-ink-muted">{lengthLabel(wordCount)}</p>
      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </WriteSheet>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run "app/(write)/write/PublishSettingsDialog.test.tsx"`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(write)/write/PublishSettingsDialog.tsx" "app/(write)/write/PublishSettingsDialog.test.tsx"
git commit -m "Add Publish settings for Articles: topics and length"
```

### Task 13: The ••• menu

**Files:**
- Create: `app/(write)/write/ComposerMenu.tsx`
- Create: `app/(write)/write/ComposerMenu.test.tsx`

**Interfaces:**
- Consumes: `Icon`, `MORE_ICON` (Task 9).
- Produces: default export `ComposerMenu`, and `interface ComposerMenuProps { canSaveDraft: boolean; onSaveDraft: () => void; discardLabel: string; canDiscard: boolean; onDiscard: () => void; onOpenDrafts?: () => void; sourcesCount?: number; onOpenSources?: () => void; onOpenHistory?: () => void }`. An item whose callback is not given is not shown. That is how the Post composer gets only Drafts, Save draft and Discard. Choosing an item closes the menu and puts focus back on the ••• button before the item's callback runs, so a sheet that opens next records the button as the place to return focus to.

- [ ] **Step 1: Write the failing tests**

Create `app/(write)/write/ComposerMenu.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ComposerMenu, { type ComposerMenuProps } from "./ComposerMenu";

function openMenu(overrides: Partial<ComposerMenuProps> = {}) {
  const props: ComposerMenuProps = {
    canSaveDraft: true,
    onSaveDraft: vi.fn(),
    discardLabel: "Discard",
    canDiscard: true,
    onDiscard: vi.fn(),
    ...overrides,
  };
  const view = render(<ComposerMenu {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  return { props, ...view };
}

describe("ComposerMenu", () => {
  it("opens from the ••• button", () => {
    openMenu();

    expect(screen.getByRole("button", { name: "More options" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "More options" })).toBeInTheDocument();
  });

  it("offers sources with their count, then hands focus back to the button", () => {
    const { props } = openMenu({ sourcesCount: 2, onOpenSources: vi.fn(), onOpenHistory: vi.fn() });

    fireEvent.click(screen.getByRole("menuitem", { name: "Sources, 2 added" }));

    expect(props.onOpenSources).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options" })).toHaveFocus();
  });

  it("offers version history only when there is a saved draft to have one", () => {
    const { props, unmount } = openMenu({ onOpenHistory: vi.fn() });
    fireEvent.click(screen.getByRole("menuitem", { name: "Version history" }));
    expect(props.onOpenHistory).toHaveBeenCalled();
    unmount();

    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Version history" })).not.toBeInTheDocument();
  });

  it("leaves sources and version history out of a Post's menu", () => {
    openMenu();

    expect(screen.queryByRole("menuitem", { name: /Sources/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Version history" })).not.toBeInTheDocument();
  });

  it("goes to the drafts list only when there is one to go to", () => {
    const { props, unmount } = openMenu({ onOpenDrafts: vi.fn() });
    fireEvent.click(screen.getByRole("menuitem", { name: "Drafts" }));
    expect(props.onOpenDrafts).toHaveBeenCalled();
    unmount();

    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Drafts" })).not.toBeInTheDocument();
  });

  it("saves a draft on request, once there is something to save", () => {
    const { props } = openMenu({ canSaveDraft: false });
    const save = screen.getByRole("menuitem", { name: "Save draft" });

    expect(save).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(save);
    expect(props.onSaveDraft).not.toHaveBeenCalled();
  });

  it("names the discard for a published piece, and hides it when there is nothing to discard", () => {
    const { props, unmount } = openMenu({ discardLabel: "Discard changes" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Discard changes" }));
    expect(props.onDiscard).toHaveBeenCalled();
    unmount();

    openMenu({ canDiscard: false });
    expect(screen.queryByRole("menuitem", { name: /Discard/ })).not.toBeInTheDocument();
  });

  it("closes on Escape and hands focus back", () => {
    openMenu();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options" })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run "app/(write)/write/ComposerMenu.test.tsx"`
Expected: FAIL with "Failed to resolve import "./ComposerMenu"".

- [ ] **Step 3: Implement it**

Create `app/(write)/write/ComposerMenu.tsx`:

```tsx
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
 * composer passes no sources or history, and the Article editor passes
 * history only for a draft the account holds.
 */
export default function ComposerMenu({
  canSaveDraft,
  onSaveDraft,
  discardLabel,
  canDiscard,
  onDiscard,
  onOpenDrafts,
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
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand"
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
          className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-card-border bg-surface p-1 shadow-lg shadow-ink/10"
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run "app/(write)/write/ComposerMenu.test.tsx"`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(write)/write/ComposerMenu.tsx" "app/(write)/write/ComposerMenu.test.tsx"
git commit -m "Add the composer's ••• menu"
```

### Task 14: The phone toolbar

**Files:**
- Create: `app/(write)/write/ArticleMobileToolbar.tsx`
- Create: `app/(write)/write/ArticleMobileToolbar.test.tsx`

**Interfaces:**
- Consumes: `EditorHandle`, `TextAlignment` (Task 9); the icons and `ALIGNMENT_OPTIONS` (Task 9).
- Produces: `interface FormatState { bold: boolean; italic: boolean; heading: boolean; subheading: boolean; quote: boolean; bulletList: boolean; orderedList: boolean; link: boolean; align: TextAlignment }`, `NO_FORMATS: FormatState`, and the default export `ArticleMobileToolbar({ editorRef: RefObject<EditorHandle | null>; formats: FormatState; history: { canUndo: boolean; canRedo: boolean } })`. It is `md:hidden`.

- [ ] **Step 1: Write the failing tests**

Create `app/(write)/write/ArticleMobileToolbar.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run "app/(write)/write/ArticleMobileToolbar.test.tsx"`
Expected: FAIL with "Failed to resolve import "./ArticleMobileToolbar"".

- [ ] **Step 3: Implement it**

Create `app/(write)/write/ArticleMobileToolbar.tsx`:

```tsx
"use client";

import { useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import type { EditorHandle, TextAlignment } from "@/components/editor/Editor";
import {
  ALIGNMENT_OPTIONS,
  BOLD_ICON,
  BULLETS_ICON,
  DIVIDER_ICON,
  IMAGE_ICON,
  ITALIC_ICON,
  Icon,
  LINK_ICON,
  MORE_ICON,
  NUMBERS_ICON,
  PLUS_ICON,
  QUOTE_ICON,
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
      className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-semibold transition-colors disabled:opacity-35 ${
        pressed || expanded ? "bg-white/20 text-white" : "text-white/85 active:bg-white/10"
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

/**
 * The Article editor's toolbar on a phone. It sits on the keyboard and
 * scrolls sideways, because nine 44px buttons do not fit in 390px. Undo and
 * Redo come first: a phone has no Cmd+Z, and a paragraph lost to a stray
 * gesture is otherwise gone for good.
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
        <div role="group" aria-label="More formatting" className="flex gap-1 overflow-x-auto border-b border-white/15 px-2 py-1">
          <ToolButton label="Subheading" pressed={formats.subheading} onPress={() => editor()?.toggleH3()}>
            H3
          </ToolButton>
          <ToolButton label="Bulleted list" pressed={formats.bulletList} onPress={() => editor()?.toggleBulletList()}>
            <Icon path={BULLETS_ICON} />
          </ToolButton>
          <ToolButton label="Numbered list" pressed={formats.orderedList} onPress={() => editor()?.toggleOrderedList()}>
            <Icon path={NUMBERS_ICON} />
          </ToolButton>
          <span className="mx-1 my-2 w-px shrink-0 bg-white/25" aria-hidden="true" />
          {ALIGNMENT_OPTIONS.map((option) => (
            <ToolButton
              key={option.value}
              label={option.label}
              pressed={formats.align === option.value}
              onPress={() => editor()?.setTextAlign(option.value)}
            >
              <Icon path={option.icon} />
            </ToolButton>
          ))}
        </div>
      ) : null}

      {drawer === "insert" ? (
        <div role="group" aria-label="Insert" className="flex gap-1 border-b border-white/15 px-2 py-1">
          <ToolButton
            label="Image"
            onPress={() => {
              setDrawer(null);
              editor()?.triggerImageUpload();
            }}
          >
            <Icon path={IMAGE_ICON} />
          </ToolButton>
          <ToolButton
            label="Divider"
            onPress={() => {
              setDrawer(null);
              editor()?.insertDivider();
            }}
          >
            <Icon path={DIVIDER_ICON} />
          </ToolButton>
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
        <div role="toolbar" aria-label="Formatting" className="flex gap-1 overflow-x-auto px-2 py-1 [scrollbar-width:none]">
          <ToolButton label="Undo" disabled={!history.canUndo} onPress={() => editor()?.undo()}>
            <Icon path={UNDO_ICON} />
          </ToolButton>
          <ToolButton label="Redo" disabled={!history.canRedo} onPress={() => editor()?.redo()}>
            <Icon path={REDO_ICON} />
          </ToolButton>
          <ToolButton label="Bold" pressed={formats.bold} onPress={() => editor()?.toggleBold()}>
            <Icon path={BOLD_ICON} />
          </ToolButton>
          <ToolButton label="Italic" pressed={formats.italic} onPress={() => editor()?.toggleItalic()}>
            <Icon path={ITALIC_ICON} />
          </ToolButton>
          <ToolButton label="Link" pressed={formats.link} onPress={() => setDrawer("link")}>
            <Icon path={LINK_ICON} />
          </ToolButton>
          <ToolButton label="Heading" pressed={formats.heading} onPress={() => editor()?.toggleH2()}>
            H2
          </ToolButton>
          <ToolButton label="Quote" pressed={formats.quote} onPress={() => editor()?.toggleBlockquote()}>
            <Icon path={QUOTE_ICON} />
          </ToolButton>
          <ToolButton label="More formatting" expanded={drawer === "more"} onPress={() => toggle("more")}>
            <Icon path={MORE_ICON} />
          </ToolButton>
          <ToolButton label="Insert" expanded={drawer === "insert"} onPress={() => toggle("insert")}>
            <Icon path={PLUS_ICON} />
          </ToolButton>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run "app/(write)/write/ArticleMobileToolbar.test.tsx"`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(write)/write/ArticleMobileToolbar.tsx" "app/(write)/write/ArticleMobileToolbar.test.tsx"
git commit -m "Add the Article editor's phone toolbar"
```

### Task 15: Caption and alt text for the selected image

**Files:**
- Create: `app/(write)/write/ImageDetailsPanel.tsx`
- Create: `app/(write)/write/ImageDetailsPanel.test.tsx`

**Interfaces:**
- Consumes: `SelectedImage` (from `components/editor/Editor.tsx`).
- Produces: default export `ImageDetailsPanel({ image: SelectedImage; onChange: (attrs: { alt?: string; caption?: string }) => void })`.

- [ ] **Step 1: Write the failing tests**

Create `app/(write)/write/ImageDetailsPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImageDetailsPanel from "./ImageDetailsPanel";

const chart = { src: "https://example.com/chart.png", alt: "", caption: "" };

describe("ImageDetailsPanel", () => {
  it("edits the caption and alt text of the selected image", () => {
    const onChange = vi.fn();
    render(<ImageDetailsPanel image={chart} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Lagos, 2026" } });
    expect(onChange).toHaveBeenCalledWith({ caption: "Lagos, 2026" });

    fireEvent.change(screen.getByLabelText("Alt text"), { target: { value: "A bar chart" } });
    expect(onChange).toHaveBeenCalledWith({ alt: "A bar chart" });
  });

  it("says what alt text is for", () => {
    render(<ImageDetailsPanel image={chart} onChange={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Image details" })).toBeInTheDocument();
    expect(screen.getByText(/Read aloud by screen readers/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run "app/(write)/write/ImageDetailsPanel.test.tsx"`
Expected: FAIL with "Failed to resolve import "./ImageDetailsPanel"".

- [ ] **Step 3: Implement it**

Create `app/(write)/write/ImageDetailsPanel.tsx`. The labels, placeholders and help text are today's, from `UniversalComposer.tsx` lines 921-954:

```tsx
"use client";

import type { SelectedImage } from "@/components/editor/Editor";

interface ImageDetailsPanelProps {
  image: SelectedImage;
  onChange: (attrs: { alt?: string; caption?: string }) => void;
}

const FIELD =
  "min-h-11 w-full rounded-lg border border-card-border bg-surface px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-emerald-brand";

/**
 * An image carries a credit, a source, or the chart it came from, and none of
 * that survives in a bare picture. This appears while an image is selected: at
 * the foot of the writing column on a desktop, and just above the keyboard
 * toolbar on a phone.
 */
export default function ImageDetailsPanel({ image, onChange }: ImageDetailsPanelProps) {
  return (
    <section
      aria-label="Image details"
      className="fixed inset-x-3 bottom-[calc(var(--mobile-visual-viewport-bottom,0px)+4rem)] z-30 mx-auto max-w-[640px] space-y-3 rounded-xl border border-card-border bg-surface p-3 shadow-lg shadow-ink/10 md:bottom-6"
    >
      <p className="text-kicker font-semibold uppercase text-ink-muted">Selected image</p>
      <div>
        <label htmlFor="image-caption" className="mb-1.5 block text-sm font-semibold text-ink">
          Caption
        </label>
        <input
          id="image-caption"
          type="text"
          value={image.caption}
          onChange={(event) => onChange({ caption: event.target.value })}
          placeholder="What this shows, and who it is by"
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor="image-alt" className="mb-1.5 block text-sm font-semibold text-ink">
          Alt text
        </label>
        <input
          id="image-alt"
          type="text"
          value={image.alt}
          onChange={(event) => onChange({ alt: event.target.value })}
          placeholder="Describe the image"
          className={FIELD}
        />
        <p className="mt-1.5 text-meta text-ink-muted">
          Read aloud by screen readers, and shown when the image cannot load.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run "app/(write)/write/ImageDetailsPanel.test.tsx"`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(write)/write/ImageDetailsPanel.tsx" "app/(write)/write/ImageDetailsPanel.test.tsx"
git commit -m "Add the caption and alt text panel for a selected image"
```

### Task 16: The Article editor

**Files:**
- Create: `lib/testUtils/mockEditor.tsx`
- Create: `lib/testUtils/contributionDraft.ts`
- Create: `app/(write)/write/ArticleEditor.tsx`
- Create: `app/(write)/write/ArticleEditor.test.tsx`

**Interfaces:**
- Consumes: `ContributionDraft` (Tasks 6 and 7); `ComposerMenu` (Task 13); `ArticleMobileToolbar`, `FormatState`, `NO_FORMATS` (Task 14); `ImageDetailsPanel` (Task 15); `PublishSettingsDialog` (Task 12); `WriteSheet` (Task 10); `ArticlePreview` (Task 11); `useModalFocus` (Task 6); `EditorHandle`, `SelectedImage` (Task 9); `CoverImageUploader` (`initialUrl?`, `onUpload`, `onRemove`, `onUploadingChange?`, `variant?`, `emptyTitle?`); `ReferencesPanel` (`references`, `onChange`, `onInsertCitation?`); `RevisionHistory` (`postId`, `currentSnapshot`, `onRestore(revision: RestoredRevision)`).
- Produces:
  - From `lib/testUtils/mockEditor.tsx`: `editorMock` (`{ handle, history, selectedImage, mounts, props }`), `resetEditorMock()`, `MockEditor`, and `dynamicMock`, which is used as `vi.mock("next/dynamic", () => import("@/lib/testUtils/mockEditor").then((m) => m.dynamicMock))`.
  - From `lib/testUtils/contributionDraft.ts`: `emptySnapshot` and `fakeDraft(snapshot?: Partial<ContributionSnapshot>, overrides?: Partial<ContributionDraft>): ContributionDraft`.
  - From `app/(write)/write/ArticleEditor.tsx`: the default export `ArticleEditor` and `interface ArticleEditorProps { draft: ContributionDraft; mode: ComposerMode; authorName: string; avatarUrl: string | null; username: string | null; hasAppNav: boolean; autoFocusTitle: boolean; notice?: ReactNode; onBack: () => void; onDiscard: () => void; withCompleteProfile: (next: () => void) => void }`.

- [ ] **Step 1: Create the two test helpers**

Create `lib/testUtils/mockEditor.tsx`:

```tsx
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { vi } from "vitest";
import type { SelectedImage, TextAlignment } from "@/components/editor/Editor";

/**
 * Stands in for the Tiptap editor in component tests, which never render the
 * real one:
 *
 *   vi.mock("next/dynamic", () => import("@/lib/testUtils/mockEditor").then((m) => m.dynamicMock));
 *
 * The body is a textarea labelled like the real editor, so a test types into
 * it by label, and every handle method is a spy on `editorMock.handle`.
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
    insertLink: vi.fn(),
    insertCitation: vi.fn(),
    getSelectedImage: vi.fn(() => editorMock.selectedImage),
    updateSelectedImage: vi.fn(),
    setTextAlign: vi.fn(),
    getTextAlign: vi.fn((): TextAlignment => "left"),
    focus: vi.fn(),
  },
  history: { canUndo: false, canRedo: false },
  selectedImage: null as SelectedImage | null,
  /** Mounts, not renders: a remount is what costs a writer their caret and undo history. */
  mounts: 0,
  /** The props of the editor most recently rendered, to call its callbacks directly. */
  props: null as MockEditorProps | null,
};

export function resetEditorMock() {
  for (const fn of Object.values(editorMock.handle)) fn.mockClear();
  editorMock.history = { canUndo: false, canRedo: false };
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
      // The real editor reports a selection change alongside every update.
      onChange={(event) => {
        props.onUpdate(event.target.value);
        props.onSelectionUpdate?.();
      }}
    />
  );
});

export const dynamicMock = { default: () => MockEditor };
```

Create `lib/testUtils/contributionDraft.ts`:

```ts
import { vi } from "vitest";
import type { ContributionDraft } from "@/app/(write)/write/useContributionDraft";
import { contributionText, type ContributionSnapshot } from "@/lib/contribution";

export const emptySnapshot: ContributionSnapshot = {
  title: "",
  content: "",
  excerpt: "",
  tags: [],
  coverImageUrl: "",
  references: [],
};

/**
 * A stand-in for useContributionDraft, for testing one screen on its own.
 * Every action is a spy and `setSnapshot` changes nothing, so a test asserts
 * on calls. The real hook runs end to end in UniversalComposer.test.tsx.
 */
export function fakeDraft(
  snapshot: Partial<ContributionSnapshot> = {},
  overrides: Partial<ContributionDraft> = {}
): ContributionDraft {
  const current = { ...emptySnapshot, ...snapshot };
  const bodyText = contributionText(current.content);
  return {
    snapshot: current,
    setSnapshot: vi.fn(),
    saveState: "idle",
    saveError: null,
    saveLabel: "",
    recovery: null,
    restoreRecovery: vi.fn(() => null),
    dismissRecovery: vi.fn(),
    draftId: null,
    editDraftId: null,
    documentKey: "new",
    flush: vi.fn(async () => true),
    requestClose: vi.fn(async () => {}),
    navigateAway: vi.fn(),
    showLeave: false,
    closeLeave: vi.fn(),
    publish: vi.fn(async () => {}),
    publishing: false,
    publishError: null,
    discardDraft: vi.fn(async () => true),
    discarding: false,
    bodyText,
    wordCount: bodyText ? bodyText.split(/\s+/).length : 0,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing tests**

Create `app/(write)/write/ArticleEditor.test.tsx`:

```tsx
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionSnapshot } from "@/lib/contribution";
import type { PostReferenceRecord } from "@/lib/types";
import { emptySnapshot, fakeDraft } from "@/lib/testUtils/contributionDraft";
import { editorMock, resetEditorMock } from "@/lib/testUtils/mockEditor";
import type { ContributionDraft } from "./useContributionDraft";
import ArticleEditor, { type ArticleEditorProps } from "./ArticleEditor";

vi.mock("next/dynamic", () => import("@/lib/testUtils/mockEditor").then((m) => m.dynamicMock));
vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <div role="img" aria-label={props.alt} />,
}));
vi.mock("@/components/ui/CoverImageUploader", () => ({
  default: ({ emptyTitle }: { emptyTitle?: string }) => <button type="button">{emptyTitle}</button>,
}));
vi.mock("@/components/ui/TagInput", () => ({ default: () => <input aria-label="Topics" /> }));
vi.mock("@/components/ui/UserAvatar", () => ({ default: () => null }));
vi.mock("@/components/post/ReferencesPanel", () => ({ default: () => <div>Sources panel</div> }));
vi.mock("./RevisionHistory", () => ({ default: () => <div>History panel</div> }));

function renderEditor(
  snapshot: Partial<ContributionSnapshot> = {},
  props: Partial<ArticleEditorProps> = {},
  draftOverrides: Partial<ContributionDraft> = {}
) {
  const draft = fakeDraft(snapshot, draftOverrides);
  const all: ArticleEditorProps = {
    draft,
    mode: "new",
    authorName: "Ada",
    avatarUrl: null,
    username: "ada",
    hasAppNav: true,
    autoFocusTitle: false,
    onBack: vi.fn(),
    onDiscard: vi.fn(),
    withCompleteProfile: vi.fn((next: () => void) => next()),
    ...props,
  };
  const view = render(<ArticleEditor {...all} />);
  return { draft, props: all, ...view };
}

const titled = { title: "Power to the people", content: "<p>Solar microgrids are changing Jos.</p>" };

describe("ArticleEditor", () => {
  beforeEach(() => resetEditorMock());

  it("is a titled page with a cover and a body", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Add cover" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("placeholder", "Title");
    expect(screen.getByLabelText("Publication body")).toHaveAttribute("placeholder", "Tell your story.");
    expect(screen.getByLabelText("Publication body")).toHaveAttribute("data-variant", "article");
  });

  it("asks for a title once there is a body, and holds Continue until there is one", () => {
    renderEditor({ content: "<p>A body with no title yet.</p>" });

    const message = screen.getByText("Add a title to continue. An Article needs one, a Post never does.");
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-describedby", message.id);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("holds Continue until there is a body", () => {
    renderEditor({ title: "A title" });

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.queryByText(/Add a title to continue/)).not.toBeInTheDocument();
  });

  it("goes on to Publish settings, then publishes", () => {
    const { draft, props } = renderEditor(titled);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(props.withCompleteProfile).toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish settings" })).getByRole("button", { name: "Publish" }));

    expect(draft.publish).toHaveBeenCalled();
  });

  it("says Update Article when editing something published", () => {
    renderEditor(titled, { mode: "published-edit" }, { editDraftId: "edit-1" });

    expect(screen.getByRole("button", { name: "Update Article" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByRole("menuitem", { name: "Discard changes" })).toBeInTheDocument();
  });

  it("keeps sources and version history in the ••• menu", () => {
    const reference = { id: "ref-1", title: "A study" } as PostReferenceRecord;
    renderEditor({ ...titled, references: [reference] }, {}, { draftId: "draft-1" });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sources, 1 added" }));
    expect(within(screen.getByRole("dialog", { name: "Sources" })).getByText("Sources panel")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Version history" }));
    expect(within(screen.getByRole("dialog", { name: "Version history" })).getByText("History panel")).toBeInTheDocument();
  });

  it("offers no version history when editing something published", () => {
    renderEditor(titled, { mode: "published-edit" });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.queryByRole("menuitem", { name: "Version history" })).not.toBeInTheDocument();
  });

  it("saves a draft on request and leaves for the drafts list through the save", () => {
    const { draft } = renderEditor(titled);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Save draft" }));
    expect(draft.flush).toHaveBeenCalledWith({ force: true });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Drafts" }));
    expect(draft.requestClose).toHaveBeenCalledWith("/ada?tab=drafts");
  });

  it("shows the image details while an image is selected", () => {
    editorMock.selectedImage = { src: "https://example.com/chart.png", alt: "", caption: "" };
    renderEditor(titled);

    fireEvent.change(screen.getByLabelText("Publication body"), { target: { value: "<p>Body.</p>" } });
    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Lagos, 2026" } });

    expect(editorMock.handle.updateSelectedImage).toHaveBeenCalledWith({ caption: "Lagos, 2026" });
  });

  it("reports an image upload in the save status", async () => {
    renderEditor(titled);

    await act(async () => {
      editorMock.props?.onImageUploadingChange?.(true);
    });

    expect(screen.getByText("Adding image…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("previews the piece as it reads", () => {
    renderEditor(titled);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByRole("dialog", { name: "Reader preview" })).toBeInTheDocument();
  });

  it("aligns text through the editor", () => {
    renderEditor(titled);

    fireEvent.click(screen.getByRole("button", { name: "More formatting" }));
    fireEvent.click(screen.getByRole("button", { name: "Justify" }));

    expect(editorMock.handle.setTextAlign).toHaveBeenCalledWith("justify");
  });

  it("keeps a title to one line", () => {
    const { draft } = renderEditor();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Line one\nLine two" } });

    const update = (draft.setSnapshot as Mock).mock.calls[0][0] as (s: ContributionSnapshot) => ContributionSnapshot;
    expect(update(emptySnapshot).title).toBe("Line one Line two");
  });

  it("moves from the title to the body on Enter", () => {
    renderEditor();

    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "Enter" });

    expect(editorMock.handle.focus).toHaveBeenCalled();
  });

  it("goes Back through the root", () => {
    const { props } = renderEditor(titled);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(props.onBack).toHaveBeenCalled();
  });

  it("sits under the app navigation only where there is one", () => {
    const { unmount } = renderEditor(titled);
    expect(screen.getByRole("banner").className).toContain("md:top-[var(--app-nav-height)]");
    unmount();

    renderEditor(titled, { hasAppNav: false });
    expect(screen.getByRole("banner").className).not.toContain("md:top-");
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run "app/(write)/write/ArticleEditor.test.tsx"`
Expected: FAIL with "Failed to resolve import "./ArticleEditor"".

- [ ] **Step 4: Implement the Article editor**

Create `app/(write)/write/ArticleEditor.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import ReferencesPanel from "@/components/post/ReferencesPanel";
import type { EditorHandle, SelectedImage } from "@/components/editor/Editor";
import { BACK_ICON, CLOSE_ICON, Icon, PREVIEW_ICON } from "@/components/editor/editorIcons";
import { hasMeaningfulContribution, type ComposerMode } from "@/lib/contribution";
import ArticleMobileToolbar, { NO_FORMATS, type FormatState } from "./ArticleMobileToolbar";
import ArticlePreview from "./ArticlePreview";
import ComposerMenu from "./ComposerMenu";
import ImageDetailsPanel from "./ImageDetailsPanel";
import PublishSettingsDialog from "./PublishSettingsDialog";
import RevisionHistory, { type RestoredRevision } from "./RevisionHistory";
import type { ContributionDraft } from "./useContributionDraft";
import { useModalFocus } from "./useModalFocus";
import WriteSheet from "./WriteSheet";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[50vh] animate-pulse rounded-xl bg-canvas motion-reduce:animate-none" />
  ),
});

export interface ArticleEditorProps {
  draft: ContributionDraft;
  mode: ComposerMode;
  authorName: string;
  avatarUrl: string | null;
  username: string | null;
  /** /write sits under the app navigation from md up. /edit has none. */
  hasAppNav: boolean;
  autoFocusTitle: boolean;
  /** Shown above the cover: the device recovery notice. */
  notice?: ReactNode;
  onBack: () => void;
  onDiscard: () => void;
  withCompleteProfile: (next: () => void) => void;
}

type Sheet = "sources" | "history" | null;

function sameFormats(left: FormatState, right: FormatState) {
  return (Object.keys(left) as Array<keyof FormatState>).every((key) => left[key] === right[key]);
}

/**
 * The long-form screen: a cover, a required title and a rich body, set in the
 * live article page's type. Formatting is a selection toolbar and a "+" menu
 * on a desktop, and a toolbar on the keyboard on a phone. Continue opens
 * Publish settings.
 */
export default function ArticleEditor({
  draft,
  mode,
  authorName,
  avatarUrl,
  username,
  hasAppNav,
  autoFocusTitle,
  notice,
  onBack,
  onDiscard,
  withCompleteProfile,
}: ArticleEditorProps) {
  const { snapshot, setSnapshot } = draft;
  const editorRef = useRef<EditorHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [formats, setFormats] = useState<FormatState>(NO_FORMATS);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isEdit = mode === "published-edit";
  const hasTitle = Boolean(snapshot.title.trim());
  const hasBody = Boolean(draft.bodyText);
  const uploading = imageUploading || coverUploading;
  const canContinue = hasTitle && hasBody && !uploading;
  const missingTitle = hasBody && !hasTitle;
  const canSaveDraft = hasMeaningfulContribution(snapshot);
  const canDiscard = isEdit ? Boolean(draft.editDraftId) : Boolean(draft.draftId) || canSaveDraft;
  // An upload outranks the save state. It is the one the writer just started
  // by hand, and a pasted photo gives no other sign until it lands.
  const statusLabel = uploading ? "Adding image…" : draft.saveLabel;

  const closeSheet = useCallback(() => setSheet(null), []);
  const closePublish = useCallback(() => setShowPublish(false), []);
  const closePreview = useCallback(() => setShowPreview(false), []);
  useModalFocus(showPreview, previewRef, closePreview);

  // A one-line textarea with overflow hidden clips its second line, and a
  // title long enough to wrap is exactly the kind someone wants to read back.
  useEffect(() => {
    const field = titleRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [snapshot.title]);

  // This runs on every keystroke, so each piece of derived state is compared
  // before it is set, and a typing session does not re-render the toolbars.
  const handleSelectionUpdate = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next: FormatState = {
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      heading: editor.isActive("heading", { level: 2 }),
      subheading: editor.isActive("heading", { level: 3 }),
      quote: editor.isActive("blockquote"),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      link: editor.isActive("link"),
      align: editor.getTextAlign(),
    };
    setFormats((current) => (sameFormats(current, next) ? current : next));

    const canUndo = editor.canUndo();
    const canRedo = editor.canRedo();
    setHistory((current) =>
      current.canUndo === canUndo && current.canRedo === canRedo ? current : { canUndo, canRedo }
    );

    const image = editor.getSelectedImage();
    setSelectedImage((current) => {
      if (!image) return current === null ? current : null;
      if (
        current &&
        current.src === image.src &&
        current.alt === image.alt &&
        current.caption === image.caption
      ) {
        return current;
      }
      return image;
    });
  }, []);

  const updateImage = useCallback((attrs: { alt?: string; caption?: string }) => {
    editorRef.current?.updateSelectedImage(attrs);
    setSelectedImage((current) => (current ? { ...current, ...attrs } : current));
  }, []);

  const restoreRevision = useCallback(
    (revision: RestoredRevision) => {
      setSnapshot((current) => ({
        ...current,
        title: revision.title,
        excerpt: revision.excerpt,
        content: revision.content,
      }));
      setSheet(null);
    },
    [setSnapshot]
  );

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <header
        className={`sticky z-30 border-b border-divider bg-surface/95 backdrop-blur ${
          hasAppNav ? "top-0 md:top-[var(--app-nav-height)]" : "top-0"
        }`}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 px-2 py-2 sm:px-4">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand"
          >
            <Icon path={BACK_ICON} />
          </button>
          {/* One status region at every size: its own row on a phone, beside
              the actions from md up. */}
          <p
            aria-live="polite"
            className={`order-last flex min-h-4 w-full min-w-0 items-center gap-2 truncate pl-3 text-xs md:order-none md:w-auto md:flex-1 md:pl-0 ${
              draft.saveState === "error" ? "text-red-600" : "text-ink-muted"
            }`}
          >
            {statusLabel ? (
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${draft.saveState === "error" ? "bg-red-600" : "bg-gold"}`}
              />
            ) : null}
            {statusLabel}
          </p>
          <span className="flex-1 md:hidden" aria-hidden="true" />
          <ComposerMenu
            sourcesCount={snapshot.references.length}
            onOpenSources={() => setSheet("sources")}
            onOpenHistory={!isEdit && draft.draftId ? () => setSheet("history") : undefined}
            onOpenDrafts={username ? () => void draft.requestClose(`/${username}?tab=drafts`) : undefined}
            canSaveDraft={canSaveDraft}
            onSaveDraft={() => void draft.flush({ force: true })}
            discardLabel={isEdit ? "Discard changes" : "Discard"}
            canDiscard={canDiscard}
            onDiscard={onDiscard}
          />
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            disabled={!hasBody}
            aria-label="Preview"
            className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-3 text-sm font-semibold text-ink transition-colors hover:bg-canvas disabled:opacity-40"
          >
            <Icon path={PREVIEW_ICON} className="h-5 w-5 sm:hidden" />
            <span className="hidden sm:inline">Preview</span>
          </button>
          <Button
            type="button"
            onClick={() => withCompleteProfile(() => setShowPublish(true))}
            disabled={!canContinue}
            className="min-h-11 shrink-0 rounded-full px-5"
          >
            {isEdit ? "Update Article" : "Continue"}
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[680px] px-5 pb-40 pt-6 sm:px-8 md:pb-24 md:pt-12">
        {notice}
        <div className="mb-6">
          {/* Keyed on the address so a cover restored from a device copy
              shows, rather than the one this uploader first mounted with. */}
          <CoverImageUploader
            key={snapshot.coverImageUrl}
            initialUrl={snapshot.coverImageUrl || undefined}
            onUpload={(coverImageUrl) => setSnapshot((current) => ({ ...current, coverImageUrl }))}
            onRemove={() => setSnapshot((current) => ({ ...current, coverImageUrl: "" }))}
            onUploadingChange={setCoverUploading}
            variant="compact"
            emptyTitle="Add cover"
          />
        </div>
        <textarea
          ref={titleRef}
          autoFocus={autoFocusTitle}
          rows={1}
          value={snapshot.title}
          // A title is one line. A pasted one arrives with its line breaks,
          // and Enter moves on to the body.
          onChange={(event) => {
            const title = event.target.value.replace(/\s*\n+\s*/g, " ");
            setSnapshot((current) => ({ ...current, title }));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              editorRef.current?.focus();
            }
          }}
          placeholder="Title"
          aria-label="Title"
          aria-describedby={missingTitle ? "article-title-required" : undefined}
          className="publication-article-title block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[36px] font-semibold leading-[1.16] tracking-[-0.01em] text-ink outline-none placeholder:text-ink-muted/40 sm:text-[44px]"
        />
        {missingTitle ? (
          <p id="article-title-required" className="mt-2 text-sm text-gold-ink">
            Add a title to continue. An Article needs one, a Post never does.
          </p>
        ) : null}
        <div className="mt-8">
          <Editor
            ref={editorRef}
            variant="article"
            content={snapshot.content}
            placeholder="Tell your story."
            ariaLabel="Publication body"
            onUpdate={(content) =>
              setSnapshot((current) => (current.content === content ? current : { ...current, content }))
            }
            onSelectionUpdate={handleSelectionUpdate}
            onImageUploadingChange={setImageUploading}
          />
        </div>
      </main>

      <ArticleMobileToolbar editorRef={editorRef} formats={formats} history={history} />
      {selectedImage ? <ImageDetailsPanel image={selectedImage} onChange={updateImage} /> : null}

      <WriteSheet open={sheet === "sources"} title="Sources" onClose={closeSheet}>
        <p className="mb-3 text-meta text-ink-muted">
          Add a source, then place a citation in the body where it belongs.
        </p>
        <ReferencesPanel
          references={snapshot.references}
          onChange={(references) => setSnapshot((current) => ({ ...current, references }))}
          onInsertCitation={(id) => editorRef.current?.insertCitation(id)}
        />
      </WriteSheet>

      <WriteSheet open={sheet === "history"} title="Version history" onClose={closeSheet}>
        {draft.draftId ? (
          <RevisionHistory
            postId={draft.draftId}
            currentSnapshot={{ title: snapshot.title, excerpt: snapshot.excerpt, content: snapshot.content }}
            onRestore={restoreRevision}
          />
        ) : null}
      </WriteSheet>

      <PublishSettingsDialog
        open={showPublish}
        onClose={closePublish}
        tags={snapshot.tags}
        onTagsChange={(tags) => setSnapshot((current) => ({ ...current, tags }))}
        wordCount={draft.wordCount}
        error={draft.publishError}
        publishing={draft.publishing}
        isUpdate={isEdit}
        canPublish={canContinue}
        onPublish={() => void draft.publish()}
      />

      {/* Reading the piece back at full size, in the type it will be set in. */}
      {showPreview ? (
        <div
          ref={previewRef}
          role="dialog"
          aria-modal="true"
          aria-label="Reader preview"
          className="fixed inset-0 z-[75] overflow-y-auto overscroll-contain bg-surface"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-divider bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
            <p className="text-kicker font-semibold uppercase text-ink-muted">How this reads</p>
            <button
              type="button"
              onClick={closePreview}
              aria-label="Close preview"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              <Icon path={CLOSE_ICON} />
            </button>
          </div>
          <ArticlePreview snapshot={snapshot} authorName={authorName} avatarUrl={avatarUrl} wordCount={draft.wordCount} />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run "app/(write)/write/ArticleEditor.test.tsx"`
Expected: PASS, 16 tests.

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/\(write\)|lib/testUtils"`
Expected: no lines printed.

Run: `npx eslint "app/(write)/write" lib/testUtils`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/testUtils/mockEditor.tsx lib/testUtils/contributionDraft.ts "app/(write)/write/ArticleEditor.tsx" "app/(write)/write/ArticleEditor.test.tsx"
git commit -m "Build the Article editor"
```

---

## Phase 5: The Post composer and the switch-over

### Task 17: The Post composer

**Files:**
- Create: `app/(write)/write/PostComposer.tsx`
- Create: `app/(write)/write/PostComposer.test.tsx`

**Interfaces:**
- Consumes: `ContributionDraft` (Tasks 6 and 7); `ComposerMenu` (Task 13); `uploadImage` (Task 8); `Icon`, `ARTICLE_ICON`, `CLOSE_ICON`, `IMAGE_ICON` (Task 9); `fakeDraft`, `emptySnapshot`, `editorMock`, `resetEditorMock`, `dynamicMock` (Task 16); `UserAvatar` (`name`, `src?`, `size?`).
- Produces: the default export `PostComposer` and `interface PostComposerProps { draft: ContributionDraft; mode: ComposerMode; authorName: string; avatarUrl: string | null; username: string | null; notice?: ReactNode; onCancel: () => void; onDiscard: () => void; onSwitchToArticle: () => void; withCompleteProfile: (next: () => void) => void }`.

- [ ] **Step 1: Write the failing tests**

Create `app/(write)/write/PostComposer.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionSnapshot } from "@/lib/contribution";
import { emptySnapshot, fakeDraft } from "@/lib/testUtils/contributionDraft";
import { editorMock, resetEditorMock } from "@/lib/testUtils/mockEditor";
import type { ContributionDraft } from "./useContributionDraft";
import PostComposer, { type PostComposerProps } from "./PostComposer";

const mocks = vi.hoisted(() => ({ upload: vi.fn() }));

vi.mock("next/dynamic", () => import("@/lib/testUtils/mockEditor").then((m) => m.dynamicMock));
vi.mock("@/lib/uploadImage", () => ({ uploadImage: (file: File) => mocks.upload(file) }));
vi.mock("@/components/ui/UserAvatar", () => ({
  default: ({ name }: { name: string }) => <span>{`Avatar of ${name}`}</span>,
}));

const photo = new File(["png"], "photo.png", { type: "image/png" });
const text = { content: "<p>A thought worth sharing today.</p>" };

function renderComposer(
  snapshot: Partial<ContributionSnapshot> = {},
  props: Partial<PostComposerProps> = {},
  draftOverrides: Partial<ContributionDraft> = {}
) {
  const draft = fakeDraft(snapshot, draftOverrides);
  const all: PostComposerProps = {
    draft,
    mode: "new",
    authorName: "Ada",
    avatarUrl: null,
    username: "ada",
    onCancel: vi.fn(),
    onDiscard: vi.fn(),
    onSwitchToArticle: vi.fn(),
    withCompleteProfile: vi.fn((next: () => void) => next()),
    ...props,
  };
  const view = render(<PostComposer {...all} />);
  return { draft, props: all, ...view };
}

function lastUpdate(draft: ContributionDraft) {
  const calls = (draft.setSnapshot as Mock).mock.calls;
  return calls[calls.length - 1][0] as (current: ContributionSnapshot) => ContributionSnapshot;
}

describe("PostComposer", () => {
  beforeEach(() => {
    resetEditorMock();
    mocks.upload.mockReset().mockResolvedValue({ ok: true, url: "https://cdn.example/photo.png" });
  });

  it("is a Post card with a byline and no title field", () => {
    renderComposer();

    expect(screen.getByRole("heading", { name: "New post" })).toBeInTheDocument();
    expect(screen.getByText("Avatar of Ada")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    const body = screen.getByLabelText("Publication body");
    expect(body).toHaveAttribute("placeholder", "Share an idea, a link, a moment.");
    expect(body).toHaveAttribute("data-variant", "post");
  });

  it("holds the Post button until there is text", () => {
    renderComposer();

    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  });

  it("publishes straight from the Post button, with no settings step", () => {
    const { draft, props } = renderComposer(text);

    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(props.withCompleteProfile).toHaveBeenCalled();
    expect(draft.publish).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("posts on Cmd+Enter", () => {
    const { draft } = renderComposer(text);

    fireEvent.keyDown(screen.getByLabelText("Publication body"), { key: "Enter", metaKey: true });

    expect(draft.publish).toHaveBeenCalled();
  });

  it("says Edit post and Update for a published Post", () => {
    renderComposer(text, { mode: "published-edit" });

    expect(screen.getByRole("heading", { name: "Edit post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
  });

  it("attaches a chosen image as the Post's image", async () => {
    const { draft, container } = renderComposer(text);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    await act(async () => {
      fireEvent.change(input, { target: { files: [photo] } });
    });

    expect(mocks.upload).toHaveBeenCalledWith(photo);
    expect(lastUpdate(draft)(emptySnapshot).coverImageUrl).toBe("https://cdn.example/photo.png");
  });

  it("attaches a pasted image instead of placing it in the text", async () => {
    renderComposer(text);

    await act(async () => {
      editorMock.props?.onImageFile?.(photo);
    });

    expect(mocks.upload).toHaveBeenCalledWith(photo);
  });

  it("shows the image at its own shape, and removes it", () => {
    const { draft } = renderComposer({ ...text, coverImageUrl: "https://cdn.example/photo.png" });

    expect(document.querySelector('img[src="https://cdn.example/photo.png"]')).toHaveClass("object-contain");
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));

    expect(lastUpdate(draft)({ ...emptySnapshot, coverImageUrl: "x" }).coverImageUrl).toBe("");
  });

  it("says what went wrong when an image will not upload", async () => {
    mocks.upload.mockResolvedValue({ ok: false, error: "That file is not an image." });
    const { container } = renderComposer(text);

    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [photo] } });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("That file is not an image.");
  });

  it("holds the Post button while an image uploads", async () => {
    let finish: (value: { ok: true; url: string }) => void = () => {};
    mocks.upload.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { container } = renderComposer(text);

    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [photo] } });
    });
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    expect(screen.getByText("Adding image…")).toBeInTheDocument();

    await act(async () => finish({ ok: true, url: "https://cdn.example/photo.png" }));
    expect(screen.getByRole("button", { name: "Post" })).toBeEnabled();
  });

  it("saves a draft and discards through the menu", () => {
    const { draft, props } = renderComposer(text);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.queryByRole("menuitem", { name: /Sources/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Save draft" }));
    expect(draft.flush).toHaveBeenCalledWith({ force: true });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Discard" }));
    expect(props.onDiscard).toHaveBeenCalled();
  });

  it("switches to the Article editor from the Article card", () => {
    const { props } = renderComposer(text);

    fireEvent.click(screen.getByRole("button", { name: /^Article/ }));

    expect(props.onSwitchToArticle).toHaveBeenCalled();
  });

  it("shrinks the Article card on a phone once there is writing", () => {
    const { unmount } = renderComposer();
    expect(screen.getByText("Write something in depth")).not.toHaveClass("hidden");
    unmount();

    renderComposer(text);
    expect(screen.getByText("Write something in depth")).toHaveClass("hidden", "md:inline");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run "app/(write)/write/PostComposer.test.tsx"`
Expected: FAIL with "Failed to resolve import "./PostComposer"".

- [ ] **Step 3: Implement the Post composer**

Create `app/(write)/write/PostComposer.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import UserAvatar from "@/components/ui/UserAvatar";
import { ARTICLE_ICON, CLOSE_ICON, IMAGE_ICON, Icon } from "@/components/editor/editorIcons";
import { hasMeaningfulContribution, type ComposerMode } from "@/lib/contribution";
import { uploadImage } from "@/lib/uploadImage";
import ComposerMenu from "./ComposerMenu";
import type { ContributionDraft } from "./useContributionDraft";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => <div className="min-h-36 animate-pulse rounded-xl bg-canvas motion-reduce:animate-none" />,
});

const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";

export interface PostComposerProps {
  draft: ContributionDraft;
  mode: ComposerMode;
  authorName: string;
  avatarUrl: string | null;
  username: string | null;
  /** Shown above the byline: the device recovery notice. */
  notice?: ReactNode;
  onCancel: () => void;
  onDiscard: () => void;
  onSwitchToArticle: () => void;
  withCompleteProfile: (next: () => void) => void;
}

/**
 * The quick path: no title, one optional image, and a Post button that
 * publishes straight away. Topics and the reader preview belong to Articles.
 * The root never shows this screen over a title, so a Post never carries one.
 */
export default function PostComposer({
  draft,
  mode,
  authorName,
  avatarUrl,
  username,
  notice,
  onCancel,
  onDiscard,
  onSwitchToArticle,
  withCompleteProfile,
}: PostComposerProps) {
  const { snapshot, setSnapshot } = draft;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const isEdit = mode === "published-edit";
  const hasText = Boolean(draft.bodyText);
  const canPost = hasText && !imageUploading && !draft.publishing;
  const canSaveDraft = hasMeaningfulContribution(snapshot);
  const canDiscard = isEdit ? Boolean(draft.editDraftId) : Boolean(draft.draftId) || canSaveDraft;
  const statusLabel = imageUploading ? "Adding image…" : draft.saveLabel;

  // A Post's one image is its cover_image_url, which the feed card and the
  // Post page already show. Switching to the Article editor makes it the cover.
  const attachImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setImageError("Choose a JPG, PNG, WebP or GIF image.");
        return;
      }
      setImageError(null);
      setImageUploading(true);
      const result = await uploadImage(file);
      setImageUploading(false);
      if (!result.ok) {
        setImageError(result.error);
        return;
      }
      const url = result.url;
      setSnapshot((current) => ({ ...current, coverImageUrl: url }));
    },
    [setSnapshot]
  );

  const postNow = () => {
    if (canPost) withCompleteProfile(() => void draft.publish());
  };

  // Cmd/Ctrl+Enter is the muscle memory for "send this".
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      postNow();
    }
  };

  return (
    <div className="min-h-dvh bg-surface md:bg-canvas md:px-4 md:pb-16 md:pt-14">
      <section
        aria-labelledby="post-composer-title"
        onKeyDown={onKeyDown}
        className="flex min-h-dvh flex-col bg-surface text-ink md:mx-auto md:min-h-0 md:max-w-[560px] md:rounded-2xl md:border md:border-card-border md:shadow-sm"
      >
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-1 border-b border-divider bg-surface px-2 py-1.5 md:static md:rounded-t-2xl md:px-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg px-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            Cancel
          </button>
          <h1 id="post-composer-title" className="min-w-0 flex-1 text-center text-sm font-semibold text-ink md:text-left">
            {isEdit ? "Edit post" : "New post"}
          </h1>
          {/* One status region at every size: a line under the header on a
              phone, beside the menu from md up. */}
          <p
            aria-live="polite"
            className={`order-last min-h-4 w-full truncate pb-1 text-center text-xs md:order-none md:w-auto md:max-w-[9rem] md:pb-0 md:text-right ${
              draft.saveState === "error" ? "text-red-600" : "text-ink-muted"
            }`}
          >
            {statusLabel}
          </p>
          <ComposerMenu
            onOpenDrafts={username ? () => void draft.requestClose(`/${username}?tab=drafts`) : undefined}
            canSaveDraft={canSaveDraft}
            onSaveDraft={() => void draft.flush({ force: true })}
            discardLabel={isEdit ? "Discard changes" : "Discard"}
            canDiscard={canDiscard}
            onDiscard={onDiscard}
          />
          <Button
            type="button"
            onClick={postNow}
            disabled={!canPost}
            loading={draft.publishing}
            className="min-h-11 rounded-full px-5"
          >
            {isEdit ? "Update" : "Post"}
          </Button>
        </header>

        <div className="flex-1 px-4 pb-28 pt-4 md:px-5 md:pb-4">
          {notice}
          <div className="flex items-center gap-3">
            <UserAvatar name={authorName} src={avatarUrl} size={40} />
            <p className="text-sm font-semibold text-ink">{authorName}</p>
          </div>
          <div className="mt-3">
            <Editor
              variant="post"
              content={snapshot.content}
              placeholder="Share an idea, a link, a moment."
              ariaLabel="Publication body"
              autoFocus={!isEdit}
              onUpdate={(content) =>
                setSnapshot((current) => (current.content === content ? current : { ...current, content }))
              }
              onImageFile={(file) => void attachImage(file)}
            />
          </div>
          {snapshot.coverImageUrl ? (
            <figure className="relative mt-4 overflow-hidden rounded-xl border border-card-border bg-canvas">
              {/* At its natural shape, not cropped: a Post's image is often a
                  screenshot or a chart, and cropping loses the point of it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={snapshot.coverImageUrl} alt="" className="mx-auto max-h-[420px] w-full object-contain" />
              <button
                type="button"
                onClick={() => setSnapshot((current) => ({ ...current, coverImageUrl: "" }))}
                aria-label="Remove image"
                className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-ink/70 text-white transition-colors hover:bg-ink"
              >
                <Icon path={CLOSE_ICON} />
              </button>
            </figure>
          ) : null}
          {imageError ? (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {imageError}
            </p>
          ) : null}
          {draft.publishError ? (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {draft.publishError}
            </p>
          ) : null}
        </div>

        <footer
          className="fixed inset-x-0 z-20 flex items-center gap-2 border-t border-divider bg-surface px-3 py-1.5 md:static md:rounded-b-2xl md:px-4 md:py-3"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + var(--mobile-visual-viewport-bottom, 0px))" }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={imageUploading}
            aria-label={snapshot.coverImageUrl ? "Replace image" : "Add image"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-emerald-brand transition-colors hover:bg-green-tint disabled:opacity-40"
          >
            <Icon path={IMAGE_ICON} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_TYPES}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void attachImage(file);
            }}
          />
          <button
            type="button"
            onClick={onSwitchToArticle}
            className="ml-auto flex min-h-11 items-center gap-2 rounded-xl border border-card-border px-3 text-left transition-colors hover:border-emerald-brand hover:bg-green-tint"
          >
            <Icon path={ARTICLE_ICON} className="h-5 w-5 shrink-0 text-emerald-brand" />
            <span className="text-sm font-semibold text-ink">Article</span>
            {/* On a phone, once there is writing, the card gives the room back to it. */}
            <span className={`text-xs text-ink-muted ${hasText ? "hidden md:inline" : ""}`}>
              Write something in depth
            </span>
          </button>
        </footer>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run "app/(write)/write/PostComposer.test.tsx"`
Expected: PASS, 13 tests.

- [ ] **Step 5: Type-check the unconnected screens**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/\(write\)|lib/testUtils"`
Expected: no lines printed.

- [ ] **Step 6: Commit**

```bash
git add "app/(write)/write/PostComposer.tsx" "app/(write)/write/PostComposer.test.tsx"
git commit -m "Build the Post composer"
```

### Task 18: Switch `/write` and `/edit` to the two screens

**Files:**
- Rewrite: `app/(write)/write/UniversalComposer.tsx`
- Rewrite: `app/(write)/write/UniversalComposer.test.tsx`
- Modify: `app/(write)/write/page.tsx`
- Create: `app/(write)/write/page.test.tsx`
- Modify: `app/(main)/edit/[slug]/page.tsx` (the profile `select`)

**Interfaces:**
- Consumes: `useContributionDraft` (Tasks 6 and 7), `useModalFocus` (Tasks 6 and 10), `PostComposer` (Task 17), `ArticleEditor` (Task 16), `composerSurfaceFor` and `parseContentKind` (Task 5).
- Produces: `UniversalComposer` keeps its props and adds `initialSurface?: ContentKind | null`. The profile prop gains an optional `avatar_url`.

- [ ] **Step 1: Replace the composer tests**

Replace the whole of `app/(write)/write/UniversalComposer.test.tsx` with the file below. It keeps the 13 autosave, recovery and draft-hygiene tests. Two of them change how they open or leave: "saves immediately once a title exists" opens the Article editor, and "leaves without a save warning" presses Cancel. It also keeps two of the ten "canvas polish" tests, the drafts one and the save label one. The other eight of those moved to the component test files in Tasks 11 to 17, and the 10 retired tests are gone.

```tsx
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionSnapshot } from "@/lib/contribution";
import { editorMock, resetEditorMock } from "@/lib/testUtils/mockEditor";
import UniversalComposer from "./UniversalComposer";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  ensure: vi.fn(),
  publish: vi.fn(),
  deleteDrafts: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));
vi.mock("next/dynamic", () => import("@/lib/testUtils/mockEditor").then((m) => m.dynamicMock));
vi.mock("./actions", () => ({
  ensureContributionDraft: (input: unknown) => mocks.ensure(input),
  publishContribution: (input: unknown) => mocks.publish(input),
}));
vi.mock("./editActions", () => ({
  savePublishedEditDraft: vi.fn(),
  applyPublishedEditDraft: vi.fn(),
  discardPublishedEditDraft: vi.fn(),
}));
vi.mock("./deleteActions", () => ({
  deleteOwnDraftPosts: (input: unknown) => mocks.deleteDrafts(input),
}));
vi.mock("@/lib/uploadImage", () => ({ uploadImage: (file: File) => mocks.upload(file) }));
vi.mock("@/components/ui/CoverImageUploader", () => ({
  default: ({ emptyTitle, initialUrl }: { emptyTitle?: string; initialUrl?: string }) => (
    <button type="button">{initialUrl ? `Cover ${initialUrl}` : emptyTitle}</button>
  ),
}));
vi.mock("@/components/ui/TagInput", () => ({ default: () => <input aria-label="Topics" /> }));
vi.mock("@/components/ui/UserAvatar", () => ({ default: () => null }));
vi.mock("@/components/post/ReferencesPanel", () => ({ default: () => <div>Sources panel</div> }));
vi.mock("./RevisionHistory", () => ({ default: () => <div>History panel</div> }));
vi.mock("@/components/ui/ProfileGate", () => ({
  default: ({
    onComplete,
  }: {
    onComplete: (profile: { full_name: string; username: string; university: null }) => void;
  }) => (
    <button type="button" onClick={() => onComplete({ full_name: "Ada", username: "ada", university: null })}>
      Finish profile
    </button>
  ),
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <div role="img" aria-label={props.alt} />,
}));

const empty: ContributionSnapshot = {
  title: "", content: "", excerpt: "", tags: [], coverImageUrl: "", references: [],
};
const profile = { full_name: "Ada", username: "ada", university: null, avatar_url: null };

function open(snapshot: ContributionSnapshot = empty, props: Record<string, unknown> = {}) {
  return render(
    <UniversalComposer mode="new" userId="user-1" profile={profile} initialSnapshot={snapshot} returnTo="/" {...props} />
  );
}

async function type(value: string) {
  fireEvent.change(screen.getByLabelText("Publication body"), { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.ensure.mockResolvedValue({ error: null, draftId: "draft-1" });
  mocks.publish.mockResolvedValue({ error: null, slug: "hello" });
  mocks.deleteDrafts.mockResolvedValue({ ok: true, data: { deleted: ["draft-1"], refusedCount: 0 } });
  resetEditorMock();
  localStorage.clear();
  window.history.replaceState(null, "", "/write");
});

afterEach(() => vi.useRealTimers());

describe("choosing the screen", () => {
  it("opens an untitled new piece in the Post composer", () => {
    open();

    expect(screen.getByRole("heading", { name: "New post" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Share an idea, a link, a moment.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("opens the Article editor when asked", () => {
    open(empty, { initialSurface: "article" });

    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Tell your story.")).toBeInTheDocument();
  });

  it("opens a titled draft in the Article editor, even when asked for a Post", () => {
    open({ ...empty, title: "A title", content: "<p>Body.</p>" }, { mode: "draft", draftId: "draft-1", initialSurface: "post" });

    expect(screen.getByLabelText("Title")).toHaveValue("A title");
  });

  it("switches to the Article editor with the writing, and keeps it in the address", async () => {
    open();
    await type("<p>A thought that grew into something longer.</p>");

    fireEvent.click(screen.getByRole("button", { name: /^Article/ }));

    expect(screen.getByLabelText("Title")).toHaveFocus();
    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>A thought that grew into something longer.</p>");
    expect(window.location.search).toContain("draft=draft-1");
    expect(window.location.search).toContain("editor=article");
  });

  it("goes back to the Post composer while the Article is still untitled", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Article/ }));

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("heading", { name: "New post" })).toBeInTheDocument();
    expect(window.location.search).not.toContain("editor");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("leaves from Back once the Article has a title", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Article/ }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A title" } });

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("never shows the Post composer over a title", () => {
    localStorage.setItem(
      "indegenius:post-draft:user-1",
      JSON.stringify({ data: { title: "Recovered title", content: "<p>Recovered writing from this device.</p>" } })
    );
    open();
    expect(screen.getByRole("heading", { name: "New post" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(screen.getByLabelText("Title")).toHaveValue("Recovered title");
    expect(window.location.search).toContain("editor=article");
  });

  it("carries a Post's image to the Article's cover and back", () => {
    open({ ...empty, content: "<p>A photo worth a post.</p>", coverImageUrl: "https://cdn.example/photo.png" });
    expect(screen.getByRole("button", { name: "Remove image" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Article/ }));
    expect(screen.getByText("Cover https://cdn.example/photo.png")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Remove image" })).toBeInTheDocument();
  });

  it("edits a published Post in the Post composer, full screen", () => {
    const { container } = open(
      { ...empty, content: "<p>Already out there.</p>" },
      { mode: "published-edit", publishedPostId: "post-1", publishedSlug: "hello", returnTo: "/post/hello" }
    );

    expect(screen.getByRole("heading", { name: "Edit post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("fixed", "inset-0");
  });
});

describe("publishing", () => {
  it("publishes a Post straight from its button", async () => {
    open();
    await type("<p>A thought worth sharing today.</p>");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Post" })); });

    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot: expect.objectContaining({ title: "" }) })
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledWith("/post/hello?justPublished=1");
  });

  it("takes an Article through Publish settings", async () => {
    open(empty, { initialSurface: "article" });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Power to the people" } });
    await type("<p>Solar microgrids are changing Jos.</p>");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const dialog = screen.getByRole("dialog", { name: "Publish settings" });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Publish" })); });

    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot: expect.objectContaining({ title: "Power to the people" }) })
    );
  });

  it("asks for a name first, then carries on publishing", async () => {
    open(empty, { profile: { full_name: null, username: null, university: null, avatar_url: null } });
    await type("<p>A thought worth sharing today.</p>");

    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(mocks.publish).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Finish profile" })); });
    expect(mocks.publish).toHaveBeenCalled();
  });
});

describe("discarding", () => {
  it("confirms, then deletes a saved draft", async () => {
    open({ ...empty, content: "<p>A draft that is no longer wanted.</p>" }, { mode: "draft", draftId: "draft-1" });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Discard" }));
    const dialog = screen.getByRole("alertdialog", { name: "Discard this draft?" });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Discard" })); });

    expect(mocks.deleteDrafts).toHaveBeenCalledWith({ postIds: ["draft-1"] });
    expect(mocks.push).toHaveBeenCalledWith("/");
  });
});

describe("autosave and recovery", () => {
  it("keeps the writer's caret when the first autosave claims a draft id", async () => {
    open();
    expect(editorMock.mounts).toBe(1);

    fireEvent.change(screen.getByLabelText("Publication body"), {
      target: { value: "<p>Mid sentence and still typin" },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    expect(mocks.ensure).toHaveBeenCalled();
    // The address updates so a refresh finds the draft, but shallowly: a server
    // re-render here would remount the editor under the cursor.
    expect(window.location.search).toContain("draft=draft-1");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(editorMock.mounts).toBe(1);
  });

  it("does not remount when the page re-renders with the draft it just saved", async () => {
    const { rerender } = open(empty, { draftId: null });
    fireEvent.change(screen.getByLabelText("Publication body"), { target: { value: "<p>Still going and still writing here.</p>" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    rerender(
      <UniversalComposer mode="draft" userId="user-1" profile={profile} initialSnapshot={empty} draftId="draft-1" returnTo="/" />
    );

    expect(editorMock.mounts).toBe(1);
    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>Still going and still writing here.</p>");
  });

  it("rebuilds the canvas around a genuinely different draft", () => {
    const first: ContributionSnapshot = { ...empty, content: "<p>The first draft.</p>" };
    const second: ContributionSnapshot = { ...empty, title: "The second", content: "<p>The second draft.</p>" };
    const { rerender } = open(first, { mode: "draft", draftId: "draft-1" });
    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>The first draft.</p>");

    rerender(
      <UniversalComposer mode="draft" userId="user-1" profile={profile} initialSnapshot={second} draftId="draft-2" returnTo="/" />
    );

    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>The second draft.</p>");
    expect(screen.getByDisplayValue("The second")).toBeInTheDocument();
    expect(editorMock.mounts).toBe(2);
  });

  it("continues autosaving the resumed draft, not the one left behind", async () => {
    const first: ContributionSnapshot = { ...empty, content: "<p>The first draft.</p>" };
    const second: ContributionSnapshot = { ...empty, content: "<p>The second draft.</p>" };
    const { rerender } = open(first, { mode: "draft", draftId: "draft-1" });
    rerender(
      <UniversalComposer mode="draft" userId="user-1" profile={profile} initialSnapshot={second} draftId="draft-2" returnTo="/" />
    );

    await type("<p>An addition worth saving to the draft.</p>");

    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({ draftId: "draft-2" }));
  });

  it("clears the key a recovered copy came from, so discarding sticks", () => {
    localStorage.setItem(
      "indegenius:post-draft:user-1",
      JSON.stringify({ data: { content: "<p>Writing from the old composer.</p>" } })
    );
    const { unmount } = open();
    expect(screen.getByText(/unsaved copy/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(localStorage.getItem("indegenius:post-draft:user-1")).toBeNull();

    unmount();
    open();
    expect(screen.queryByText(/unsaved copy/i)).not.toBeInTheDocument();
  });

  it("restores from a legacy key without leaving it behind to offer again", () => {
    localStorage.setItem(
      "indegenius:post-draft:user-1",
      JSON.stringify({ data: { content: "<p>Writing from the old composer.</p>" } })
    );
    open();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>Writing from the old composer.</p>");
    expect(localStorage.getItem("indegenius:post-draft:user-1")).toBeNull();
  });

  it("does not offer a device copy the account copy already supersedes", () => {
    localStorage.setItem(
      "indegenius:contribution-draft:v1:user-1:draft:draft-1",
      JSON.stringify({ savedAt: "2026-08-23T10:00:00.000Z", data: { content: "<p>An older thought.</p>" } })
    );
    open(
      { ...empty, content: "<p>The newer thought.</p>" },
      { mode: "draft", draftId: "draft-1", draftUpdatedAt: "2026-08-23T11:00:00.000Z" }
    );

    expect(screen.queryByText(/unsaved copy/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("indegenius:contribution-draft:v1:user-1:draft:draft-1")).toBeNull();
  });

  it("still offers a device copy written after the account copy", () => {
    localStorage.setItem(
      "indegenius:contribution-draft:v1:user-1:draft:draft-1",
      JSON.stringify({ savedAt: "2026-08-23T12:00:00.000Z", data: { content: "<p>Work that never reached the server.</p>" } })
    );
    open(
      { ...empty, content: "<p>The older thought.</p>" },
      { mode: "draft", draftId: "draft-1", draftUpdatedAt: "2026-08-23T11:00:00.000Z" }
    );

    expect(screen.getByText(/unsaved copy/i)).toBeInTheDocument();
  });
});

describe("draft hygiene", () => {
  it("does not mint a database row for a stray keystroke", async () => {
    open();
    await type("<p>Ghhbh</p>");

    expect(mocks.ensure).not.toHaveBeenCalled();
    // The device still holds it, so nothing typed is ever lost.
    expect(localStorage.getItem("indegenius:contribution-draft:v1:user-1:new:new")).not.toBeNull();
  });

  it("saves to the account once there is about a sentence", async () => {
    open();
    await type("<p>Solar microgrids are changing Jos.</p>");

    expect(mocks.ensure).toHaveBeenCalled();
  });

  it("saves immediately once a title exists, however short the body", async () => {
    open(empty, { initialSurface: "article" });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A real intent" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    expect(mocks.ensure).toHaveBeenCalled();
  });

  it("leaves without a save warning when the writing never earned a row", async () => {
    open();
    await type("<p>Gh</p>");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(screen.queryByText(/didn’t save/)).not.toBeInTheDocument();
    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("does not interrupt a later visit over a device copy too small to matter", () => {
    localStorage.setItem("indegenius:post-draft:user-1", JSON.stringify({ data: { content: "<p>Gh</p>" } }));
    open();

    expect(screen.queryByText(/unsaved copy/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("indegenius:post-draft:user-1")).toBeNull();
  });
});

describe("the screen", () => {
  it("keeps the canvas to this piece, and leaves managing drafts to the profile", () => {
    open();

    expect(screen.queryByRole("heading", { name: /drafts/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /drafts/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Continue where you left off/i)).not.toBeInTheDocument();
  });

  it("rests on a one-word save status and elaborates only for a device-only copy", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Publication body"), { target: { value: "<p>Something worth saving to the account.</p>" } });

    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
```

Create `app/(write)/write/page.test.tsx`:

```tsx
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";

const { fakeSupabase } = vi.hoisted(() => ({
  fakeSupabase: { current: null as ReturnType<typeof makeFakeSupabase> | null },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase.current),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock("./UniversalComposer", () => ({ default: () => null }));

import WritePage from "./page";

async function composerProps(params: Record<string, string>) {
  fakeSupabase.current = makeFakeSupabase({
    profiles: queueResults({
      data: { full_name: "Ada", username: "ada", university: null, avatar_url: "https://cdn.example/ada.png" },
      error: null,
    }),
  });
  const element = (await WritePage({ searchParams: Promise.resolve(params) })) as ReactElement<{
    initialSurface: string | null;
    profile: { avatar_url: string | null };
  }>;
  return element.props;
}

describe("the write page", () => {
  it("opens the Article editor when the address asks for it", async () => {
    expect((await composerProps({ editor: "article" })).initialSurface).toBe("article");
  });

  it("ignores a screen it does not know", async () => {
    expect((await composerProps({ editor: "research" })).initialSurface).toBeNull();
  });

  it("ignores the retired format parameters", async () => {
    expect((await composerProps({ kind: "article" })).initialSurface).toBeNull();
  });

  it("reads the writer's avatar for the byline", async () => {
    expect((await composerProps({})).profile.avatar_url).toBe("https://cdn.example/ada.png");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run "app/(write)/write/UniversalComposer.test.tsx" "app/(write)/write/page.test.tsx"`
Expected: FAIL. The old canvas has no "New post" heading and no Article card, and the page passes no `initialSurface`.

- [ ] **Step 3: Rewrite the root**

Replace the whole of `app/(write)/write/UniversalComposer.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import ProfileGate from "@/components/ui/ProfileGate";
import { composerSurfaceFor, type ContentKind } from "@/lib/contentModel";
import type { ComposerMode, ContributionSnapshot } from "@/lib/contribution";
import ArticleEditor from "./ArticleEditor";
import PostComposer from "./PostComposer";
import { useContributionDraft } from "./useContributionDraft";
import { useModalFocus } from "./useModalFocus";

interface WriterProfile {
  full_name: string | null;
  username: string | null;
  university: string | null;
  avatar_url?: string | null;
}

interface UniversalComposerProps {
  mode: ComposerMode;
  userId: string;
  profile: WriterProfile | null;
  initialSnapshot: ContributionSnapshot;
  /** The screen asked for with `?editor=article`. A title overrides it. */
  initialSurface?: ContentKind | null;
  draftId?: string | null;
  editDraftId?: string | null;
  publishedPostId?: string | null;
  publishedSlug?: string | null;
  /** When the account copy was last written, so a stale device copy can be told apart from a newer one. */
  draftUpdatedAt?: string | null;
  returnTo: string;
}

/**
 * Keeps the chosen screen in the address beside any `draft` id, so a refresh
 * reopens the same one. Shallow, for the same reason the first autosave's
 * address update is: a server re-render would remount the editor under the
 * writer's cursor.
 */
function rememberSurface(surface: ContentKind) {
  const url = new URL(window.location.href);
  if (surface === "article") url.searchParams.set("editor", "article");
  else url.searchParams.delete("editor");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

/**
 * The composer: the Post composer or the Article editor over one saving hook.
 * The writer chooses the screen, and a title still makes a piece an Article
 * (lib/contentModel.ts). This root holds only what both screens share: the
 * choice between them, the recovery notice, and the leave, discard and profile
 * dialogs.
 */
export default function UniversalComposer({
  mode,
  userId,
  profile: initialProfile,
  initialSnapshot,
  initialSurface = null,
  draftId = null,
  editDraftId = null,
  publishedPostId = null,
  publishedSlug = null,
  draftUpdatedAt = null,
  returnTo,
}: UniversalComposerProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [surface, setSurface] = useState<ContentKind>(() =>
    composerSurfaceFor({ title: initialSnapshot.title, requested: initialSurface })
  );
  // Back returns to the Post composer only for an Article started from it
  // during this visit.
  const [openedFromPost, setOpenedFromPost] = useState(false);
  const [showProfileGate, setShowProfileGate] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const afterProfileRef = useRef<(() => void) | null>(null);
  const leaveDialogRef = useRef<HTMLDivElement>(null);
  const discardDialogRef = useRef<HTMLDivElement>(null);

  const resetForDocument = useCallback(
    (next: ContributionSnapshot) => {
      setSurface(composerSurfaceFor({ title: next.title, requested: initialSurface }));
      setOpenedFromPost(false);
      setShowDiscard(false);
    },
    [initialSurface]
  );

  const draft = useContributionDraft({
    mode,
    userId,
    initialSnapshot,
    draftId,
    editDraftId,
    publishedPostId,
    publishedSlug,
    draftUpdatedAt,
    returnTo,
    onDocumentChange: resetForDocument,
  });

  // The Post composer has no title field, so it is never shown over a title
  // nobody could see or clear there. A title restored from a device copy or a
  // version moves the piece to the Article editor.
  const titled = Boolean(draft.snapshot.title.trim());
  useEffect(() => {
    if (!titled || surface === "article") return;
    setSurface("article");
    rememberSurface("article");
  }, [surface, titled]);
  const shown: ContentKind = titled ? "article" : surface;

  const switchToArticle = useCallback(() => {
    setSurface("article");
    setOpenedFromPost(true);
    rememberSurface("article");
  }, []);

  const handleBack = () => {
    if (openedFromPost && !titled) {
      setSurface("post");
      setOpenedFromPost(false);
      rememberSurface("post");
      return;
    }
    void draft.requestClose();
  };

  const withCompleteProfile = useCallback(
    (next: () => void) => {
      if (profile?.full_name?.trim() && profile.username?.trim()) {
        next();
        return;
      }
      afterProfileRef.current = next;
      setShowProfileGate(true);
    },
    [profile]
  );

  const closeDiscard = useCallback(() => setShowDiscard(false), []);
  const openDiscard = useCallback(() => setShowDiscard(true), []);
  useModalFocus(draft.showLeave, leaveDialogRef, draft.closeLeave);
  useModalFocus(showDiscard, discardDialogRef, closeDiscard, draft.discarding);

  const isEdit = mode === "published-edit";
  const authorName = profile?.full_name?.trim() || profile?.username?.trim() || "You";
  const avatarUrl = profile?.avatar_url ?? null;
  const username = profile?.username?.trim() || null;

  const notice = draft.recovery ? (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold-tint px-4 py-3 text-sm">
      <p className="text-gold-ink">This device has an unsaved copy of your writing.</p>
      <div className="flex gap-2">
        <button type="button" onClick={draft.restoreRecovery} className="min-h-11 rounded-lg bg-gold-ink px-4 font-semibold text-white">
          Restore
        </button>
        <button type="button" onClick={draft.dismissRecovery} className="min-h-11 rounded-lg px-3 font-semibold text-gold-ink">
          Discard
        </button>
      </div>
    </div>
  ) : null;

  const discardCopy = isEdit
    ? { title: "Discard your changes?", body: "Your live publication will stay unchanged.", action: "Discard changes" }
    : draft.draftId
      ? { title: "Discard this draft?", body: "It will be deleted from your drafts.", action: "Discard" }
      : { title: "Discard this writing?", body: "It will be cleared from this device.", action: "Discard" };

  return (
    // /edit/[slug] is full screen with no app navigation. /write sits under
    // the (write) layout's navigation from md up.
    <div className={isEdit ? "fixed inset-0 z-[70] overflow-y-auto bg-surface" : undefined}>
      {shown === "article" ? (
        <ArticleEditor
          key={draft.documentKey}
          draft={draft}
          mode={mode}
          authorName={authorName}
          avatarUrl={avatarUrl}
          username={username}
          hasAppNav={!isEdit}
          autoFocusTitle={!titled}
          notice={notice}
          onBack={handleBack}
          onDiscard={openDiscard}
          withCompleteProfile={withCompleteProfile}
        />
      ) : (
        <PostComposer
          key={draft.documentKey}
          draft={draft}
          mode={mode}
          authorName={authorName}
          avatarUrl={avatarUrl}
          username={username}
          notice={notice}
          onCancel={() => void draft.requestClose()}
          onDiscard={openDiscard}
          onSwitchToArticle={switchToArticle}
          withCompleteProfile={withCompleteProfile}
        />
      )}

      {draft.showLeave ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 px-4">
          <div
            ref={leaveDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            className="w-full max-w-sm rounded-2xl bg-surface p-6 text-ink shadow-2xl"
          >
            <h2 id="leave-title" className="text-lg font-semibold">Your account copy didn’t save</h2>
            <p className="mt-2 text-sm text-ink-muted">This device still has a recovery copy.</p>
            <div className="mt-5 flex gap-3">
              <Button type="button" variant="secondary" onClick={draft.closeLeave} className="min-h-11 flex-1">
                Keep writing
              </Button>
              <Button type="button" variant="danger" onClick={() => draft.navigateAway()} className="min-h-11 flex-1">
                Leave with device copy
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showDiscard ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 px-4">
          <div
            ref={discardDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            aria-describedby="discard-body"
            className="w-full max-w-sm rounded-2xl bg-surface p-6 text-ink shadow-2xl"
          >
            <h2 id="discard-title" className="text-lg font-semibold">{discardCopy.title}</h2>
            <p id="discard-body" className="mt-2 text-sm text-ink-muted">{discardCopy.body}</p>
            <div className="mt-5 flex gap-3">
              <Button type="button" variant="secondary" onClick={closeDiscard} disabled={draft.discarding} className="min-h-11 flex-1">
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={draft.discarding}
                onClick={() => void draft.discardDraft()}
                className="min-h-11 flex-1"
              >
                {discardCopy.action}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showProfileGate ? (
        <ProfileGate
          open
          userId={userId}
          initialProfile={profile}
          onClose={() => {
            afterProfileRef.current = null;
            setShowProfileGate(false);
          }}
          onComplete={(next) => {
            setProfile((current) => ({ ...next, avatar_url: current?.avatar_url ?? null }));
            setShowProfileGate(false);
            const run = afterProfileRef.current;
            afterProfileRef.current = null;
            run?.();
          }}
        />
      ) : null}
    </div>
  );
}
```

The recovery banner's buttons pass `draft.restoreRecovery` directly. It takes no arguments, so the click event is ignored, and the value it returns is no longer needed because the screen now follows the title.

- [ ] **Step 4: Pass the screen and the avatar from the pages**

In `app/(write)/write/page.tsx`:

1. Add the import `import { parseContentKind } from "@/lib/contentModel";`.
2. In the `RETIRED_PARAMS` doc comment, replace the sentence `` `kind` and `type` chose a format, which a title now decides.`` with `` `kind` and `type` chose a format before there were two screens. The screen is `editor=article` now, and a title still decides what is stored.``
3. Change `.select("full_name, username, university")` to `.select("full_name, username, university, avatar_url")`.
4. Add the prop `initialSurface={parseContentKind(value(params, "editor"))}` to `<UniversalComposer>`.

In `app/(main)/edit/[slug]/page.tsx`, change `select("full_name, username, university")` to `select("full_name, username, university, avatar_url")`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run "app/(write)" "app/(main)/edit"`
Expected: PASS.

- [ ] **Step 6: Type-check, lint and run the guard tests**

Run: `npm run typecheck`
Expected: no errors. `tsconfig.check.json` lists `UniversalComposer.tsx`, so this now covers every screen through its imports.

Run: `npx eslint "app/(write)" "app/(main)/edit" components/editor lib/testUtils`
Expected: no errors, and in particular no em dash in any string.

Run: `npx vitest run lib/browserWriteBoundary.test.ts lib/browserDatabaseBoundary.test.ts lib/retiredCreationPaths.test.ts lib/retiredResponseProduct.test.ts lib/postArticleOnlyModel.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(write)/write" "app/(main)/edit/[slug]/page.tsx"
git commit -m "Switch /write and /edit to the Post composer and the Article editor"
```

### Task 19: The app navigation on `/write`

**Files:**
- Create: `lib/navigationViewer.ts`
- Create: `lib/navigationViewer.test.ts`
- Modify: `app/(main)/layout.tsx`
- Modify: `lib/publicationsFirstHome.test.ts` (lines 256-258)
- Rewrite: `app/(write)/layout.tsx`
- Create: `app/(write)/WriteChrome.tsx`
- Create: `app/(write)/WriteChrome.test.tsx`

**Interfaces:**
- Consumes: `canAccessAdminHubForRole(role, isBootstrapAdmin)` from `lib/adminAccess.ts`; `NavClient` (`user`, `profile`, `isAdmin`, `onOpenSearch`); `SearchOverlay` (`isOpen`, `onClose`); `useVisualViewportBottom()`.
- Produces: `interface NavigationProfile { username: string; full_name: string | null; role?: "student" | "reviewer" | "editor" | "admin"; avatar_url?: string | null }`, `interface NavigationViewer { user: User | null; profile: NavigationProfile | null; isAdmin: boolean }`, and `getNavigationViewer(): Promise<NavigationViewer>` from `lib/navigationViewer.ts`. `WriteChrome({ user, profile, isAdmin, children })` from `app/(write)/WriteChrome.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `lib/navigationViewer.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email?: string } },
  profile: null as null | Record<string, unknown>,
  tables: [] as string[],
}));

vi.mock("@/lib/supabase/server", async () => {
  const { makeBuilder } = await import("@/lib/testUtils/supabaseMock");
  return {
    createClient: async () => ({
      auth: { getSession: async () => ({ data: { session: state.session } }) },
      from: (table: string) => {
        state.tables.push(table);
        return makeBuilder({ data: state.profile, error: null });
      },
    }),
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
  AdminAccessError: class AdminAccessError extends Error {},
}));

import { getNavigationViewer } from "./navigationViewer";

describe("getNavigationViewer", () => {
  beforeEach(() => {
    state.session = null;
    state.profile = null;
    state.tables = [];
    vi.unstubAllEnvs();
  });

  it("reads nothing for a signed-out visitor", async () => {
    await expect(getNavigationViewer()).resolves.toEqual({ user: null, profile: null, isAdmin: false });
    expect(state.tables).toEqual([]);
  });

  it("reads one profile row for a member", async () => {
    state.session = { user: { id: "user-1", email: "ada@example.com" } };
    state.profile = { username: "ada", full_name: "Ada", role: "student", avatar_url: null };

    const viewer = await getNavigationViewer();

    expect(viewer.profile).toEqual(state.profile);
    expect(viewer.isAdmin).toBe(false);
    expect(state.tables).toEqual(["profiles"]);
  });

  it("recognises an admin by role", async () => {
    state.session = { user: { id: "user-1", email: "ada@example.com" } };
    state.profile = { username: "ada", full_name: "Ada", role: "admin", avatar_url: null };

    expect((await getNavigationViewer()).isAdmin).toBe(true);
  });

  it("recognises the bootstrap admin by email", async () => {
    vi.stubEnv("ADMIN_EMAIL", "ada@example.com");
    state.session = { user: { id: "user-1", email: "ada@example.com" } };
    state.profile = { username: "ada", full_name: "Ada", role: "student", avatar_url: null };

    expect((await getNavigationViewer()).isAdmin).toBe(true);
  });
});
```

Create `app/(write)/WriteChrome.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(main)/NavClient", () => ({
  default: ({ onOpenSearch }: { onOpenSearch: () => void }) => (
    <nav aria-label="Application header">
      <button type="button" onClick={onOpenSearch}>
        Open search
      </button>
    </nav>
  ),
}));
vi.mock("@/components/ui/SearchOverlay", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog" aria-label="Search" /> : null),
}));

import WriteChrome from "./WriteChrome";

function show() {
  render(
    <WriteChrome user={null} profile={null} isAdmin={false}>
      <p>Composer</p>
    </WriteChrome>
  );
}

describe("WriteChrome", () => {
  it("shows the app navigation from md up, above the composer", () => {
    show();

    expect(screen.getByRole("navigation", { name: "Application header" }).parentElement).toHaveClass(
      "hidden",
      "md:contents"
    );
    expect(screen.getByText("Composer")).toBeInTheDocument();
  });

  it("opens search from the navigation", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Open search" }));

    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();
  });

  it("publishes the keyboard offset the phone toolbars sit on", () => {
    show();

    expect(document.documentElement.style.getPropertyValue("--mobile-visual-viewport-bottom")).toBe("0px");
  });
});
```

In `lib/publicationsFirstHome.test.ts`, replace

```ts
    const layout = codeOf("app/(main)/layout.tsx");
    expect(layout.match(/\.from\(/g) ?? []).toHaveLength(1);
    expect(layout).not.toMatch(/\.rpc\(/);
```

with

```ts
    // The layout reads one row per navigation. The read moved into the helper
    // both layouts share, so the count is asserted where the read now lives.
    const layout = codeOf("app/(main)/layout.tsx");
    expect(layout).not.toMatch(/\.from\(|\.rpc\(/);
    expect(layout).toContain("getNavigationViewer(");
    const navigationViewer = codeOf("lib/navigationViewer.ts");
    expect(navigationViewer.match(/\.from\(/g) ?? []).toHaveLength(1);
    expect(navigationViewer).not.toMatch(/\.rpc\(/);
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/navigationViewer.test.ts "app/(write)/WriteChrome.test.tsx" lib/publicationsFirstHome.test.ts`
Expected: FAIL. Neither module exists, and the main layout still queries directly.

- [ ] **Step 3: Implement the shared lookup**

Create `lib/navigationViewer.ts`. Keep its comments free of the text `.from(`, because the guard above counts that text in the code:

```ts
import "server-only";

import type { User } from "@supabase/supabase-js";
import { canAccessAdminHubForRole } from "@/lib/adminAccess";
import { createClient } from "@/lib/supabase/server";

export interface NavigationProfile {
  username: string;
  full_name: string | null;
  role?: "student" | "reviewer" | "editor" | "admin";
  avatar_url?: string | null;
}

export interface NavigationViewer {
  user: User | null;
  profile: NavigationProfile | null;
  isAdmin: boolean;
}

/**
 * Who the app navigation is drawn for. The (main) layout and the (write)
 * layout both call this, so they cannot disagree about it.
 *
 * getSession reads the request cookie with no network round trip. getUser()
 * would validate the JWT with Supabase's auth server on every page load, and
 * for display-only navigation the session cookie is sufficient.
 *
 * A layout re-renders on every navigation, so this sits on the critical path
 * of every click. It reads one row, and only for a signed-in member, so a
 * public profile or post costs it no database work. It used to record a daily
 * activity fact as well, for the retention measurement Phase 2F retired;
 * record_user_activity_day() and user_activity_days stay in the database
 * until the cleanup phase, and nothing reads or writes them.
 */
export async function getNavigationViewer(): Promise<NavigationViewer> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("username, full_name, role, avatar_url")
        .eq("id", user.id)
        .single()
    : { data: null };

  const isAdmin =
    !!user &&
    canAccessAdminHubForRole(
      profile?.role,
      Boolean(process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL)
    );

  return { user, profile: (profile as NavigationProfile | null) ?? null, isAdmin };
}
```

Replace `app/(main)/layout.tsx` with:

```tsx
import { cookies } from "next/headers";
import { isLiteModeServer } from "@/lib/liteMode";
import { getNavigationViewer } from "@/lib/navigationViewer";
import AppShell from "./AppShell";
import NavigationShell from "./NavigationShell";
import { AppChromeProvider } from "./AppChromeProvider";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One row, and only for a signed-in member. See lib/navigationViewer.ts for
  // why that matters on a layout that renders on every navigation.
  const { user, profile: profileData, isAdmin } = await getNavigationViewer();
  const cookieStore = await cookies();
  const isLite = isLiteModeServer(cookieStore.toString());

  return (
    <AppChromeProvider>
      <div className={`min-h-screen bg-canvas${isLite ? " lite-mode" : ""}`}>
        <NavigationShell
          user={user}
          profile={profileData}
          isAdmin={isAdmin}
        />

        <AppShell
          showGuestBanner={!user}
          userId={user?.id ?? null}
          username={profileData?.username ?? null}
        >
          {children}
        </AppShell>
      </div>
    </AppChromeProvider>
  );
}
```

- [ ] **Step 4: Put the navigation on `/write`**

Create `app/(write)/WriteChrome.tsx`:

```tsx
"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import NavClient from "@/app/(main)/NavClient";
import SearchOverlay from "@/components/ui/SearchOverlay";
import { useVisualViewportBottom } from "@/lib/useVisualViewportBottom";
import type { NavigationProfile } from "@/lib/navigationViewer";

interface WriteChromeProps {
  user: User | null;
  profile: NavigationProfile | null;
  isAdmin: boolean;
  children: ReactNode;
}

/**
 * The app navigation above the write screens, from md up. On a phone each
 * screen is the whole view, with its own bar on the keyboard, so the
 * navigation is left out. `display: contents` keeps NavClient's own sticky
 * positioning working against the page rather than against this wrapper.
 *
 * There is no AppChromeProvider here. NavClient falls back to a fixed, always
 * shown bar without one, which is what a writing screen wants, and the
 * Article header sticks at --app-nav-height below it.
 */
export default function WriteChrome({ user, profile, isAdmin, children }: WriteChromeProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  // The phone toolbars sit on the keyboard through
  // --mobile-visual-viewport-bottom, which only this hook publishes.
  useVisualViewportBottom();

  return (
    <>
      <div className="hidden md:contents">
        <NavClient user={user} profile={profile} isAdmin={isAdmin} onOpenSearch={() => setSearchOpen(true)} />
      </div>
      <SearchOverlay isOpen={searchOpen} onClose={closeSearch} />
      {children}
    </>
  );
}
```

Replace `app/(write)/layout.tsx` with:

```tsx
import { getNavigationViewer } from "@/lib/navigationViewer";
import WriteChrome from "./WriteChrome";

/**
 * The write screens sit under the app navigation on a desktop, and fill the
 * screen on a phone. /edit/[slug] lives in (main) and stays full screen.
 */
export default async function WriteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, isAdmin } = await getNavigationViewer();

  return (
    <WriteChrome user={user} profile={profile} isAdmin={isAdmin}>
      {children}
    </WriteChrome>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/navigationViewer.test.ts "app/(write)" lib/publicationsFirstHome.test.ts lib/phase0MeasurementMigration.test.ts "app/(main)/NavClient.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npm run typecheck`
Expected: no errors. `tsconfig.check.json` lists `app/(write)/layout.tsx`, which reaches both new files.

- [ ] **Step 7: Commit**

```bash
git add lib/navigationViewer.ts lib/navigationViewer.test.ts "app/(main)/layout.tsx" lib/publicationsFirstHome.test.ts "app/(write)/layout.tsx" "app/(write)/WriteChrome.tsx" "app/(write)/WriteChrome.test.tsx"
git commit -m "Show the app navigation above the write screens on desktop"
```

---

## Phase 6: Tidy up and verify

### Task 20: Remove the old canvas styles and update CLAUDE.md

**Files:**
- Modify: `app/globals.css`
- Modify: `CLAUDE.md` (line 205; lines 215-229)

- [ ] **Step 1: Confirm nothing uses the old canvas classes**

Run: `grep -rn "write-canvas" app components lib --include=*.ts --include=*.tsx`
Expected: no output.

- [ ] **Step 2: Remove them**

In `app/globals.css`, delete everything from the comment `/* Distraction-free writing canvas */` through the rule `.write-canvas-editor h2, .write-canvas-editor h3 { font-weight: 600; }`. That covers the `.write-canvas-editor` and `.write-canvas-compact` rules, including the `@media (min-width: 1024px)` block between them. The `.write-article-editor` and `.write-post-editor` rules added in Task 9 stay.

- [ ] **Step 3: Update CLAUDE.md**

Replace line 205:

```
├── editor/          # Editor.tsx: Tiptap wrapper (StarterKit, Image, CharacterCount, Placeholder)
```

with:

```
├── editor/          # Editor.tsx (Post and Article variants), extensions.ts (the schema), editorIcons.tsx
```

Replace the paragraph that begins `` The `Editor.tsx` component exposes an `EditorHandle` ref `` (lines 215-220) with:

```markdown
The `Editor.tsx` component exposes an `EditorHandle` ref for toolbar
integration (`toggleBold`, `toggleItalic`, `toggleH2`, `toggleH3`,
`toggleBulletList`, `toggleOrderedList`, `toggleBlockquote`, `insertDivider`,
`isActive`, `undo`/`redo` with `canUndo`/`canRedo`, `triggerImageUpload`,
`insertLink`, `insertCitation`, `getSelectedImage`/`updateSelectedImage`,
`setTextAlign`/`getTextAlign`, `focus`), and fires `onUpdate` /
`onSelectionUpdate` callbacks. It has two variants. `article` has the
selection toolbar (desktop only) and the "+" insert menu. `post` shows no
tools, and sends a pasted or dropped image to `onImageFile` rather than into
the text. Both use the whole schema in `components/editor/extensions.ts`, so
an older Post keeps any formatting it has.

The composer at `/write` is two screens over one saving hook.
`UniversalComposer` owns `useContributionDraft` (the working copy, device and
account saves, recovery, publishing, leaving and discarding) and renders
`PostComposer` or `ArticleEditor`, chosen by `composerSurfaceFor()` and
`?editor=article`. A Post publishes from its button, and an Article goes
through `PublishSettingsDialog`. The Post composer is never shown over a
title. `/edit/[slug]` uses the same root, full screen with no navigation.
```

In the next paragraph, replace:

```markdown
from a word processor and wants the markup. `sanitizePostHtml` already allows
`figure`, `figcaption`, `pre`, `hr`, and tables, so the pipeline supports more
than the toolbar currently exposes.
```

with:

```markdown
from a word processor and wants the markup. `sanitizePostHtml` already allows
`figure`, `figcaption`, `pre`, `hr`, and tables, so the pipeline supports more
than the toolbar currently exposes. It also keeps `text-align` (left, center,
right, justify) on `p`, `h2` and `h3` and no other style, and justified
paragraphs hyphenate.
```

- [ ] **Step 4: Check the build still styles everything**

Run: `npx vitest run components/editor/extensions.test.ts`
Expected: PASS. The hyphenation rule is still in `globals.css`.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css CLAUDE.md
git commit -m "Remove the old canvas styles and describe the two write screens"
```

### Task 21: Verify the whole change

**Files:** none.

- [ ] **Step 1: Run the full checks**

Run each, in order:

```bash
npm test
npm run lint
npm run typecheck
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/\(write\)|app/\(main\)/(edit|post|layout)|components/editor|lib/(contribution|contentModel|uploadImage|navigationViewer|sanitizePostHtml|testUtils)"
npm run build
```

Expected: `npm test` shows no failures beyond the ones recorded before starting. `lint` and `typecheck` report no errors. The filtered `tsc` prints no lines; it is the only check that type-checks the new test files. `build` succeeds.

- [ ] **Step 2: Check desktop by hand**

Run `npm run dev`, sign in, and set the browser window to 1440 wide.

1. `/write` shows the app navigation, then a 560px Post card on the canvas background. It has "New post", no title field, and the placeholder "Share an idea, a link, a moment.".
2. Type a sentence. The status reads "Saved on this device", then "Saved", and the address gains `?draft=`.
3. Add an image. It shows at its own shape and no taller than 420px. Remove image clears it. Add it again.
4. Press the Article card. The Article editor opens with the caret in the title, the image as the cover, and `editor=article` in the address. Back returns to the Post card with the image.
5. In the Article editor, select a word. The dark selection toolbar appears with B, I, Link, H2, H3, Quote and Align. Justify a long paragraph and check it hyphenates. In an empty paragraph, the "+" appears and offers Image, Divider, Bulleted list and Numbered list.
6. Select an image in the body. The Image details card appears at the foot of the column.
7. ••• shows Sources, Version history (once the draft is saved), Drafts, Save draft and Discard. Sources opens a 420px panel on the right, and inserting a citation places it at the caret.
8. With an empty title and some body text, "Add a title to continue. An Article needs one, a Post never does." shows and Continue is disabled. Add a title and press Continue. Publish settings shows Topics and "N words · N min read". Publish opens the published article.
9. On the published article, the page shows no dek repeating the opening lines, and a paragraph justified in the editor is still justified.
10. Open `/edit/<slug>` for that article. It is full screen with no navigation, and the button reads "Update Article".

- [ ] **Step 3: Check a phone by hand**

In the browser's developer tools, set the viewport to 390x844, then repeat on a real phone.

1. `/write` is full screen with no app navigation. The status is a line under the header, and the image and Article buttons sit in a bar at the bottom.
2. Type until the Article card shrinks to "Article". The bar stays on top of the keyboard on the real phone.
3. Open the Article editor. The toolbar on the keyboard scrolls sideways and starts with Undo and Redo. Tapping Bold keeps the keyboard open.
4. More shows H3, the two lists and the four alignment buttons. + shows Image and Divider. Link swaps the row for an address field.
5. Sources and Publish settings open as bottom sheets.
6. Every control is at least 44px. Check in the element inspector's box model.

- [ ] **Step 4: Report**

Tell the user what passed, and anything that did not, with the output.
