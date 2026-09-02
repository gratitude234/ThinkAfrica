import { describe, expect, it } from "vitest";
import {
  BROADCAST_AUDIENCES,
  BROADCAST_STATUS_META,
  EXECUTIVE_SENDER_KEYS,
  STANDING_AUDIENCE_KEYS,
  allowedBroadcastSenderKeys,
  buildBroadcastSenderOptions,
  defaultSenderKey,
  formatBroadcastDate,
  formatRecipientCount,
  getBroadcastAudience,
  isBroadcastEditable,
  isExecutiveSender,
  subjectGuidance,
  type BroadcastAudienceKey,
} from "@/lib/broadcasts";

describe("sender permissions", () => {
  it("gives a full admin every approved identity", () => {
    expect(allowedBroadcastSenderKeys(["admin.full"])).toEqual([
      "platform",
      "socials",
      "partnership",
      "ceo",
      "cto",
    ]);
  });

  it("withholds the executive identities from a plain communications admin", () => {
    const allowed = allowedBroadcastSenderKeys(["communications.manage"]);

    expect(allowed).toEqual(["platform", "socials", "partnership"]);
    for (const key of EXECUTIVE_SENDER_KEYS) {
      expect(allowed).not.toContain(key);
    }
  });

  it("grants the executive identities only with their own capability", () => {
    const allowed = allowedBroadcastSenderKeys([
      "communications.manage",
      "communications.send_as_executive",
    ]);

    expect(allowed).toContain("ceo");
    expect(allowed).toContain("cto");
  });

  it("gives an admin without the communications capability nothing", () => {
    expect(allowedBroadcastSenderKeys(["moderation.manage"])).toEqual([]);
    expect(allowedBroadcastSenderKeys([])).toEqual([]);
  });

  it("knows which identities are executive", () => {
    expect(isExecutiveSender("ceo")).toBe(true);
    expect(isExecutiveSender("platform")).toBe(false);
  });
});

describe("composer sender options", () => {
  it("lists all five identities and marks the ones this admin cannot use", () => {
    const options = buildBroadcastSenderOptions(["communications.manage"]);

    expect(options).toHaveLength(5);
    expect(options.map((option) => option.key)).toContain("ceo");
    expect(options.find((option) => option.key === "ceo")?.allowed).toBe(false);
    expect(options.find((option) => option.key === "platform")?.allowed).toBe(true);
  });

  it("carries the resolved address and reply behaviour", () => {
    const options = buildBroadcastSenderOptions(["admin.full"]);
    const platform = options.find((option) => option.key === "platform");

    expect(platform?.name).toBe("Indegenius");
    expect(platform?.address).toBe("indegenius@indegenius.africa");
    expect(platform?.replyable).toBe(false);
  });

  it("defaults to the first identity the admin is allowed to use", () => {
    expect(defaultSenderKey(buildBroadcastSenderOptions(["admin.full"]))).toBe(
      "platform"
    );
    expect(defaultSenderKey(buildBroadcastSenderOptions([]))).toBeNull();
  });
});

describe("audiences", () => {
  it("offers the six initial audiences", () => {
    expect(BROADCAST_AUDIENCES.map((audience) => audience.key)).toEqual([
      "all",
      "active",
      "authors",
      "verified",
      "new",
      "selected",
    ]);
  });

  it("resolves an audience by key", () => {
    const audience = getBroadcastAudience("all");

    expect(audience.label).toBe("All eligible users");
    expect(audience.isStanding).toBe(true);
  });

  it("treats selected users as a hand-picked list rather than a standing one", () => {
    expect(getBroadcastAudience("selected").isStanding).toBe(false);
    expect(STANDING_AUDIENCE_KEYS).not.toContain("selected");
  });

  it("carries no baked-in recipient counts", () => {
    // Counts come from broadcast_contacts at request time. A number in source
    // is a number that goes quietly wrong, and this audience model used to
    // carry five of them.
    for (const audience of BROADCAST_AUDIENCES) {
      expect(audience).not.toHaveProperty("estimatedRecipients");
    }
  });

  it("provisions a Resend segment for exactly the standing audiences", () => {
    expect(STANDING_AUDIENCE_KEYS).toEqual([
      "all",
      "active",
      "authors",
      "verified",
      "new",
    ]);
  });

  it("refuses an audience that does not exist", () => {
    expect(() =>
      getBroadcastAudience("everyone" as BroadcastAudienceKey)
    ).toThrow(/Unknown broadcast audience/);
  });
});

describe("broadcast statuses", () => {
  it("draws a pill for every status the send path can write", () => {
    // claimForSend writes 'queued', which the first version of this model had
    // no entry for, so the pill read undefined.className and threw.
    for (const status of [
      "draft",
      "queued",
      "sending",
      "sent",
      "failed",
    ] as const) {
      expect(BROADCAST_STATUS_META[status]?.label).toBeTruthy();
    }
  });

  it("freezes a broadcast once a send has claimed it", () => {
    expect(isBroadcastEditable("draft")).toBe(true);
    expect(isBroadcastEditable("failed")).toBe(true);
    expect(isBroadcastEditable("queued")).toBe(false);
    expect(isBroadcastEditable("sending")).toBe(false);
    expect(isBroadcastEditable("sent")).toBe(false);
  });
});

describe("subject guidance", () => {
  it("counts without complaining about a workable subject", () => {
    const guidance = subjectGuidance("Building the next chapter of Indegenius");

    expect(guidance.length).toBe(39);
    expect(guidance.isLong).toBe(false);
  });

  it("warns once a subject passes what an inbox will show", () => {
    const guidance = subjectGuidance("x".repeat(61));

    expect(guidance.isLong).toBe(true);
    expect(guidance.note).toMatch(/cut off/);
  });

  it("stays quiet on an empty subject", () => {
    expect(subjectGuidance("").isLong).toBe(false);
  });
});

describe("formatting", () => {
  it("groups recipient counts", () => {
    expect(formatRecipientCount(12482)).toBe("12,482");
  });

  it("writes dates the way the broadcast list reads them", () => {
    expect(formatBroadcastDate("2026-09-02T12:00:00Z")).toBe("2 Sep 2026");
  });
});
