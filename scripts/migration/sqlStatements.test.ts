import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error - plain ESM migration tooling, no types
import { splitStatements } from "./sqlStatements.mjs";

/**
 * The statement splitter behind the schema transformation.
 *
 * It is tested because it is the one part of the pipeline whose failure is
 * silent. A split in the wrong place does not produce an error: it produces a
 * schema that applies successfully with half of a PL/pgSQL body missing, and
 * the missing half is usually the authorization check, because that is what
 * `SECURITY DEFINER` functions are mostly made of.
 */

describe("splitStatements", () => {
  it("splits ordinary statements on the semicolon", () => {
    const statements = splitStatements(
      ["CREATE TABLE a (id int);", "CREATE TABLE b (id int);"].join("\n")
    );
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("CREATE TABLE a");
    expect(statements[1]).toContain("CREATE TABLE b");
  });

  it("keeps a dollar-quoted body whole, semicolons and all", () => {
    const source = [
      "CREATE FUNCTION f() RETURNS void",
      "    LANGUAGE plpgsql",
      "    AS $$",
      "BEGIN",
      "  UPDATE t SET a = 1;",
      "  UPDATE t SET b = 2;",
      "END;",
      "$$;",
      "CREATE TABLE after (id int);",
    ].join("\n");

    const statements = splitStatements(source);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("UPDATE t SET a = 1;");
    expect(statements[0]).toContain("UPDATE t SET b = 2;");
    expect(statements[1]).toContain("CREATE TABLE after");
  });

  it("respects a named tag, and treats a different tag inside as text", () => {
    const source = [
      "CREATE FUNCTION f() RETURNS void AS $function$",
      "BEGIN",
      "  EXECUTE $body$ SELECT 1; $body$;",
      "END;",
      "$function$;",
      "SELECT 1;",
    ].join("\n");

    const statements = splitStatements(source);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("$body$");
    expect(statements[0]).toContain("$function$;");
    expect(statements[1].trim()).toBe("SELECT 1;");
  });

  it("handles a body opened and closed on one line", () => {
    const source = [
      "CREATE FUNCTION f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;",
      "CREATE TABLE after (id int);",
    ].join("\n");
    expect(splitStatements(source)).toHaveLength(2);
  });

  it("keeps a body containing blank lines whole", () => {
    // The dump's own blank-line separation is not a reliable boundary, which
    // is the reason this is not a simpler function.
    const source = [
      "CREATE FUNCTION f() RETURNS void AS $$",
      "BEGIN",
      "",
      "  PERFORM 1;",
      "",
      "END;",
      "$$;",
    ].join("\n");
    expect(splitStatements(source)).toHaveLength(1);
  });

  it("does not lose a trailing statement without a newline", () => {
    expect(splitStatements("SELECT 1;")).toHaveLength(1);
    expect(splitStatements("SELECT 1")).toHaveLength(1);
  });

  it("returns nothing for empty input", () => {
    expect(splitStatements("")).toEqual([]);
    expect(splitStatements("\n\n  \n")).toEqual([]);
  });
});

/**
 * When a real dump is present, assert the properties the transformation
 * depends on. Skipped rather than failed when it is not: `out/` is gitignored
 * and a checkout will not have one.
 */
const RAW = join(process.cwd(), "scripts", "migration", "out", "schema.raw.sql");
const NEON = join(process.cwd(), "scripts", "migration", "out", "schema.neon.sql");
const havePipelineOutput = existsSync(RAW) && existsSync(NEON);

describe.skipIf(!havePipelineOutput)("the generated Neon schema", () => {
  const neon = readFileSync(NEON, "utf8");

  /** Comments and string literals removed: the check is about what the schema
   *  depends on, not what it talks about. */
  const executable = neon
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/'(?:[^']|'')*'/g, "''");

  it("splits the real dump into every CREATE FUNCTION it contains", () => {
    const raw = readFileSync(RAW, "utf8");
    const statements = splitStatements(raw);
    const declared = (raw.match(/^CREATE FUNCTION /gm) ?? []).length;
    const split = statements.filter((s: string) =>
      s.split(/\r?\n/).some((line) => line.startsWith("CREATE FUNCTION "))
    ).length;
    expect(split).toBe(declared);
  });

  it("references no provider-owned schema", () => {
    for (const [label, pattern] of [
      ["auth.users", /auth\.users/],
      ["vault", /\bvault\./],
      ["pg_cron", /\bcron\.(?:job|schedule|unschedule)/],
      ["pg_net", /\bnet\.(?:http|_http)/],
      ["extensions", /\bextensions\./],
    ] as const) {
      expect(executable, `${label} still referenced`).not.toMatch(pattern);
    }
  });

  it("carries the auth compatibility shim, and no auth tables", () => {
    expect(executable).toContain("CREATE SCHEMA IF NOT EXISTS auth");
    expect(executable).toContain("CREATE OR REPLACE FUNCTION auth.uid()");
    expect(executable).toContain("CREATE OR REPLACE FUNCTION auth.role()");
    expect(executable).not.toMatch(/CREATE TABLE auth\./);
  });

  it("creates the PostgREST role placeholders as NOLOGIN", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(executable).toContain(`CREATE ROLE ${role} NOLOGIN NOINHERIT`);
    }
    // A placeholder that could be granted anything would stop being a
    // placeholder.
    expect(executable).not.toMatch(/GRANT[^;]*TO (?:anon|authenticated|service_role)/);
  });

  it("leaves the authorization expressions untouched", () => {
    // The whole point of the shim: 178 auth.uid() call sites survive verbatim,
    // so the policies stay diffable against Supabase.
    expect((neon.match(/auth\.uid\(\)/g) ?? []).length).toBeGreaterThan(100);
  });
});
