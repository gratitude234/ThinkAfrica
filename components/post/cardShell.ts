/**
 * The single row geometry shared by every feed surface.
 *
 * This lives outside HomeFeedCard so FeedSkeleton can match the rows it turns
 * into without importing a component. Holding the values in two places is what
 * let them drift: the skeleton was drawing `rounded-2xl border-gray-200 px-4
 * py-4` while the real cards drew `rounded-[18px] border-[#e9e5de] px-3.5
 * py-3.5`, so every card visibly resized and re-tinted at the moment content
 * arrived -- precisely the flicker the skeleton exists to prevent.
 *
 * There is deliberately one shell rather than one per content kind. The feed
 * previously ran three (cream for posts, amber for articles, purple-on-tinted
 * for research) plus a solid emerald hero and bordered interludes, so a scroll
 * read as five unrelated systems competing for the same column. Content kind
 * is now carried by typography -- Bodoni display headlines and a coloured
 * kicker for Article and Research, plain sans for Post -- which leaves colour
 * free to mean exactly one thing.
 *
 * It is a row, not a card. The card form ran four separators at once, each
 * independently sufficient to mark an item boundary: an outline, a shadow, a
 * gap, and a white ground standing off the warm canvas. Four made every post
 * read as a discrete object resting on a page rather than the next thing in a
 * column you are reading down -- and the white-on-cream step was doing more of
 * that work than the border was, being a shift in temperature and not just in
 * lightness. One hairline replaces all four.
 *
 * Two consequences worth knowing before editing:
 *
 * 1. Rows sit on the canvas, so any child that used `bg-canvas` to lift off
 *    the old white card ground now needs `bg-card` instead, or it disappears
 *    into the row. The same goes for a `hover:bg-canvas` that used to read
 *    against a white card and is now a no-op.
 * 2. The rule between rows is the only structure left on the page, so internal
 *    rules were removed rather than kept (see FeedEngagementActions, and the
 *    manuscript row in HomeFeedCard). Two hairlines a few pixels apart rebuild
 *    the box the row exists to be rid of.
 *
 * Spacing was first carried over unchanged from the card form -- 40px between
 * rows on mobile, 56px from `sm` up, matching the old 14+12+14 and 20+16+20 to
 * the pixel. That was a mistake, and a deliberate one, which is the worst kind.
 * Those totals were calibrated for *detached* cards, where the gap was the only
 * thing marking where one post ended: nothing else separated them, so it had to
 * be generous. A hairline does that job now. Adding a divider and keeping the
 * full gap is belt and braces, and it read as exactly that -- a feed of posts
 * flung apart from each other.
 *
 * Now 16+16 on mobile and 20+20 from `sm` up: 32px and 40px between rows. Still
 * well clear of X's ~24px, which is right, because a row here is a headline
 * plus three lines of excerpt rather than a two-line message.
 *
 * The mobile `-mx-4` cancels the app shell's `px-4` so the rule reaches the
 * screen edge, while `px-4` puts the text back where it was; net, the row
 * recovers the 28px of measure the card's own padding was taking. From `sm` up
 * the shell's padding is wider than the bleed, so the row simply fills its grid
 * column -- rule spanning the full column, text inset by `px-4` within it.
 */

/** The one row geometry. Real cards and skeletons share it verbatim. */
export const CARD_SHELL =
  "-mx-4 border-b border-divider px-4 py-4 sm:mx-0 sm:py-5";

/**
 * There is deliberately no hover state on the row itself.
 *
 * The hover lift (`-translate-y-px`) the card form used is gone for the
 * obvious reason: on a grid of products a lift reads as affordance, but on a
 * single column of prose it makes the page twitch as the pointer crosses it,
 * animating rows the reader is not looking at. The `hover:bg-card` wash that
 * briefly replaced it is gone for a better one.
 *
 * A whole-row hover means "this whole row is one click target." On X that is
 * true -- the row is a single link to the tweet -- and the wash is a promise
 * the row keeps. Here it is false: a row is roughly eight independent links
 * (author, avatar, title, excerpt, cover, tags, parent post, manuscript) plus
 * four action buttons, and the space between them does nothing at all. Washing
 * the whole row advertises a target that is not there, on a surface up to
 * ~500px tall, which is a much larger visual event than the same gesture on a
 * three-line tweet.
 *
 * It also undoes the point of the flat feed: `bg-card` on canvas is precisely
 * the white-on-cream step the row form removed, so hovering redrew the card we
 * had just deleted.
 *
 * Hover feedback belongs on the things that are actually clickable, and now
 * lives there -- titles and excerpts go emerald on hover, matching the links
 * in the interludes and the rail. Callers use CARD_SHELL directly.
 */

/**
 * Shared focus treatment for links inside a row. Gold against both grounds,
 * offset so it clears surrounding text rather than tracing it. The offset
 * takes the canvas because that is the row's resting ground now; during the
 * brief overlap with hover the wash sits a single step away and the ring still
 * reads.
 */
export const FOCUS_RING =
  "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
