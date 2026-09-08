import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every column a repository names must exist.
 *
 * ## The bug this generalises
 *
 * The dashboard asked PostgREST for `fellowship_applications.reviewed_at`.
 * That column does not exist, in production or anywhere else. PostgREST
 * answers a select naming an unknown column with a 400, and the caller
 * destructured `{ data }` and dropped `error`, so the applications list has
 * silently been empty for as long as the line has been there. Nothing logged,
 * nothing rendered wrong, nothing to notice.
 *
 * It is the same shape as the `positioning_statement` problem the project
 * already documents: a select naming a column that does not exist is rejected
 * whole, so one wrong name empties an entire list.
 *
 * A direct connection is stricter still. PostgreSQL raises `column ... does
 * not exist`, which turns a quiet blank into a broken page. So this check is
 * not tidiness: it is the difference between the migrated path working and
 * failing outright.
 *
 * ## What is checked, and against what
 *
 * The production catalogue in `scripts/migration/out/schema.raw.sql`, not the
 * migrations directory. Four of five candidates in `supabase/pending/` are
 * applied in production without a promoted migration file, so the repository's
 * SQL is not the source of truth about the schema; the dump is.
 *
 * The scan covers the PostgREST selects, which is where this bug class lives
 * and where a column name appears without an alias to resolve. The reasoning
 * for not scanning the SQL is on `repositorySources` below.
 */

const schema = readFileSync(
  resolve(process.cwd(), "scripts/migration/out/schema.raw.sql"),
  "utf8"
);

/** table name -> its columns, from the catalogue's CREATE TABLE blocks. */
function readColumns(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const pattern = /CREATE TABLE public\.(\w+) \(([\s\S]*?)\n\);/g;

  for (const match of schema.matchAll(pattern)) {
    const [, table, body] = match;
    const columns = new Set<string>();
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("CONSTRAINT")) continue;
      // A reserved word is quoted in the dump: post_versions."references" is
      // a real column, and reading it as absent would report a bug that is
      // not there.
      const column = /^"?(\w+)"?\s/.exec(trimmed);
      if (column) columns.add(column[1]);
    }
    tables.set(table, columns);
  }
  return tables;
}

const TABLES = readColumns();

/** Views project columns too, and a repository may read one. Their columns are
 *  not in a CREATE TABLE block, so a reference to a view is not checked here
 *  rather than being guessed at. */
const VIEWS = new Set(
  [...schema.matchAll(/CREATE(?: OR REPLACE)? VIEW public\.(\w+)/g)].map(
    (match) => match[1]
  )
);

/**
 * The files whose PostgREST selects are checked.
 *
 * Deliberately the PostgREST side only. That is where this bug class lives: a
 * select naming an unknown column is rejected whole with a 400, and a caller
 * that drops `error` sees an empty list. The PostgreSQL side cannot fail this
 * way undetected, because an unknown column raises immediately and every
 * repository has a behavioural proof that runs its real SQL against a real
 * database.
 *
 * Scanning the SQL instead would need per-statement alias resolution: `a` is
 * post_authors in one query and fellowship_applications in another, `p` is
 * posts in most and profiles in one. A global alias map is wrong, and a
 * parser that is almost right produces false failures, which is the failure
 * mode that gets a test deleted.
 */
function repositorySources(): Array<{ file: string; source: string }> {
  const roots = ["lib/db", "lib"];
  const files: Array<{ file: string; source: string }> = [];

  for (const root of roots) {
    const directory = resolve(process.cwd(), root);
    for (const name of readdirSync(directory)) {
      if (!name.endsWith(".ts") || name.includes(".test.")) continue;
      files.push({
        file: `${root}/${name}`,
        source: readFileSync(resolve(directory, name), "utf8"),
      });
    }
  }
  return files;
}

/** Strips JS and SQL comments. Prose naming a removed column must not read as
 *  the column coming back. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/^\s*--[^\n]*$/gm, "");
}

/**
 * Every `.from("table") ... .select("columns")` pair, with the top-level
 * columns that select names. Embeds are skipped: `profiles!fk(a, b)` names
 * columns on another table, and resolving those needs the relationship rather
 * than the string.
 */
function selectPairs(source: string): Array<{ table: string; columns: string[] }> {
  const pairs: Array<{ table: string; columns: string[] }> = [];
  const pattern = /\.from\("([a-z_]+)"\)\s*\n?\s*\.select\(\s*(`|")([\s\S]*?)\2/g;

  for (const match of source.matchAll(pattern)) {
    const [, table, , body] = match;
    if (body.includes("${")) continue; // interpolated; not a literal to check

    const columns: string[] = [];
    let depth = 0;
    let current = "";
    for (const character of body) {
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;

      if (character === "," && depth === 0) {
        columns.push(current);
        current = "";
      } else {
        current += character;
      }
    }
    columns.push(current);

    pairs.push({
      table,
      columns: columns
        .map((column) => column.trim())
        .filter(
          (column) =>
            column &&
            column !== "*" &&
            !column.includes("(") &&
            !column.includes("!")
        )
        .map((column) => column.replace(/^\w+:/, "")),
    });
  }
  return pairs;
}

describe("every column a PostgREST select names", () => {
  it("finds selects to check, so the scan is not vacuous", () => {
    const pairs = repositorySources().flatMap(({ source }) =>
      selectPairs(withoutComments(source))
    );
    // If the pattern stopped matching, the check below would pass on anything.
    expect(pairs.length).toBeGreaterThan(8);
  });

  it("exists in the production catalogue", () => {
    const unknown: string[] = [];

    for (const { file, source } of repositorySources()) {
      for (const { table, columns } of selectPairs(withoutComments(source))) {
        const known = TABLES.get(table);
        // A view projects its columns rather than declaring them, so it is
        // outside this check rather than guessed at.
        if (!known || VIEWS.has(table)) continue;

        for (const column of columns) {
          if (!known.has(column)) unknown.push(`${file}: ${table}.${column}`);
        }
      }
    }

    // One wrong name empties an entire list on PostgREST, and raises on a
    // direct connection. This is the check that would have caught reviewed_at.
    expect([...new Set(unknown)].sort()).toEqual([]);
  });

  it("knows which relations are views, and does not guess at their columns", () => {
    expect(VIEWS.size).toBeGreaterThan(0);
    expect(VIEWS.has("profile_record_entries")).toBe(true);
  });
});

describe("the applications read, after the fix", () => {
  const dashboard = readFileSync(
    resolve(process.cwd(), "lib/db/dashboard.ts"),
    "utf8"
  );
  // SQL comments included: the module documents that reviewed_at is absent,
  // and that sentence must not read as the column coming back.
  const executable = withoutComments(dashboard);

  it("no longer names reviewed_at on either backend", () => {
    expect(executable).not.toMatch(/reviewed_at/);
  });

  it("still returns the columns the applications list renders", () => {
    for (const column of [
      "status",
      "applied_at",
      "proof_post_id",
      "review_note",
    ]) {
      expect(executable, `applications must still select ${column}`).toContain(
        column
      );
    }
  });

  it("surfaces a query failure instead of returning an empty list", () => {
    // The original discarded `error` and destructured `data`, so a 400 became
    // an empty array that looked like a member with no applications. The
    // repository's rows() helper throws, and this is the assertion that keeps
    // it doing so.
    expect(executable).toMatch(
      /rows<DashboardApplicationRow>\(\s*\n?\s*applications,/
    );
    expect(executable).toContain("throw new Error(");
  });
});
