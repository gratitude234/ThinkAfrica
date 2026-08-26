import { describe, expect, it } from "vitest";
import {
  deriveDeclaredInterests,
  deriveDemonstratedTopics,
  profileTopicKey,
} from "./profileTopics";

describe("demonstrated topics", () => {
  it("ranks by frequency and keeps the first spelling of a topic", () => {
    const topics = deriveDemonstratedTopics([
      { tags: ["Poetry", "africa"] },
      { tags: ["poetry"] },
      { tags: ["POETRY"] },
      { tags: ["law"] },
    ]);

    expect(topics.map((topic) => topic.label)).toEqual([
      "Poetry",
      "africa",
      "law",
    ]);
  });

  it("normalizes case into one topic with one count and one key", () => {
    const topics = deriveDemonstratedTopics([
      { tags: ["Poetry"] },
      { tags: ["poetry"] },
      { tags: ["POETRY"] },
    ]);

    expect(topics).toEqual([{ key: "poetry", label: "Poetry", count: 3 }]);
  });

  it("counts contributions per topic", () => {
    const topics = deriveDemonstratedTopics([
      { tags: ["law", "africa"] },
      { tags: ["law"] },
    ]);

    expect(topics).toEqual([
      { key: "law", label: "law", count: 2 },
      { key: "africa", label: "africa", count: 1 },
    ]);
  });

  it("does not let responses define what an author works on", () => {
    const topics = deriveDemonstratedTopics([
      { tags: ["law"] },
      { in_response_to: "parent-1", tags: ["poetry"] },
      { in_response_to: "parent-2", tags: ["poetry"] },
    ]);

    expect(topics.map((topic) => topic.label)).toEqual(["law"]);
  });

  it("never invents a topic from a declared interest", () => {
    // The whole point of the split: this function sees no interests at all,
    // so a topic here always has published work behind it.
    expect(deriveDemonstratedTopics([{ tags: [] }])).toEqual([]);
    expect(deriveDemonstratedTopics([])).toEqual([]);
  });

  it("ignores blank and whitespace-only tags", () => {
    expect(deriveDemonstratedTopics([{ tags: ["  ", "", "law"] }])).toEqual([
      { key: "law", label: "law", count: 1 },
    ]);
  });

  it("caps the list so a filter row stays a filter row", () => {
    const tags = Array.from({ length: 12 }, (_, index) => `topic-${index}`);
    expect(deriveDemonstratedTopics([{ tags }])).toHaveLength(8);
  });
});

describe("declared interests", () => {
  it("keeps only the interests the published work does not already cover", () => {
    const demonstrated = deriveDemonstratedTopics([{ tags: ["Poetry"] }]);

    expect(deriveDeclaredInterests(["poetry", "youth"], demonstrated)).toEqual([
      "youth",
    ]);
  });

  it("compares against demonstrated topics case-insensitively", () => {
    const demonstrated = deriveDemonstratedTopics([{ tags: ["POETRY"] }]);

    expect(deriveDeclaredInterests(["  Poetry  "], demonstrated)).toEqual([]);
  });

  it("deduplicates the declared list itself without losing its labels", () => {
    expect(deriveDeclaredInterests(["Youth", "youth", "Trade"], [])).toEqual([
      "Youth",
      "Trade",
    ]);
  });

  it("handles a profile with no interests recorded", () => {
    expect(deriveDeclaredInterests(null, [])).toEqual([]);
    expect(deriveDeclaredInterests(undefined, [])).toEqual([]);
    expect(deriveDeclaredInterests(["", "   "], [])).toEqual([]);
  });

  it("caps the list the same way the topic row is capped", () => {
    const declared = Array.from({ length: 12 }, (_, index) => `interest-${index}`);
    expect(deriveDeclaredInterests(declared, [])).toHaveLength(8);
  });
});

describe("profileTopicKey", () => {
  it("is the value a record topic filter is addressed by", () => {
    expect(profileTopicKey("  Public Health ")).toBe("public health");
  });
});
