import { BRAND_NAME } from "@/lib/brand";
import { APP_DOMAIN } from "@/lib/site";

/**
 * The approved Indegenius sending identities. Every outbound email resolves to
 * exactly one of these, so the sender list lives here rather than in an env var
 * that anyone can point at an address the architecture never approved.
 */
export const EMAIL_SENDER_KEYS = [
  "platform",
  "socials",
  "partnership",
  "ceo",
  "cto",
] as const;

export type EmailSenderKey = (typeof EMAIL_SENDER_KEYS)[number];

/** Callers that say nothing send as the platform itself. */
export const DEFAULT_EMAIL_SENDER: EmailSenderKey = "platform";

export type EmailSender = {
  key: EmailSenderKey;
  name: string;
  address: string;
  replyable: boolean;
  footerNote: string;
};

// Automated platform mail can move to its own sending domain later so its
// volume cannot spend the reputation the human addresses depend on. Splitting
// the two scopes here means that move is an env var, not a call site edit.
type SenderDomainScope = "platform" | "human";

type SenderDefinition = {
  name: string;
  localPart: string;
  replyable: boolean;
  footerNote: string;
  domainScope: SenderDomainScope;
};

const ACCOUNT_FOOTER_NOTE = `You are receiving this because you have an ${BRAND_NAME} account. Manage email preferences in your notification settings.`;

const UNMONITORED_FOOTER_NOTE = `This mailbox is not monitored, so replies will not reach us. ${ACCOUNT_FOOTER_NOTE}`;

const SENDER_DEFINITIONS: Record<EmailSenderKey, SenderDefinition> = {
  platform: {
    name: BRAND_NAME,
    localPart: "indegenius",
    replyable: false,
    footerNote: UNMONITORED_FOOTER_NOTE,
    domainScope: "platform",
  },
  socials: {
    name: `${BRAND_NAME} Socials`,
    localPart: "socials",
    replyable: true,
    footerNote: ACCOUNT_FOOTER_NOTE,
    domainScope: "human",
  },
  partnership: {
    name: `${BRAND_NAME} Partnerships`,
    localPart: "partnership",
    replyable: true,
    footerNote: ACCOUNT_FOOTER_NOTE,
    domainScope: "human",
  },
  ceo: {
    name: `Oluwaferanmi from ${BRAND_NAME}`,
    localPart: "oluwaferanmi",
    replyable: true,
    footerNote: ACCOUNT_FOOTER_NOTE,
    domainScope: "human",
  },
  cto: {
    name: `Gratitude from ${BRAND_NAME}`,
    localPart: "gratitude",
    replyable: true,
    footerNote: ACCOUNT_FOOTER_NOTE,
    domainScope: "human",
  },
};

function normalizeDomain(value: string | undefined) {
  if (!value) return null;
  const trimmed = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Domain for the human and institutional mailboxes. */
function humanSenderDomain() {
  return normalizeDomain(process.env.EMAIL_SENDER_DOMAIN) ?? APP_DOMAIN;
}

/**
 * Domain for automated platform mail. Falls back to the human domain, so today
 * all five identities sit on indegenius.africa and a future split needs only
 * EMAIL_PLATFORM_SENDER_DOMAIN.
 */
function platformSenderDomain() {
  return normalizeDomain(process.env.EMAIL_PLATFORM_SENDER_DOMAIN) ?? humanSenderDomain();
}

function senderDomain(scope: SenderDomainScope) {
  return scope === "platform" ? platformSenderDomain() : humanSenderDomain();
}

export function isEmailSenderKey(value: unknown): value is EmailSenderKey {
  return (
    typeof value === "string" &&
    (EMAIL_SENDER_KEYS as readonly string[]).includes(value)
  );
}

export function getEmailSender(key: EmailSenderKey): EmailSender {
  const definition = SENDER_DEFINITIONS[key];

  return {
    key,
    name: definition.name,
    address: `${definition.localPart}@${senderDomain(definition.domainScope)}`,
    replyable: definition.replyable,
    footerNote: definition.footerNote,
  };
}

/** Resolves an optional sender key, defaulting to the platform identity. */
export function resolveEmailSender(key?: EmailSenderKey): EmailSender {
  return getEmailSender(isEmailSenderKey(key) ? key : DEFAULT_EMAIL_SENDER);
}

function formatDisplayName(name: string) {
  // A bare display name is only legal while it stays inside the atom charset,
  // so anything else gets quoted the way RFC 5322 expects.
  if (/^[A-Za-z0-9 ]+$/.test(name)) return name;
  return `"${name.replace(/[\\"]/g, (character) => `\\${character}`)}"`;
}

/** Builds the From header value, for example: Indegenius <indegenius@indegenius.africa> */
export function formatEmailSenderFrom(sender: EmailSender) {
  return `${formatDisplayName(sender.name)} <${sender.address}>`;
}

/** Replyable identities reply to themselves. The platform address takes none. */
export function emailSenderReplyTo(sender: EmailSender) {
  return sender.replyable ? sender.address : undefined;
}
