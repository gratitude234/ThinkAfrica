import { describe, expect, it } from "vitest";
import {
  getProfileNextAction,
  getProfileNextActions,
  PROFILE_ACTION_KEYS,
  type ProfileNextActionState,
} from "./profileNextAction";

/** A profile with nothing wrong with it: the resting state. */
function healthy(
  overrides: Partial<ProfileNextActionState> = {}
): ProfileNextActionState {
  return {
    username: "ada",
    identity: {
      fullName: "Ada Nwosu",
      profileType: "professional",
      country: "Nigeria",
      isStudentPath: false,
      university: null,
      fieldOfStudy: null,
      professionalTitle: "Policy researcher",
    },
    positioningStatement: "How state budgets survive contact with local government.",
    interestCount: 3,
    demonstratedTopicCount: 2,
    record: { publicationCount: 5, sourceBackedCount: 3, eligibleFeaturedCount: 5 },
    featured: [{ note: "My most complete treatment of the subject." }],
    research: { enabled: false, headline: null, interestCount: 0, methodCount: 0 },
    opportunities: {
      openToOpportunities: false,
      skillCount: 0,
      opportunityTypeCount: 0,
      hasContactLink: false,
    },
    ...overrides,
  };
}

const keyOf = (state: ProfileNextActionState) => getProfileNextAction(state).primary.key;

describe("profile next action priority", () => {
  it("puts a missing public identity above everything else", () => {
    expect(
      keyOf(
        healthy({
          identity: { ...healthy().identity, fullName: null },
          positioningStatement: null,
          interestCount: 0,
          record: { publicationCount: 0, sourceBackedCount: 0, eligibleFeaturedCount: 0 },
        })
      )
    ).toBe("complete_identity");
  });

  it("asks for an intellectual focus before declared interests", () => {
    expect(keyOf(healthy({ positioningStatement: null, interestCount: 0 }))).toBe(
      "add_positioning"
    );
  });

  it("asks for interests before work when both are missing", () => {
    expect(
      keyOf(
        healthy({
          interestCount: 0,
          record: { publicationCount: 0, sourceBackedCount: 0, eligibleFeaturedCount: 0 },
        })
      )
    ).toBe("add_interests");
  });

  it("asks for a first publication when the record is empty", () => {
    expect(
      keyOf(
        healthy({
          record: { publicationCount: 0, sourceBackedCount: 0, eligibleFeaturedCount: 0 },
          featured: [],
        })
      )
    ).toBe("publish_first");
  });

  it("asks for a Featured selection once there is work to select", () => {
    expect(keyOf(healthy({ featured: [] }))).toBe("select_featured");
  });

  it("asks for an explanation once a selection exists without one", () => {
    expect(keyOf(healthy({ featured: [{ note: null }] }))).toBe("explain_featured");
  });

  it("asks for tags when published work demonstrates no topics", () => {
    expect(keyOf(healthy({ demonstratedTopicCount: 0 }))).toBe("tag_published_work");
  });

  it("asks for sources when no publication is source-backed", () => {
    expect(
      keyOf(
        healthy({
          record: { publicationCount: 5, sourceBackedCount: 0, eligibleFeaturedCount: 5 },
        })
      )
    ).toBe("add_sources");
  });

  it("asks to complete research only when the feature is enabled", () => {
    const incomplete = {
      enabled: true,
      headline: null,
      interestCount: 0,
      methodCount: 0,
    };
    expect(keyOf(healthy({ research: incomplete }))).toBe("complete_research");
    expect(keyOf(healthy({ research: { ...incomplete, enabled: false } }))).toBe(
      "review_profile"
    );
  });

  it("asks to complete opportunities only for an author who opted in", () => {
    const thin = {
      openToOpportunities: true,
      skillCount: 0,
      opportunityTypeCount: 0,
      hasContactLink: false,
    };
    expect(keyOf(healthy({ opportunities: thin }))).toBe("complete_opportunities");
    expect(
      keyOf(healthy({ opportunities: { ...thin, openToOpportunities: false } }))
    ).toBe("review_profile");
  });

  it("asks the owner to confirm an outcome a provider recorded", () => {
    expect(
      keyOf(healthy({ outcomes: { awaitingOwnerConfirmation: 1, verifiedNotPublic: 0 } }))
    ).toBe("confirm_outcome");
  });

  it("asks the owner to publish a verified outcome that is still private", () => {
    expect(
      keyOf(healthy({ outcomes: { awaitingOwnerConfirmation: 0, verifiedNotPublic: 1 } }))
    ).toBe("publish_outcome");
  });

  it("never mentions outcomes when there are none to act on", () => {
    const keys = getProfileNextActions(
      healthy({ outcomes: { awaitingOwnerConfirmation: 0, verifiedNotPublic: 0 } })
    ).map((action) => action.key);
    expect(keys).not.toContain("confirm_outcome");
    expect(keys).not.toContain("publish_outcome");
    // Absent outcome state is the same as none: an older caller that does not
    // pass the field must not start receiving outcome advice.
    expect(getProfileNextActions(healthy()).map((a) => a.key)).not.toContain(
      "confirm_outcome"
    );
  });

  it("rests on reviewing the profile when nothing is missing", () => {
    const result = getProfileNextAction(healthy());
    expect(result.primary.key).toBe("review_profile");
    expect(result.primary.href).toBe("/ada");
    expect(result.secondary).toEqual([]);
  });
});

