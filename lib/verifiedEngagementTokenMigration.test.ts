import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260818000003_verified_engagement_tokens.sql"
  ),
  "utf8"
);

describe("verified engagement token migration", () => {
  it("deduplicates verified page and feed tokens independently of actor cookies", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX CONCURRENTLY");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(sql).toContain("NOT index_row.indisvalid");
    expect(sql.indexOf("COMMIT;")).toBeLessThan(
      sql.indexOf("CREATE UNIQUE INDEX CONCURRENTLY")
    );
    expect(sql).toContain("metadata ->> 'engagementTokenId'");
    expect(sql).toContain("event_type IN ('view', 'read')");
    expect(sql).toContain("metadata ->> 'exposureId'");
    expect(sql).toContain("event_type = 'impression'");
  });
});
