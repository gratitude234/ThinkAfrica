/**
 * The profile and its full record are one continuous surface, so they have to
 * agree on a measure. They previously did not: the profile was 900px and the
 * record 820px, which reflowed every card on the way between them.
 *
 * `PROFILE_SHELL` widens past the reading measure at `lg`, where the page
 * splits into work plus a Background rail. `RECORD_SHELL` stays at the reading
 * measure because that view is a single column of cards all the way up.
 */
export const PROFILE_MEASURE = "max-w-[900px]";

export const PROFILE_SHELL = `mx-auto w-full ${PROFILE_MEASURE} lg:max-w-[1180px]`;

export const RECORD_SHELL = `mx-auto w-full ${PROFILE_MEASURE}`;

/**
 * Work on the left, standing context on the right. Collapses to a single
 * column below `lg`, where a 320px rail would leave the main column too narrow
 * for a card with a cover image.
 */
export const PROFILE_COLUMNS =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8";
