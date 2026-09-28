# Feed image display update

## Design decisions

Short Posts treat the attachment as content: show it beneath the text at the available width, up to 520px. Preserve the entire image with object-contain and natural proportions, bounded to 60% of the small viewport height or 480px. Portraits and tall screenshots may have neutral space around them rather than lose information. Tapping still opens the full-screen viewer, and closing restores focus.

Articles remain headline-led: show a 96px square thumbnail beside the headline and summary on phones, increasing to a 160px-wide 4:3 thumbnail from the small breakpoint. Covers are centre-cropped; the headline remains outside the image. Tapping the cover opens the article. The headline remains the accessible keyboard link to avoid duplicate tab stops. Without a cover, text uses the full width.

Responsive image sizes now match these display widths. Failed feed images use a quiet “Image unavailable” fallback. The Article publishing preview and feed loading skeleton match the new layout. Existing image optimisation, lazy loading, priority behaviour, engagement controls, and full-screen viewer are retained.

## Validation

41 targeted tests passed across HomeFeedCard, PostImage, PostCover and PublishSettingsDialog. TypeScript, changed-component ESLint and Tailwind compilation passed. Existing tests cover full-image containment, viewer focus restoration, article links, and adding/removing the cover in the publishing preview. Browser and physical-device visual verification remain outstanding.

## Scope

This archive continues from the corrected ZIP in this conversation and includes the preceding keyboard and Write loading changes. It has not been deployed. No database or dependency changes are required.
