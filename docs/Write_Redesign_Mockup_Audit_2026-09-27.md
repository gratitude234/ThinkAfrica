# Indegenius Write Redesign — Mockup Implementation Audit

**Date:** 27 September 2026  
**Reference mockup:** `Write Redesign (Standalone) (3)(1).html`  
**Project reviewed:** `Indegenuis(20260927-082234).zip`

## Executive finding

The mockup was **partially implemented**. The core write architecture and most behaviour already existed, including separate Post/Article modes, Tiptap rich editing, autosave/recovery, draft handling, image uploads, desktop selection formatting, text alignment, preview, publishing, topics, sources and revision history.

However, several visible mockup contracts had drifted in the current project. The largest gap was the Post composer: it had become a generic full-page editor instead of the mockup's centred desktop card. The Article editor also differed in header actions, mobile Preview visibility, Add-cover discoverability, title validation copy, and the mobile formatting bar.

This audit restores those visible contracts while preserving later product improvements that are richer than the static mockup.

## What was already implemented correctly

- Distinct **Post** and **Article** writing surfaces.
- Post has no title and publishes directly.
- Article requires a title/body before continuing to publish settings.
- Tiptap Article editor with bold, italic, links, H2/H3, quote, lists, image insertion, divider, alignment and justify.
- Desktop green selection toolbar and alignment controls.
- Autosave, local/device recovery, explicit Save draft and discard flows.
- Post image upload/removal and Article cover/body image support.
- Article reader preview.
- Article topics and responsive publish sheet/dialog.
- Sources, citations, revision history and image metadata/caption support.
- Published-page alignment/justify preservation and hyphenation.

## Gaps found and fixed

### 1. Post desktop composition surface

**Before:** Post used the same broad full-page writing surface as Article.  
**Fixed:** Restored the mockup's warm-grey desktop workspace with a centred **560px** Post card, subtle border, rounded corners and shadow. Mobile remains full-screen.

### 2. Post header

**Before:** Shared Article-style header with **Back**.  
**Fixed:** Restored the Post-specific header: **Cancel**, centred **New post / Edit post**, save state, `•••`, and **Post / Update**.

### 3. Post desktop footer information

**Before:** Image and “Write an article instead” appeared in one generic action row; no mockup character counter.  
**Fixed:** Restored the desktop image control plus **“N characters, no hard limit”** and the full Article bridge card.

### 4. Post → Article bridge

**Before:** Quiet text action: “Write an article instead”.  
**Fixed:** Restored the mockup card with the green **A** mark, **Article**, and **Write something in depth**. On mobile the supporting line collapses once the writer starts typing, matching the mockup behaviour.

### 5. Post mobile image bar

**Before:** The phone bottom bar mixed Image and Article actions.  
**Fixed:** The fixed phone bar is now dedicated to the Image action; the Article bridge stays in the body above it.

### 6. Article primary action wording

**Before:** Editor header said **Publish / Update**, even though it actually opened Publish settings rather than publishing immediately.  
**Fixed:** Restored **Continue / Update Article**. Final publication still happens from **Publish now / Update now** inside Publish settings.

### 7. Article Preview on mobile

**Before:** Preview was hidden from the phone header and discoverable through `•••`.  
**Fixed:** Preview is visible directly in the mobile header, while remaining available from the menu as a redundant path.

### 8. Article mobile save/status row

**Before:** Save state was reduced to the shared phone status-dot treatment.  
**Fixed:** Article now uses a second mobile row with readable save status and the Add-cover action, matching the mockup structure.

### 9. Add-cover discoverability

**Before:** A blank Article intentionally hid Add cover; cover was available only from Publish settings or `•••`.  
**Fixed:** **Add cover** is directly visible above the title on desktop and in the second mobile header row. Existing Publish-settings/menu cover controls remain available. Once added, the full cover continues to appear under the title.

### 10. Article validation wording

**Before:** “Add a title to publish. An Article needs one, a Post never does.”  
**Fixed:** “**Add a title to continue. An Article needs one, a Post never does.**” This now describes the actual step correctly.

### 11. Mobile Article formatting bar

**Before:** The current project had changed the toolbar to a light/white treatment.  
**Fixed:** Restored the mockup's **deep brand-green** toolbar with high-contrast controls. Later capabilities—Undo/Redo, H3, lists and alignment—are preserved.

### 12. Reader preview shell

**Before:** Preview opened with a generic “How this reads” bar on all devices.  
**Fixed:** Mobile now gets the mockup-style **Back** bar. On desktop under `/write`, the app navigation remains visible while the reader preview occupies the content area; a close control remains available.

### 13. Regression coverage and project documentation

Updated focused tests to reflect the restored contracts, including Post Cancel/card/Article bridge, Continue/Update Article, title validation copy, and the green phone toolbar. Updated `CLAUDE.md`, the original write-redesign design spec, and `CHANGES.md` so the repaired UI is now documented as the current contract.

## Deliberate differences retained

These are **not treated as missing implementation** because they are later product improvements or live-product consistency rules:

- **Publish settings is richer than the mockup.** It retains the Stage 6 feed-card preview, cover, editable summary, topics, word/read length, and final Publish-now step rather than reverting to the mockup's topics-only dialog.
- **Article typography follows the live published page.** The editor/preview continues to use the application's current article type system rather than copying the mockup's illustrative font values exactly.
- **Mobile formatting has extra capability.** Undo/Redo, H3, bulleted/numbered lists and alignment remain in addition to the mockup's core toolbar controls.
- **Sources, revision history, image details/captions and recovery remain.** They extend the mockup without conflicting with it.

## Files changed

- `app/(write)/write/PostComposer.tsx`
- `app/(write)/write/WriteHeader.tsx`
- `app/(write)/write/ArticleEditor.tsx`
- `app/(write)/write/ArticleMobileToolbar.tsx`
- `app/(write)/write/PostComposer.test.tsx`
- `app/(write)/write/ArticleEditor.test.tsx`
- `app/(write)/write/ArticleMobileToolbar.test.tsx`
- `CLAUDE.md`
- `CHANGES.md`
- `docs/superpowers/specs/2026-09-25-write-redesign-design.md`
- `docs/Write_Redesign_Mockup_Audit_2026-09-27.md`

## Verification performed

- TypeScript/TSX syntax transpilation passed for every modified source and focused test file using the available TypeScript compiler.
- A focused contract scan passed for the restored mockup requirements: Post card/workspace, Cancel header, character counter, Article bridge, Article Continue/Update Article, Add cover, mobile Preview/status row, title-validation copy, dark-green phone formatting bar, reader-preview Back, and retained publish feed preview.
- The full Vitest/typecheck/build suite could **not** be truthfully reported as run in this sandbox because the supplied ZIP did not include `node_modules`. An offline `npm ci` stopped on an uncached `zod-validation-error@4.0.2` package, and the online dependency attempt did not complete within the container transport window. No test-pass claim has therefore been fabricated.

## Result

The write redesign is now **mockup-aligned at the visible interaction level** for the identified drift points while keeping the stronger functionality added after the mockup was created.
