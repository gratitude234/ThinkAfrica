# Indegenius Write Redesign: Audit and Fix Report

Date: 27 September 2026

## Finding

**The mockup is substantially implemented in the supplied project, but it still had layout, accessibility, preview-consistency and test-maintenance gaps.** This review fixes the specific gaps listed below. It does not establish that the uploaded code is deployed on the live website or that the interface is pixel-identical to the mockup.

Reviewed inputs:
- Project: `Indegenius-write-redesign-fixed-20260927(1).zip`
- Reference: `Write Redesign (Standalone) (3)(2).html`

The ZIP already included an earlier audit and its changes. Those earlier changes are not claimed as new work in this report. The bundled mockup's template and interaction-state definitions were extracted and compared with the actual component source.

## What was already implemented

| Mockup area | Finding in the supplied code |
|---|---|
| Desktop Post composer | Warm workspace, 560px card, Cancel, New/Edit post, menu, Post/Update, author and character count already present. |
| Mobile Post composer | Full-screen composition, image bar, save text and collapsing Article bridge already present. |
| Post-to-Article transition | Uses the shared draft, preserves body/image and remembers the selected surface in the URL. |
| Article editor | Title/body, Continue/Update Article, validation and visible Add cover already present. |
| Formatting | Desktop selection/insert tools and green mobile toolbar already present, including alignment and justify. |
| Reader preview | Desktop/mobile preview shell already present, but cover order and responsive keyboard focus needed correction. |
| Publish settings | Responsive settings with topics, cover, summary and feed-card preview already present. |
| Draft lifecycle | Autosave, recovery, explicit save, discard and revision history already present. |

## Fixes made in this review

### 1. Post header layout

The heading used absolute positioning while the save status and actions had no reserved space. A long status could compete with the heading. The header now uses separate grid columns, truncates long desktop status text, and retains the complete status in its tooltip and accessible announcement. Compact phone action sizing preserves the shared 44px minimum touch height. The phone title has its own bounded column, including while an action is busy.

Changed: `app/(write)/write/PostComposer.tsx`.

### 2. Article action sizing on narrow phones

The shared button sizing made the longer “Update Article” action compete with Back, the menu and Preview. Its phone padding and type size are now compact, with normal sizing restored from the small-screen breakpoint. Preview stays directly available.

Changed: `app/(write)/write/ArticleEditor.tsx`.

### 3. Post save announcements on desktop

The populated live-status element was in the mobile-only row. Desktop status text was hidden from assistive technology, so the desktop save state had no dependable announcement. A persistent screen-reader live region now announces the status independently of viewport size; the duplicate visual phone text is excluded from that announcement.

Changed: `app/(write)/write/PostComposer.tsx`.

### 4. Mobile Post image-bar safe area

The bar previously moved its entire background above the safe-area inset, leaving a gap below it. It now fills that region with internal bottom padding and retains the existing keyboard/visual-viewport offset.

Changed: `app/(write)/write/PostComposer.tsx`.

### 5. Reader-preview cover order

Preview placed the cover above the title, while the published article places it after the title, summary and author information. The preview now follows that content order and uses the published cover's 8px rounding. Added a regression test asserting that the cover follows the byline and precedes the body.

Changed: `app/(write)/write/ArticlePreview.tsx` and its test.

### 6. Responsive preview/dialog keyboard focus

The focus helper selected the first and last controls without checking whether CSS hid them. Preview contains a mobile Back button and a desktop close button, so the desktop could try to focus the hidden Back button. Initial focus and Tab wrapping now use only rendered, visible controls. Added a regression test for initial focus, forward/reverse wrapping and Escape with hidden controls at both ends.

Changed: `app/(write)/write/useModalFocus.ts`; added `useModalFocus.test.tsx`.

### 7. Published-edit preview close position and title validation semantics

The desktop preview close button always reserved app-navigation height, even on the standalone published-edit surface. It now uses the navigation offset only where navigation exists. A missing required title also exposes `aria-invalid` alongside the existing explanatory text.

Changed: `app/(write)/write/ArticleEditor.tsx`.

### 8. Six stale integration tests repaired

The initial writing-suite run had **6 failures and 176 passes**. The failures were obsolete control queries: four still looked for “Write an article instead”, one for “Publish” in the Article header and one for “Back” in the Post composer. Updated them to the current Article bridge, Continue and Cancel controls. The tests still exercise switching, draft continuity, publishing and closing; their behavioural assertions were retained.

Changed: `app/(write)/write/UniversalComposer.test.tsx`.

## Verification

| Check | Result |
|---|---|
| Dependency installation | Passed using the existing lockfile; no dependency-manifest changes included. |
| Final focused writing suite | **184 passed across 17 test files.** |
| Full project suite | **2,556 passed; 195 skipped**, across 229 passing and 15 skipped files. This run preceded the new focus test; that test passed separately and in the final focused run. |
| `npm run typecheck` | Passed. This project command checks a selected file set. |
| Production `npm run build` | Passed, including Next.js TypeScript processing. |
| ESLint on all changed source/test files | Passed. |
| Responsive CSS generation | Passed. |
| Browser/visual verification | Not completed: browser launcher failed and the Chromium download could not be installed successfully. Layout corrections are source-reviewed, not screenshot-verified. |

The build reported that the Supabase admin client was not configured for sitemap generation and used its static-route fallback. No live credentials were supplied. Real account persistence, image uploads and publication against production were not exercised. No database migrations or production deployment were performed.

## Differences intentionally retained

- Publish settings retains the existing summary editor, cover control and feed-card preview rather than reverting to the mockup's simpler topics-only example.
- Article typography continues to use the live application's published-article classes.
- Undo/redo, extra formatting, sources, history and recovery remain available.
- Mockup demonstration tabs, sample authors/content and drawn keyboards are presentation aids, not missing product features.

## Deliverable and handoff

The corrected ZIP preserves the original archive's other files and adds this report and the focus regression test. Only the seven source/test files listed above, plus this report, are changed or added. Generated build output, installed dependencies and the temporary visual harness are not included.

Before deploying, review the changed files and smoke-test at 320px, 390px, 768px and 1440px: create/edit Post, long save/error status, switch to Article, preview keyboard navigation, cover ordering, phone keyboard/safe area, and the actual save/upload/publish flow. These are the remaining manual/live checks, not claims of missing backend implementation.
