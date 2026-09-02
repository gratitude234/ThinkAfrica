import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_SENDER,
  EMAIL_SENDER_KEYS,
  emailSenderReplyTo,
  formatEmailSenderFrom,
  getEmailSender,
  isEmailSenderKey,
  resolveEmailSender,
  type EmailSenderKey,
} from "@/lib/emailSenders";

const DOMAIN_ENV_KEYS = ["EMAIL_SENDER_DOMAIN", "EMAIL_PLATFORM_SENDER_DOMAIN"] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of DOMAIN_ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of DOMAIN_ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

describe("approved sender identities", () => {
  it("exposes exactly the five identities from the email architecture", () => {
    expect([...EMAIL_SENDER_KEYS]).toEqual([
      "platform",
      "socials",
      "partnership",
      "ceo",
      "cto",
    ]);
  });

  it("maps every key to its approved address", () => {
    expect(EMAIL_SENDER_KEYS.map((key) => getEmailSender(key).address)).toEqual([
      "indegenius@indegenius.africa",
      "socials@indegenius.africa",
      "partnership@indegenius.africa",
      "oluwaferanmi@indegenius.africa",
      "gratitude@indegenius.africa",
    ]);
  });

  it("recognises approved keys and rejects anything else", () => {
    expect(isEmailSenderKey("partnership")).toBe(true);
    expect(isEmailSenderKey("marketing")).toBe(false);
    expect(isEmailSenderKey(undefined)).toBe(false);
  });
});

describe("default sender", () => {
  it("is the platform identity", () => {
    expect(DEFAULT_EMAIL_SENDER).toBe("platform");
  });

  it("resolves to the platform identity when a caller says nothing", () => {
    expect(resolveEmailSender().key).toBe("platform");
    expect(resolveEmailSender(undefined).address).toBe("indegenius@indegenius.africa");
  });

  it("falls back to the platform identity for an unapproved key", () => {
    expect(resolveEmailSender("marketing" as EmailSenderKey).key).toBe("platform");
  });
});

describe("sender formatting", () => {
  it("renders the platform From header", () => {
    expect(formatEmailSenderFrom(getEmailSender("platform"))).toBe(
      "Indegenius <indegenius@indegenius.africa>"
    );
  });

  it("keeps the personal sender identities the architecture specifies", () => {
    expect(formatEmailSenderFrom(getEmailSender("ceo"))).toBe(
      "Oluwaferanmi from Indegenius <oluwaferanmi@indegenius.africa>"
    );
    expect(formatEmailSenderFrom(getEmailSender("cto"))).toBe(
      "Gratitude from Indegenius <gratitude@indegenius.africa>"
    );
  });

  it("names the institutional channels", () => {
    expect(formatEmailSenderFrom(getEmailSender("socials"))).toBe(
      "Indegenius Socials <socials@indegenius.africa>"
    );
    expect(formatEmailSenderFrom(getEmailSender("partnership"))).toBe(
      "Indegenius Partnerships <partnership@indegenius.africa>"
    );
  });
});

describe("replyable identities", () => {
  it("gives the platform sender no reply address", () => {
    const platform = getEmailSender("platform");
    expect(platform.replyable).toBe(false);
    expect(emailSenderReplyTo(platform)).toBeUndefined();
  });

  it("replies to itself for every human and institutional identity", () => {
    for (const key of ["socials", "partnership", "ceo", "cto"] as const) {
      const sender = getEmailSender(key);
      expect(sender.replyable).toBe(true);
      expect(emailSenderReplyTo(sender)).toBe(sender.address);
    }
  });

  it("tells the reader the platform mailbox is unmonitored", () => {
    expect(getEmailSender("platform").footerNote).toContain("not monitored");
    expect(getEmailSender("ceo").footerNote).not.toContain("not monitored");
  });
});

describe("configurable sending domains", () => {
  it("moves the platform sender without touching the human identities", () => {
    process.env.EMAIL_PLATFORM_SENDER_DOMAIN = "mail.indegenius.africa";

    expect(getEmailSender("platform").address).toBe("indegenius@mail.indegenius.africa");
    expect(getEmailSender("ceo").address).toBe("oluwaferanmi@indegenius.africa");
  });

  it("moves every identity when only the shared domain is set", () => {
    process.env.EMAIL_SENDER_DOMAIN = "indegenius.test";

    expect(getEmailSender("platform").address).toBe("indegenius@indegenius.test");
    expect(getEmailSender("partnership").address).toBe("partnership@indegenius.test");
  });

  it("tolerates a domain pasted with a protocol or a trailing slash", () => {
    process.env.EMAIL_PLATFORM_SENDER_DOMAIN = "https://Mail.Indegenius.Africa/";

    expect(getEmailSender("platform").address).toBe("indegenius@mail.indegenius.africa");
  });
});
