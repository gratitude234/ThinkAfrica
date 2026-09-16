import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260916000001_feed_aggregate_service_role_grants.sql"
  ),
  "utf8"
).replace(/\r\n/g, "\n");

describe("feed aggregate service-role grants", () => {
  it("grants the cached public feed access to every maintained counter table", () => {
    for (const table of [
      "post_like_counts",
      "post_bookmark_counts",
      "post_reference_counts",
    ]) {
      expect(migration).toMatch(
        new RegExp(`GRANT\\s+SELECT\\s+ON\\s+public\\.${table}\\s+TO\\s+service_role`, "i")
      );
    }
  });

  it("reloads PostgREST after the privilege repair", () => {
    expect(migration).toMatch(/NOTIFY\s+pgrst\s*,\s*'reload schema'/i);
  });
});
