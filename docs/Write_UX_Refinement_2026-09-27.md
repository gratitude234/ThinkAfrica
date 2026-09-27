# Writing experience refinement

27 September 2026. Follow-up to the mockup audit and mobile-control spacing fixes.

## Implemented

1. **Simpler phone toolbar.** The primary row now has Undo, Bold, Italic, Link, More and Insert. Redo, H2 and Quote join H3, lists and alignment under More. All previous commands remain available. Six 44px controls replace the previous nine-control row; overflow scrolling remains a fallback for larger text settings. The More popover has a bounded, scrollable height.
2. **Quieter Post-to-Article invitation.** An empty Post keeps the introductory Article card. Once text exists, it becomes a compact “Switch to article →” action on desktop and mobile. Clearing the text restores the introductory card. Draft content remains shared between surfaces.
3. **More room around the typing cursor.** Tiptap/ProseMirror scroll thresholds and margins reserve room above the raised toolbar and below the sticky header. A visual-viewport resize asks the editor to reveal a focused, collapsed caret, including when the keyboard opens. The listener is removed on unmount and does not react to ordinary scrolling, so reading earlier content does not force the page back to the caret. Actual phone behaviour still needs device verification.
4. **Direct save recovery.** Both Post and Article save-error banners offer Retry saving, using the existing forced-save operation. The Post error banner is now visible at every breakpoint. Existing device recovery and truthful save-status wording are retained.
5. **Previous fixes retained.** The raised keyboard controls, slim 32px button surfaces with 44px tap targets, warm palette, green accents, typography, uploads, preview, settings, draft continuity and publication logic are retained.

## Validation and limits

- 201 tests passed across 19 writing/editor/viewport files.
- Project typecheck and ESLint for all changed source/test files passed.
- Production build passed, including full Next.js TypeScript processing.
- Browser/physical-phone verification is not claimed: the earlier browser installation failed. Live save, image upload and publishing require the configured application environment.
- No database changes or deployment performed.

## Changed files in this refinement

- app/(write)/write/ArticleMobileToolbar.tsx
- app/(write)/write/PostComposer.tsx
- app/(write)/write/ArticleEditor.tsx
- app/(write)/write/WriteHeader.tsx
- components/editor/Editor.tsx
- app/(write)/write/ArticleMobileToolbar.test.tsx
- app/(write)/write/PostComposer.test.tsx
- app/(write)/write/UniversalComposer.test.tsx

The updated ZIP includes the prior fixes and this document; installed dependencies and build output are excluded.
