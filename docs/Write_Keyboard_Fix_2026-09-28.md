# Mobile write workflow: keyboard and caret fix

## Diagnosis

The supplied screenshot shows article text continuing underneath the floating formatting toolbar and through the area above the iPhone keyboard. It does not establish an autosave failure: a single “Saving…” frame is insufficient to diagnose that.

The supplied source already measures the keyboard and raises the toolbar. Three remaining layout weaknesses were found:

- The toolbar is raised with a bottom offset, leaving an uncovered strip where document text can show through.
- Caret scrolling relies on fixed margins. The installed ProseMirror viewport calculation uses visual viewport height with a zero top, while iOS can pan that viewport. It does not measure this application's toolbar or header.
- The document has fixed end padding (160px for Articles, 96px for Posts), without additional keyboard clearance. Near the end, there may not be enough page scroll range to lift the active line above the controls.

These findings explain plausible mechanisms for the screenshot. The affected physical device was not available for an exact reproduction.

## Changes

- Added a mobile caret visibility helper using the visual viewport offset and measured toolbar/header rectangles, with space around the complete current line.
- Integrated it with ProseMirror's scroll-to-selection handling and scheduled checks after focus, edits, selection changes and viewport resizing.
- Avoided scroll-event caret correction so reading earlier paragraphs does not snap the page back. Non-collapsed selections and unfocused editors are left alone.
- Added keyboard-dependent end padding to both writing canvases.
- Moved the existing toolbar clearance inside its opaque background: the controls remain raised, while the uncovered strip is closed.
- Scoped the custom scrolling to mobile writing canvases; other hosts and desktop retain ProseMirror's scroll-to-selection handling.

## Validation

- 198 tests passed across 19 targeted test files, including 9 new caret geometry regressions.
- New cases cover toolbar overlap, iOS viewport panning, sticky header overlap, absent toolbar, visible caret, selection handles, focus loss, desktop and other editor hosts.
- TypeScript check passed.
- ESLint passed for the changed components and helper/tests.
- Tailwind CSS compilation passed.
- React review: viewport work is frame-coalesced, event listeners are cleaned up, no per-keystroke React state was introduced, and existing accessible controls remain intact.

## Deployment and device confirmation

This archive contains source changes; it has not been deployed. No dependency or database migration is required. After deployment, verify on the affected iPhone: open a long Article, type at the final paragraph, insert line breaks, select and format words, open/cancel a link, dismiss/reopen the keyboard, and scroll to an earlier paragraph. Repeat the final-line typing check for a Post. The active line should stay above the controls, while manual reading should not jump back to the caret. Native keyboard accessory bars are controlled by the browser/OS.

## Changed source files

- components/editor/mobileCaret.ts
- components/editor/mobileCaret.test.ts
- components/editor/Editor.tsx
- app/(write)/write/ArticleEditor.tsx
- app/(write)/write/ArticleMobileToolbar.tsx
- app/(write)/write/PostComposer.tsx
- app/(write)/write/WriteHeader.tsx
