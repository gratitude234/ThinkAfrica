/**
 * How much the composer's reads return.
 *
 * A plain module, not part of `lib/composerActions.ts`, because a "use server"
 * file may only export async functions: everything it exports becomes a
 * callable server action. `lib/serverActionContract.test.ts` enforces that,
 * and it caught these constants.
 */

/** Drafts shown in the composer's sidebar. */
export const MY_DRAFTS_LIMIT = 30;

/** Enough to find one resumable draft past any that are unsuitable. */
export const RESUMABLE_LIMIT = 5;

export const REVISION_LIMIT = 40;

export const COAUTHOR_RESULT_LIMIT = 6;
