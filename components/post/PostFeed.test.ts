import { describe, expect, it } from "vitest";
import { getDiscoveryModuleAt, getDiscoveryModuleOrder } from "./PostFeed";

describe("Home discovery cadence", () => {
  it("prioritizes writers for users following fewer than three people", () => {
    expect(
      getDiscoveryModuleOrder({
        prioritizePeople: true,
        hasPeople: true,
        hasDebate: true,
        hasTopic: true,
      })
    ).toEqual(["people", "debate", "topic"]);
  });

  it("surfaces discovery after three items, then leaves four-item reading runs", () => {
    const modules = ["debate", "people", "topic"] as const;
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 2, modules: [...modules] })).toBeNull();
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 3, modules: [...modules] })).toBe("debate");
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 7, modules: [...modules] })).toBe("people");
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 11, modules: [...modules] })).toBe("topic");
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 15, modules: [...modules] })).toBeNull();
  });

  it("never interrupts Following or Latest", () => {
    for (const activeTab of ["following", "latest"] as const) {
      expect(
        getDiscoveryModuleAt({
          activeTab,
          completedCount: 3,
          modules: ["debate", "people", "topic"],
        })
      ).toBeNull();
    }
  });
});
