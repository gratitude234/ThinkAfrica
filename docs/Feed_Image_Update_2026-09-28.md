# Feed image display — consistent width

This revision supersedes the earlier proportional-width treatment for short Posts.

## Short Posts

All attachments use the available content width, capped at 520px. Width no longer depends on viewport height or the image ratio. Landscape, square and portraits up to 4:5 keep their original proportions. Taller portraits and screenshots use a centre-cropped 4:5 preview. Object-cover fills the frame without stretching or artificial side strips. Cropped previews show “View full image”. Tapping opens the complete original through the existing lightbox; closing restores focus to the trigger. Uploaded files are not modified. Very wide panoramas retain their full proportions.

## Articles

Retain the compact side-thumbnail layout: 96px square on phones and 160px wide at 4:3 on larger screens. Publishing previews and feed placeholders retain the matching layout from the preceding update.

## Validation

29 targeted tests passed across PostImage, PostCover and HomeFeedCard, covering portrait cropping, square/landscape/panoramic ratios, crop labels and opening the viewer. TypeScript, changed-component ESLint, whitespace checks and Tailwind compilation passed. Browser visual verification and deployment remain outstanding.

This archive retains the earlier keyboard and Write loading improvements. No database or dependency changes are required.
