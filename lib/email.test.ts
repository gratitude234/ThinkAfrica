import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND_PROMISE, BRAND_TAGLINE } from "@/lib/brand";
import { renderEmailShell, sendEmail } from "@/lib/email";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

describe("renderEmailShell brand contract", () => {
  it("carries the public promise and supporting Africa tagline", () => {
    const html = renderEmailShell({
      preview: "Preview",
      title: "Account update",
    });

    expect(html).toContain(BRAND_PROMISE);
    expect(html).toContain(BRAND_TAGLINE.replace("'", "&#39;"));
    expect(html).not.toContain("academic identity");
  });

  it("warns that the default platform footer is not a reply address", () => {
    const html = renderEmailShell({
      preview: "Preview",
      title: "Account update",
    });

    expect(html).toContain("This mailbox is not monitored, so replies will not reach us.");
  });

  it("lets a caller override the footer", () => {
    const html = renderEmailShell({
      preview: "Preview",
      title: "Confirm your account",
      footerNote: "Didn't request this? You can ignore this email.",
    });

    expect(html).not.toContain("not monitored");
  });
});

describe("sendEmail sender identity", () => {
  const baseInput = {
    to: "member@example.com",
    subject: "Subject",
    html: "<p>Body</p>",
    text: "Body",
    idempotencyKey: "test-key",
  };

  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-resend-key";
    delete process.env.EMAIL_FROM;
    sendMock.mockResolvedValue({ data: { id: "email-id" }, error: null });
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalEmailFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalEmailFrom;
  });

  it("sends as the platform identity when the caller names no sender", async () => {
    await sendEmail(baseInput);

    const payload = sendMock.mock.calls[0][0];
    expect(payload.from).toBe("Indegenius <indegenius@indegenius.africa>");
    expect(payload.replyTo).toBeUndefined();
  });

  it("ignores a legacy EMAIL_FROM address", async () => {
    process.env.EMAIL_FROM = "noreply@indegenius.africa";

    await sendEmail(baseInput);

    expect(sendMock.mock.calls[0][0].from).toBe(
      "Indegenius <indegenius@indegenius.africa>"
    );
  });

  it("sets a reply address for a replyable identity", async () => {
    await sendEmail({ ...baseInput, sender: "partnership" });

    const payload = sendMock.mock.calls[0][0];
    expect(payload.from).toBe("Indegenius Partnerships <partnership@indegenius.africa>");
    expect(payload.replyTo).toBe("partnership@indegenius.africa");
  });

  it("still skips cleanly when Resend is not configured", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail(baseInput);

    expect(result).toEqual({ skipped: true, reason: "missing_email_configuration" });
  });
});
