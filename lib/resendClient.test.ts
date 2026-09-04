import { describe, expect, it } from "vitest";
import {
  ResendApiError,
  isResendDefinitiveRejection,
  isResendRateLimited,
  resendApiError,
} from "@/lib/resendClient";

/**
 * The classifier that decides whether a failed send is worth a second question.
 *
 * Getting this wrong in one direction leaves an admin locked out of a message
 * nobody received. Getting it wrong in the other direction sends us to ask
 * Resend a question we should not have asked, and the answer to that question
 * is the only thing that can unlock anything, so the cost of a false positive
 * is bounded. The tests hold both edges anyway.
 */

describe("recognising a definitive rejection", () => {
  it("accepts a validation rejection Resend answered with a 4xx", () => {
    const error = resendApiError("broadcasts.send", {
      message:
        "The audience contains an invalid contact: preview.lane03.1781075745@example.com",
      name: "validation_error",
      statusCode: 422,
    });

    expect(isResendDefinitiveRejection(error)).toBe(true);
  });

  it("accepts a named validation error carrying no status code", () => {
    // Older SDK payloads answer with a name and nothing else.
    const error = resendApiError("broadcasts.send", {
      message: "Invalid `from` field.",
      name: "validation_error",
    });

    expect(error.statusCode).toBeNull();
    expect(isResendDefinitiveRejection(error)).toBe(true);
  });

  it("refuses a rate limit, which means not now rather than not ever", () => {
    const error = resendApiError("broadcasts.send", {
      message: "Too many requests.",
      name: "rate_limit_exceeded",
      statusCode: 429,
    });

    expect(isResendRateLimited(error)).toBe(true);
    expect(isResendDefinitiveRejection(error)).toBe(false);
  });

  it("refuses the 4xx codes that also mean not now", () => {
    for (const statusCode of [408, 409, 425]) {
      const error = resendApiError("broadcasts.send", {
        message: "Try again.",
        name: "application_error",
        statusCode,
      });

      expect(isResendDefinitiveRejection(error)).toBe(false);
    }
  });

  it("refuses a 5xx, because the request may have landed anyway", () => {
    const error = resendApiError("broadcasts.send", {
      message: "Bad gateway.",
      name: "application_error",
      statusCode: 502,
    });

    expect(isResendDefinitiveRejection(error)).toBe(false);
  });

  it("refuses a transport failure that never reached Resend at all", () => {
    expect(isResendDefinitiveRejection(new Error("socket hang up"))).toBe(false);
    expect(isResendDefinitiveRejection("something")).toBe(false);
    expect(isResendDefinitiveRejection(null)).toBe(false);
  });

  it("refuses an unnamed error with no status code to read", () => {
    expect(
      isResendDefinitiveRejection(
        new ResendApiError("broadcasts.send", "Unknown failure.")
      )
    ).toBe(false);
  });
});
