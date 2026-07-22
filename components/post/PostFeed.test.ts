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

  it("surfaces one unique module after each block of eight For-you items", () => {
    const modules = ["debate", "people", "topic"] as const;
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 7, modules: [...modules] })).toBeNull();
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 8, modules: [...modules] })).toBe("debate");
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 16, modules: [...modules] })).toBe("people");
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 24, modules: [...modules] })).toBe("topic");
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 32, modules: [...modules] })).toBeNull();
  });

  it("never interrupts Following or Latest", () => {
    for (const activeTab of ["following", "latest"] as const) {
      expect(
        getDiscoveryModuleAt({
          activeTab,
          completedCount: 8,
          modules: ["debate", "people", "topic"],
        })
      ).toBeNull();
    }
  });
});
