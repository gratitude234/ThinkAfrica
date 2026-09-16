import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract checks on the migration that stops client roles writing messages.
 *
 * There is no local migration runner, so these assert what a reviewer would
 * otherwise have to trust: the file revokes exactly the write paths the Phase
 * 2E audit found, keeps every read and the service role, and destroys nothing.
 * scripts/migration/apply-messaging-write-disablement.mjs proves the effect
 * against a real database, as privileges and as refused writes.
 */

const FILE = "20260915000001_disable_messaging_writes.sql";
const sql = readFileSync(join(process.cwd(), "supabase", "migrations", FILE), "utf8").replace(
  /\r\n/g,
  "\n"
);

/** Statements only, for assertions about what runs rather than what is explained. */
const executable = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const statements = executable
  .split(";")
  .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
  .filter(Boolean);

describe("disabling direct-messaging writes", () => {
  it("runs as one transaction", () => {
    expect(statements[0]).toBe("begin");
    expect(statements.at(-1)).toBe("commit");
  });

  it("revokes conversation creation from every client role", () => {
    expect(statements).toContain(
      "revoke execute on function public.find_or_create_conversation(uuid) from public, anon, authenticated"
    );
  });

  it("revokes every write on all three messaging tables from every client role", () => {
    expect(statements).toContain(
      "revoke insert, update, delete, truncate on table public.conversations, public.conversation_participants, public.messages from public, anon, authenticated"
    );
  });

  it("contains nothing but those two revokes", () => {
    expect(statements).toHaveLength(4);
  });

  it("keeps reads, and never touches the service role", () => {
    expect(executable).not.toMatch(/\bselect\b/i);
    expect(executable).not.toMatch(/service_role|\bpostgres\b/i);
  });

  it("destroys and rewrites nothing", () => {
    expect(executable).not.toMatch(/\bdrop\b/i);
    expect(executable).not.toMatch(/\bdelete\s+from\b/i);
    expect(executable).not.toMatch(/\btruncate\s+(table\s+)?public\./i);
    expect(executable).not.toMatch(/\bupdate\s+public\./i);
    expect(executable).not.toMatch(/\balter\s+(table|policy|function|publication)\b/i);
    expect(executable).not.toMatch(/\bgrant\b/i);
    expect(executable).not.toMatch(/\bcreate\b/i);
  });
});
