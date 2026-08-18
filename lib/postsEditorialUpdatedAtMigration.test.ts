import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260818000002_posts_editorial_updated_at.sql"
  ),
  "utf8"
);

describe("posts editorial updated_at migration", () => {
  it("excludes only operational engagement counters from edit detection", () => {
    for (const column of [
      "view_count",
      "impression_count",
      "read_count",
    ]) {
      expect(sql).toContain(`v_${column} integer := NEW.${column}`);
      expect(sql).toContain(`NEW.${column} := OLD.${column}`);
      expect(sql).toContain(`NEW.${column} := v_${column}`);
    }
    expect(sql).toContain("NEW.updated_at := OLD.updated_at");
    expect(sql).not.toContain("to_jsonb(");
    expect(sql).not.toMatch(/NEW\.like_count|OLD\.like_count|v_like_count/);
  });

  it("compares the native normalized row and advances on an editorial change", () => {
    expect(sql).toContain("IF NEW IS DISTINCT FROM OLD THEN");
    expect(sql).toContain("NEW.updated_at := now()");
  });

  it("restores counter writes after deciding timestamp semantics", () => {
    const comparison = sql.indexOf("IF NEW IS DISTINCT FROM OLD THEN");

    expect(comparison).toBeGreaterThan(-1);
    for (const column of ["view_count", "impression_count", "read_count"]) {
      expect(sql.indexOf(`NEW.${column} := OLD.${column}`)).toBeLessThan(
        comparison
      );
      expect(sql.indexOf(`NEW.${column} := v_${column}`)).toBeGreaterThan(
        comparison
      );
    }
    expect(sql).not.toContain("NEW.topic_keys := OLD.topic_keys");
  });
});
