import { describe, expect, it } from "vitest";
import { compareProfileWork } from "./profileWorkOrder";

const work = (
  id: string,
  publishedAt: string | null,
  createdAt = "2026-01-01T00:00:00Z",
) => ({ id, publishedAt, createdAt });
describe("profile page ordering", () => {
  it("resolves equal publication times by creation time and then id", () => {
    const rows = [
      work("z", "2026-02-01T00:00:00Z"),
      work("a", "2026-02-01T00:00:00Z", "2026-01-02T00:00:00Z"),
      work("b", "2026-02-01T00:00:00Z", "2026-01-02T00:00:00Z"),
    ];
    expect(rows.sort(compareProfileWork).map((row) => row.id)).toEqual([
      "b",
      "a",
      "z",
    ]);
  });
  it("compares instants across timezone representations", () => {
    expect(
      [
        work("a", "2026-02-01T02:00:00+02:00"),
        work("z", "2026-02-01T01:00:00Z"),
      ]
        .sort(compareProfileWork)
        .map((row) => row.id),
    ).toEqual(["z", "a"]);
  });
  it("retains the database's nulls-last order instead of reshuffling limited pages", () => {
    expect(
      [
        work("a", null, "2026-10-01T00:00:00Z"),
        work("b", "2026-01-01T00:00:00Z"),
      ]
        .sort(compareProfileWork)
        .map((row) => row.id),
    ).toEqual(["b", "a"]);
  });
});
