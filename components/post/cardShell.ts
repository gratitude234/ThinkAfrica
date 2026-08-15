/**
 * The single card geometry shared by every feed surface.
 *
 * This lives outside HomeFeedCard so FeedSkeleton can match the cards it turns
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
 */

/** Resting appearance. Use for anything non-interactive, e.g. skeletons. */
export const CARD_SHELL =
  "mb-3 overflow-hidden rounded-[18px] border border-card-border bg-card px-3.5 py-3.5 shadow-[0_2px_12px_rgb(17_24_39/0.045)] sm:mb-4 sm:rounded-[20px] sm:px-5 sm:py-5 dark:shadow-[0_2px_12px_rgb(0_0_0/0.5)]";

/**
 * Resting appearance plus hover feedback.
 *
 * The hover lift (`-translate-y-px`) that used to be here is gone. On a grid
 * of products a lift reads as affordance; on a single column of prose it makes
 * the page twitch as the pointer crosses it, animating cards the reader is not
 * looking at while they read one that is standing still. Edge and shadow alone
 * still register the hover, and dropping the transform also drops a compositor
 * paint on every pointer move.
 */
export const CARD_SHELL_INTERACTIVE = `${CARD_SHELL} transition-[border-color,box-shadow] duration-200 hover:border-card-border-hover hover:shadow-[0_10px_28px_rgb(17_24_39/0.07)] motion-reduce:transition-none dark:hover:shadow-[0_10px_28px_rgb(0_0_0/0.6)]`;

/**
 * Shared focus treatment for links inside a card. Gold against both grounds,
 * offset so it clears the card edge rather than tracing it.
 */
export const FOCUS_RING =
  "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-card";