describe("profile next action safety rules", () => {
  it("never recommends featuring work when nothing is eligible", () => {
    // Published under a co-author credit that was never accepted, say: the
    // record counts it, but the picker would be empty.
    const actions = getProfileNextActions(
      healthy({
        featured: [],
        record: { publicationCount: 3, sourceBackedCount: 1, eligibleFeaturedCount: 0 },
      })
    );
    expect(actions.map((action) => action.key)).not.toContain("select_featured");
  });

  it("never recommends research while the feature is off", () => {
    const actions = getProfileNextActions(
      healthy({
        research: { enabled: false, headline: null, interestCount: 0, methodCount: 0 },
      })
    );
    expect(actions.map((action) => action.key)).not.toContain("complete_research");
  });

  it("judges a student identity by their own required fields", () => {
    const student = healthy({
      identity: {
        fullName: "Ada Nwosu",
        profileType: "student",
        country: "Nigeria",
        isStudentPath: true,
        university: "University of Lagos",
        fieldOfStudy: "Political Science",
        professionalTitle: null,
      },
    });
    // A student with no professional title is complete.
    expect(keyOf(student)).toBe("review_profile");
    // The same student missing their school is not.
    expect(
      keyOf({ ...student, identity: { ...student.identity, university: null } })
    ).toBe("complete_identity");
  });

  it("does not ask a non-student for a university", () => {
    const professional = healthy({
      identity: { ...healthy().identity, university: null, fieldOfStudy: null },
    });
    expect(keyOf(professional)).toBe("review_profile");
    // But it does ask for the headline that stands in for one.
    expect(
      keyOf({
        ...professional,
        identity: { ...professional.identity, professionalTitle: null },
      })
    ).toBe("complete_identity");
  });

  it("does not chase tags or sources for an author with no publications", () => {
    const actions = getProfileNextActions(
      healthy({
        demonstratedTopicCount: 0,
        featured: [],
        record: { publicationCount: 0, sourceBackedCount: 0, eligibleFeaturedCount: 0 },
      })
    );
    const keys = actions.map((action) => action.key);
    expect(keys).not.toContain("tag_published_work");
    expect(keys).not.toContain("add_sources");
    expect(keys[0]).toBe("publish_first");
  });
});

describe("profile next action shape", () => {
  it("returns at most two secondary suggestions", () => {
    const result = getProfileNextAction(
      healthy({
        identity: { ...healthy().identity, fullName: null },
        positioningStatement: null,
        interestCount: 0,
        demonstratedTopicCount: 0,
        featured: [],
        record: { publicationCount: 2, sourceBackedCount: 0, eligibleFeaturedCount: 2 },
        research: { enabled: true, headline: null, interestCount: 0, methodCount: 0 },
        opportunities: {
          openToOpportunities: true,
          skillCount: 0,
          opportunityTypeCount: 0,
          hasContactLink: false,
        },
      })
    );
    expect(result.secondary).toHaveLength(2);
    expect(result.primary.key).toBe("complete_identity");
  });

  it("gives every action a stable key, an explanation and a completion condition", () => {
    const seen = new Set<string>();
    const states: ProfileNextActionState[] = [
      healthy(),
      healthy({ positioningStatement: null }),
      healthy({ interestCount: 0 }),
      healthy({ record: { publicationCount: 0, sourceBackedCount: 0, eligibleFeaturedCount: 0 }, featured: [] }),
      healthy({ featured: [] }),
      healthy({ featured: [{ note: null }] }),
      healthy({ demonstratedTopicCount: 0 }),
      healthy({ record: { publicationCount: 1, sourceBackedCount: 0, eligibleFeaturedCount: 1 } }),
      healthy({ research: { enabled: true, headline: null, interestCount: 0, methodCount: 0 } }),
      healthy({
        opportunities: {
          openToOpportunities: true,
          skillCount: 0,
          opportunityTypeCount: 0,
          hasContactLink: false,
        },
      }),
      healthy({ identity: { ...healthy().identity, country: null } }),
      healthy({
        outcomes: { awaitingOwnerConfirmation: 1, verifiedNotPublic: 0 },
      }),
      healthy({
        outcomes: { awaitingOwnerConfirmation: 0, verifiedNotPublic: 2 },
      }),
    ];

    for (const state of states) {
      for (const action of getProfileNextActions(state)) {
        seen.add(action.key);
        expect(PROFILE_ACTION_KEYS).toContain(action.key);
        expect(action.explanation.length).toBeGreaterThan(20);
        expect(action.completionCondition.length).toBeGreaterThan(10);
        expect(action.ctaLabel.length).toBeGreaterThan(0);
        expect(action.href.startsWith("/")).toBe(true);
      }
    }

    // Every declared key is reachable from some state, so the union carries
    // no action the engine can never produce.
    expect([...seen].sort()).toEqual([...PROFILE_ACTION_KEYS].sort());
  });

  it("is deterministic for the same state", () => {
    const state = healthy({ featured: [] });
    expect(getProfileNextActions(state)).toEqual(getProfileNextActions(state));
  });

  it("sends profile actions to the canonical Command Center route", () => {
    const actions = getProfileNextActions(
      healthy({ positioningStatement: null, interestCount: 0, featured: [] })
    );
    for (const action of actions) {
      if (action.category === "identity" || action.key === "select_featured") {
        expect(action.href.startsWith("/settings/profile#")).toBe(true);
      }
    }
  });
});
