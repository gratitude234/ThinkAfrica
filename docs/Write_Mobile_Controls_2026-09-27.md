# Mobile writing controls: screenshot follow-up

27 September 2026

- Raised the Article formatting toolbar and Post image bar by at least 12 CSS pixels above the existing visual-viewport/keyboard offset. Larger device safe-area insets take precedence.
- Made the Post/Update and Continue/Update Article header actions visually 32px tall with 8px corners, preserving their current width and a 44px real button/tap target.
- Preserved disabled, hover, loading and keyboard-focus behaviour. Publish-settings buttons are unchanged.

Validation: 188 tests passed across 18 writing/viewport test files. Changed-component ESLint and Tailwind CSS generation passed. Physical-phone keyboard clearance still needs confirmation on the affected device; no deployment was performed.

Changed files: app/globals.css; app/(write)/write/PostComposer.tsx; app/(write)/write/ArticleEditor.tsx; app/(write)/write/ArticleMobileToolbar.tsx.
