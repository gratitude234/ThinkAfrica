import { describe, expect, it } from "vitest";
import { deriveProfileTopics } from "./profileTopics";

describe("profile topics", () => {
  it("ranks by frequency and keeps the first spelling of a topic", () => {
    const topics = deriveProfileTopics(
      [
        { tags: ["Poetry", "africa"] },
        { tags: ["poetry"] },
        { tags: ["POETRY"] },
        { tags: ["law"] },
      ],
      null
    );

    expect(topics).toEqual(["Poetry", "africa", "law"]);
  });

  it("does not let responses define what an author works on", () => {
    const topics = deriveProfileTopics(
      [
        { tags: ["law"] },
        { in_response_to: "parent-1", tags: ["poetry"] },
        { in_response_to: "parent-2", tags: ["poetry"] },
      ],
      null
    );

    expect(topics).toEqual(["law"]);
  });

  it("appends declared interests the published work does not already cover", () => {
    const topics = deriveProfileTopics([{ tags: ["Poetry"] }], ["poetry", "youth"]);

    expect(topics).toEqual(["Poetry", "youth"]);
  });

  it("caps the list so a filter row stays a filter row", () => {
    const tags = Array.from({ length: 12 }, (_, index) => `topic-${index}`);
    expect(deriveProfileTopics([{ tags }], null)).toHaveLength(8);
  });

});
