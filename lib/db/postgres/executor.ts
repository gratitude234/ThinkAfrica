/**
 * The narrowest thing a direct-PostgreSQL repository needs: run a parameterised
 * statement, get rows back.
 *
 * Deliberately not a driver type. Keeping the seam this small is what lets the
 * SQL and its row mapping be written, reviewed and tested in this phase while
 * the driver choice is still only a recommendation on paper, and it is what
 * will let a Worker, a Vercel function and a test each supply a different
 * connection without any of them reaching into repository code.
 */
export interface SqlExecutor {
  /** Positional parameters, `$1`-style, never interpolation. Every repository
   *  in lib/db/postgres builds its statement as a constant and passes values
   *  through here, which is the whole of the injection story. */
  query<Row = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[]
  ): Promise<Row[]>;
}

/**
 * postgres.js exposes `sql.unsafe(text, params)` for statements built as text
 * rather than as a tagged template. The name is about the *statement* being a
 * string, not about the parameters: values passed in the second argument are
 * still sent out of band and never concatenated into SQL.
 *
 * Anything with that shape adapts, which includes the test doubles in
 * lib/db/postgres/posts.test.ts.
 */
export interface TaggedTemplateDriver {
  unsafe(text: string, params?: readonly unknown[]): PromiseLike<unknown>;
}

/**
 * Errors that mean no connection was ever established.
 *
 * The distinction carries the whole safety argument for retrying below, so it
 * is a list of specific codes rather than a substring match on a message. Each
 * one is raised while opening a socket or completing a handshake, before any
 * statement is sent.
 */
const CONNECTION_PHASE_CODES = new Set([
  "CONNECT_TIMEOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
]);

function isConnectionPhaseError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && CONNECTION_PHASE_CODES.has(code);
}

/** Deliberately short and deliberately few. See the note on `adaptDriver`. */
const RETRY_DELAYS_MS = [250, 1000];

/**
 * Adapts a postgres.js instance, retrying only a failure to connect.
 *
 * ## Why there is a retry here at all, when Supabase deliberately has none
 *
 * `lib/supabase/fetchTimeout.ts` says, in as many words, that it does not
 * retry: during connection exhaustion a retry is not a second chance, it is a
 * second connection, and every client retrying at once is how a slow database
 * becomes an unreachable one. That reasoning is about a database that is
 * *overloaded*, and it still stands.
 *
 * This is a different condition. Neon suspends an idle compute, and the first
 * connection afterwards has to wake it: measured on the scratch database, that
 * first attempt takes several seconds or fails outright, and every attempt
 * after it settles to about two. A preview environment is idle almost all of
 * the time, so without a retry the first visitor after a quiet period reliably
 * gets an error page for a database that is perfectly healthy.
 *
 * ## Why retrying is safe here specifically
 *
 * Only a connection-phase error is retried. Those are raised before the
 * statement is sent, so the statement provably did not run, which is what
 * makes a retry safe for a write as well as a read. A query that failed *after*
 * reaching the server -- a timeout, a constraint violation, a syntax error --
 * is never retried, because it may have taken effect and because repeating it
 * is exactly the behaviour the Supabase rule warns about.
 *
 * Two attempts after the first, over about 1.25 seconds. That is enough for a
 * compute wake and nowhere near enough to become a thundering herd.
 */
export function adaptDriver(driver: TaggedTemplateDriver): SqlExecutor {
  return {
    async query<Row>(text: string, params: readonly unknown[] = []) {
      let lastError: unknown;

      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          const result = await driver.unsafe(text, params);
          return (
            Array.isArray(result) ? result : [...(result as Iterable<unknown>)]
          ) as Row[];
        } catch (error) {
          lastError = error;
          if (!isConnectionPhaseError(error) || attempt === RETRY_DELAYS_MS.length) {
            throw error;
          }
          console.warn(
            `[db] connection failed (${(error as { code?: string }).code}), ` +
              `retrying in ${RETRY_DELAYS_MS[attempt]}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
      }

      throw lastError;
    },
  };
}
