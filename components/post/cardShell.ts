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
 * 1. Rows sit on the canvas, so `bg-card` is now free to be the *hover* state.
 *    That reuses a token already tuned for both themes rather than inventing a
 *    wash. It also means any child that used `bg-canvas` to lift off the old
 *    white card ground now needs `bg-card` instead, or it disappears.
 * 2. The rule between rows is the only structure left on the page, so internal
 *    rules were removed rather than kept (see FeedEngagementActions, and the
 *    manuscript row in HomeFeedCard). Two hairlines a few pixels apart rebuild
 *    the box the row exists to be rid of.
 *
 * Spacing is deliberately unchanged in total. The gap that used to sit between
 * cards moved inside the row, where it separates content instead of objects:
 * 20+20 between adjacent rows on mobile against the old 14+12+14, and 28+28
 * from `sm` up against the old 20+16+20. Both come to the same 40px and 56px.
 *
 * The mobile `-mx-4` cancels the app shell's `px-4` so the rule and the hover
 * wash reach the screen edge, while `px-4` puts the text back where it was;
 * net, the row recovers the 28px of measure the card's own padding was taking.
 * From `sm` up the shell's padding is wider than the bleed, so the row simply
 * fills its grid column -- rule and wash spanning the full column, text inset
 * by `px-4` within it.
 */

/** Resting appearance. Use for anything non-interactive, e.g. skeletons. */
export const CARD_SHELL =
  "-mx-4 border-b border-divider px-4 py-5 sm:mx-0 sm:py-7";

/**
 * Resting appearance plus hover feedback.
 *
 * The hover lift (`-translate-y-px`) that used to be here is gone. On a grid
 * of products a lift reads as affordance; on a single column of prose it makes
 * the page twitch as the pointer crosses it, animating cards the reader is not
 * looking at while they read one that is standing still. Dropping the
 * transform also drops a compositor paint on every pointer move.
 *
 * The border-and-shadow hover it was paired with is gone too, for the simple
 * reason that a row has neither. A flat background wash marks the row under
 * the pointer without adding any edge the resting state does not have.
 */
export const CARD_SHELL_INTERACTIVE = `${CARD_SHELL} transition-colors duration-200 hover:bg-card motion-reduce:transition-none`;

/**
 * Shared focus treatment for links inside a row. Gold against both grounds,
 * offset so it clears surrounding text rather than tracing it. The offset
 * takes the canvas because that is the row's resting ground now; during the
 * brief overlap with hover the wash sits a single step away and the ring still
 * reads.
 */
export const FOCUS_RING =
  "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
