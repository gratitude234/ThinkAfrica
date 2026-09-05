import { describe, expect, it } from "vitest";
import { getDiscoveryModuleAt, getDiscoveryModuleOrder } from "./PostFeed";

describe("Home discovery cadence", () => {
  it("prioritizes writers for users following fewer than three people", () => {
    expect(
      getDiscoveryModuleOrder({
        prioritizePeople: true,
        hasPeople: true,
        hasTopic: true,
      })
    ).toEqual(["people", "topic"]);
  });

  it("leads with topics for users who already follow enough writers", () => {
    expect(
      getDiscoveryModuleOrder({
        prioritizePeople: false,
        hasPeople: true,
        hasTopic: true,
      })
    ).toEqual(["topic", "people"]);
  });

  it("drops a module with nothing to show", () => {
    expect(
      getDiscoveryModuleOrder({
        prioritizePeople: true,
        hasPeople: false,
        hasTopic: true,
      })
    ).toEqual(["topic"]);
  });

  it("surfaces discovery after three items, then leaves four-item reading runs", () => {
    const modules = ["topic", "people"] as const;
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 2, modules: [...modules] })).toBeNull();
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 3, modules: [...modules] })).toBe("topic");
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 7, modules: [...modules] })).toBe("people");
    // Only two modules exist, so the third breakpoint has nothing left to show.
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 11, modules: [...modules] })).toBeNull();
    expect(getDiscoveryModuleAt({ activeTab: "home", completedCount: 15, modules: [...modules] })).toBeNull();
  });

  it("never interrupts Following or Latest", () => {
    for (const activeTab of ["following", "latest"] as const) {
      expect(
        getDiscoveryModuleAt({
          activeTab,
          completedCount: 3,
          modules: ["topic", "people"],
        })
      ).toBeNull();
    }
  });
});
