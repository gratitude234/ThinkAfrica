import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  validateContactRequest,
  CONTACT_FIELD_LIMITS,
  PER_EMAIL_DAILY_LIMIT,
  GLOBAL_BURST_LIMIT,
} = await import("@/lib/contactRequests");

/**
 * The one unauthenticated write in the application.
 *
 * Its RLS policy is `FOR INSERT WITH CHECK (true)`, so before Phase 2 the only
 * thing between the form and unlimited rows in `contact_requests` was
 * PostgREST's willingness to keep accepting them. There is no viewer to
 * authorize here and there never will be, so validation and rate limiting are
 * the entire security story.
 */

const valid = {
  name: "Ada Lovelace",
  organization: "Analytical Engines",
  email: "ada@example.org",
  message: "We would like to discuss a research partnership with Indegenius.",
};

describe("validateContactRequest", () => {
  it("accepts a well-formed submission", () => {
    const result = validateContactRequest(valid);
    expect(result).toEqual({ ok: true, value: { ...valid } });
  });

  it("returns exactly four fields, rebuilt rather than spread", () => {
    // A spread would carry an attacker-chosen key straight into the insert.
    const result = validateContactRequest({
      ...valid,
      id: "00000000-0000-0000-0000-000000000000",
      created_at: "1999-01-01T00:00:00.000Z",
      admin_note: "escalate me",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual([
      "email",
      "message",
      "name",
      "organization",
    ]);
  });

  it("requires each field to carry something", () => {
    expect(validateContactRequest({ ...valid, name: "   " })).toEqual({
      ok: false,
      error: "Add your name.",
    });
    expect(validateContactRequest({ ...valid, organization: "" })).toEqual({
      ok: false,
      error: "Add your organization.",
    });
    expect(validateContactRequest({ ...valid, message: "too short" })).toEqual({
      ok: false,
      error: "Add a message of at least 10 characters.",
    });
  });

  it("rejects an address that is not one", () => {
    for (const email of ["", "ada", "ada@", "@example.org", "ada@example", "a b@c.org"]) {
      expect(validateContactRequest({ ...valid, email }).ok, email).toBe(false);
    }
  });

  it("lower-cases the address, because it keys the per-address limit", () => {
    const result = validateContactRequest({ ...valid, email: "ADA@Example.ORG" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.email).toBe("ada@example.org");
  });

  it("truncates rather than accepting an unbounded payload", () => {
    const result = validateContactRequest({
      ...valid,
      message: "x".repeat(50_000),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toHaveLength(CONTACT_FIELD_LIMITS.message);
    }
  });

  it("strips control characters from every field", () => {
    const result = validateContactRequest({
      ...valid,
      name: `Ada${String.fromCharCode(0)}${String.fromCharCode(27)}Lovelace`,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("AdaLovelace");
  });

  it("collapses line breaks in single-line fields, so a name cannot forge structure", () => {
    // These values are read back in an admin list and later in an email. A
    // name containing newlines is either a mistake or an attempt to fake
    // headers or extra fields in that output.
    const result = validateContactRequest({
      ...valid,
      name: "Ada\nFrom: attacker@example.net\nLovelace",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).not.toContain("\n");
  });

  it("keeps line breaks in the message, which is prose", () => {
    const result = validateContactRequest({
      ...valid,
      message: "First paragraph.\n\nSecond paragraph, with detail.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.message).toContain("\n");
  });

  it("refuses a non-object body without throwing", () => {
    for (const body of [null, undefined, "a string", 42, []]) {
      const result = validateContactRequest(body);
      // An array is an object, so it reaches the field checks and fails there.
      expect(result.ok).toBe(false);
    }
  });

  it("refuses fields that are not strings", () => {
    expect(validateContactRequest({ ...valid, name: { toString: () => "Ada" } }).ok).toBe(
      false
    );
    expect(validateContactRequest({ ...valid, email: 12345 }).ok).toBe(false);
  });
});

describe("the limits", () => {
  it("are tight enough to matter and loose enough not to block a real enquiry", () => {
    expect(PER_EMAIL_DAILY_LIMIT).toBeGreaterThanOrEqual(1);
    expect(PER_EMAIL_DAILY_LIMIT).toBeLessThanOrEqual(5);
    expect(GLOBAL_BURST_LIMIT).toBeGreaterThan(PER_EMAIL_DAILY_LIMIT);
  });
});
