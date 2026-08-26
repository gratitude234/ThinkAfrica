import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE_RECORD_SUMMARY } from "./profileRecord";
import {
  getLinkedProfileRecordMetrics,
  getVisibleProfileRecordMetrics,
  PROFILE_RECORD_METRIC_DEFINITIONS,
  PROFILE_RECORD_METRIC_DISCLAIMER,
  PROFILE_RECORD_METRIC_LIST,
  profileRecordMetricGridClass,
} from "./profileRecordMetrics";

const summary = (
  publicationCount: number,
  sourceBackedCount: number,
  citableCount: number
) => ({ publicationCount, sourceBackedCount, citableCount });

describe("visible record metrics", () => {
  it("shows nothing for an empty record", () => {
    expect(
      getVisibleProfileRecordMetrics(EMPTY_PROFILE_RECORD_SUMMARY)
    ).toEqual([]);
    expect(getVisibleProfileRecordMetrics(summary(0, 0, 0))).toEqual([]);
  });

  it("shows only the metrics that carry a value", () => {
    expect(
      getVisibleProfileRecordMetrics(summary(5, 0, 0)).map((m) => m.key)
    ).toEqual(["publications"]);
    expect(
      getVisibleProfileRecordMetrics(summary(5, 3, 0)).map((m) => m.key)
    ).toEqual(["publications", "source_backed"]);
    expect(
      getVisibleProfileRecordMetrics(summary(5, 3, 1)).map((m) => m.key)
    ).toEqual(["publications", "source_backed", "citable"]);
  });

  it("keeps the reading order even when the leading metric is absent", () => {
    // Source-backed without Publications should not happen, but the order a
    // reader meets these in is a property of the list, not of the data.
    expect(
      getVisibleProfileRecordMetrics(summary(0, 2, 1)).map((m) => m.key)
    ).toEqual(["source_backed", "citable"]);
  });

  it("treats a negative or non-finite count as nothing to show", () => {
    expect(getVisibleProfileRecordMetrics(summary(-1, 0, 0))).toEqual([]);
    expect(getVisibleProfileRecordMetrics(summary(Number.NaN, 0, 0))).toEqual([]);
  });

  it("carries the value and the shared definition together", () => {
    const [publications] = getVisibleProfileRecordMetrics(summary(7, 0, 0));
    expect(publications).toEqual({
      ...PROFILE_RECORD_METRIC_DEFINITIONS.publications,
      value: 7,
    });
  });
});

describe("linked record metrics", () => {
  it("points each metric at the record filter that proves it", () => {
    expect(
      getLinkedProfileRecordMetrics(summary(5, 3, 1), "ada").map((m) => m.href)
    ).toEqual([
      "/ada/record?type=publications",
      "/ada/record?type=publications&quality=source_backed",
      "/ada/record?type=publications&quality=citable",
    ]);
  });

  it("offers no links when there is nothing behind them", () => {
    expect(getLinkedProfileRecordMetrics(summary(0, 0, 0), "ada")).toEqual([]);
  });
});

describe("metric layout", () => {
  it("gives one, two and three metrics a row that fills", () => {
    expect(profileRecordMetricGridClass(1)).toBe("grid-cols-1");
    expect(profileRecordMetricGridClass(2)).toBe("grid-cols-2");
    expect(profileRecordMetricGridClass(3)).toBe("grid-cols-3");
  });

  it("never asks for more than three columns", () => {
    expect(profileRecordMetricGridClass(4)).toBe("grid-cols-3");
    expect(profileRecordMetricGridClass(0)).toBe("grid-cols-1");
  });
});

describe("metric definitions", () => {
  it("defines all three metrics, so no surface has to write its own copy", () => {
    expect(PROFILE_RECORD_METRIC_LIST.map((metric) => metric.label)).toEqual([
      "Publications",
      "Source-backed",
      "Citable",
    ]);
    for (const metric of PROFILE_RECORD_METRIC_LIST) {
      expect(metric.description.length).toBeGreaterThan(20);
    }
  });

  it("matches the publication semantics in the record contract", () => {
    expect(PROFILE_RECORD_METRIC_DEFINITIONS.publications.description).toMatch(
      /co-author/i
    );
    expect(PROFILE_RECORD_METRIC_DEFINITIONS.source_backed.description).toMatch(
      /source/i
    );
    expect(PROFILE_RECORD_METRIC_DEFINITIONS.citable.description).toMatch(
      /citation/i
    );
  });

  it("says what these numbers are not", () => {
    expect(PROFILE_RECORD_METRIC_DISCLAIMER).toMatch(/not popularity/i);
    expect(PROFILE_RECORD_METRIC_DISCLAIMER).toMatch(/quality score/i);
  });
});
