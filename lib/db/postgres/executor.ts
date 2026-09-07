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

export function adaptDriver(driver: TaggedTemplateDriver): SqlExecutor {
  return {
    async query<Row>(text: string, params: readonly unknown[] = []) {
      const result = await driver.unsafe(text, params);
      return (Array.isArray(result) ? result : [...(result as Iterable<unknown>)]) as Row[];
    },
  };
}
