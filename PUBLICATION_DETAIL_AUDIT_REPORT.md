# Publication detail mockup audit and fixes

Date: 24 September 2026
Reference: `Indegenius Publication Detail - Standalone (1)(3).html`

## Verdict

The supplied implementation had the main design structure, but was not a complete match. It already separated editorial Articles from conversational Posts, used the correct font families, constrained article bodies to 660px inside a 740px column, and provided the shared navigation, discussion, sources and author sections. This revision corrects the specific visual and behavioural gaps below. It is not a claim of pixel-perfect parity or a live production certification.

## Changes made

| Area | Problem found | Fix |
| --- | --- | --- |
| Article header | Desktop title size/tracking and mobile title/standfirst spacing differed from the reference. | Aligned desktop title to 44px and mobile title to 36px, with the reference line-height, spacing and mobile 16px standfirst. |
| Mobile author row | Desktop metadata layout persisted on phones. | Date/read time moves beneath the author name on mobile; professional title and separate date remain on desktop. Reduced avatar and Follow control sizes. |
| Verification | The page omitted available profile verification data. | Added conditional verification badges to the article header, author bio and Post byline. Unverified authors receive no badge. |
| Mobile actions | Full desktop labels could crowd narrow screens. | Mobile uses compact icons/counts with accessible names; desktop retains Like, Comment, Share and Save labels. Added pressed states for Like/Save. |
| Reading progress | Progress depended on the entire document, including recommendations and comments. | Measures the article body and reaches completion when its end enters the viewport. Recalculates for content resizing and font loading; respects reduced motion. |
| Rich text | Tailwind reset removed list markers, and nested wrappers left extra paragraph spacing. | Restored bullets/numbering, corrected first-paragraph and heading-to-paragraph spacing, added figure spacing and contained long URLs, tables and code blocks. |
| Related publications | Article titles used interface typography and Posts received article-like uppercase metadata. | Related Articles use Newsreader; related Posts keep Public Sans and ordinary relative-time metadata. Adjusted heading size and section spacing. |
| Author footer | Follow shape and spacing differed from the reference. | Uses the rectangular Follow treatment and restores separation from the engagement row. |
| Post citations | Posts received HTML without the reference-shortcode transformation already applied to Articles. | Posts now receive the transformed content so citation shortcodes link to their source entries. |
| Save feedback | Bookmark failures existed in state but were never displayed. | Displays an accessible error alert rather than silently reverting Save. |
| Share | Clipboard rejection was unhandled; the mobile share panel could extend to the right. | Added failure feedback with a selectable URL and bounded/right-aligned the panel. Successful copy restores trigger focus. |
| More menu | Keyboard opening did not move focus and Escape did not close the menu. Guest text was a dead end. | Focuses the first action, closes on Escape with focus restoration, and gives guests a sign-in-to-report link returning to the publication. |
| Discussion refresh | A sibling composer refreshed the route, but the thread retained its original client state. | Adopts refreshed server comments/counts and resets pagination consistently. Reply/delete success refreshes the server-backed counts too. |
| Unpublished content | Posts still showed public engagement controls, and read-only discussion could offer mutation buttons. | Hides the engagement row on unpublished Posts and suppresses discussion mutation controls when read-only. |
| Media failure | Failed publication images fell back to the feed's coloured kind placeholder. | Added an optional neutral patterned “Image unavailable” treatment for publication detail. Existing feed defaults remain available. |
| Semantics | The page nested a main landmark inside the app shell's main. | Replaced inner main elements with ordinary containers. |
| Regression coverage | Eight existing assertions still expected the superseded Comments/Upvote labels. | Updated those assertions to Discussion/Like and added tests for verification, clipboard success/failure, reading progress, Save errors, refreshed comments, read-only discussion and failed media. |

## Verification

- `npm run typecheck`: passed (the project's configured check).
- `npm run lint`: passed; changed publication/media components also passed a subsequent scoped lint check.
- `npm run build`: passed, including Next.js production TypeScript compilation. The final small media-fallback addition was subsequently checked with TypeScript, lint and media tests.
- Publication and media tests: **68 passed across 10 test files**.
- Chromium layout checks: **16 combinations**, covering Posts and Articles, with/without images, at **320, 390, 768 and 1440px**. No horizontal page overflow. Checked body font family/size and article list markers; inspected mobile/desktop screenshots.
- Browser fixtures used the real publication components, local sample content and bundled reference fonts in a minimal shell. They validate rendered layout, not a signed-in production session, real database reads, or real server mutations. Interactions were checked through component tests.
- A broader `tsc --noEmit --incremental false` scan reports **43 existing diagnostics in unrelated legacy tests**. An independently extracted original archive produces the identical 43 diagnostics after normalizing paths. This revision adds none; it does not clean up those unrelated tests. The entire repository test suite was not run.
- No database migration, deployment or production data change was performed.

## Intentional differences and remaining limits

- The reference's owner menu illustrates Delete on published content. The product currently authorizes draft deletion only. That rule is preserved: owners can edit and can delete drafts. Adding published-content deletion requires a separate backend lifecycle decision; no nonfunctional Delete button was introduced.
- The unavailable page cannot reliably link to the writer when the publication lookup returns no author. No writer identity is invented.
- Mockup sample names, counts and pictures remain sample data. The product renders actual records, so line wrapping and heights vary with real content.
- Live signed-in checks for Follow, Like, Save, commenting, reporting and draft deletion remain necessary in the configured deployment. Build-time sitemap generation used the existing static-route fallback because admin database credentials were unavailable here.

## Apply

Use the revised source archive in place of the supplied project version, install dependencies with `npm ci`, and run the normal deployment workflow. No new dependencies or environment variables are required. The report is included at the root of the archive.
