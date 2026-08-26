"use client";

import { useEffect, useState } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";
import { OPPORTUNITY_TYPES, OPPORTUNITY_LABELS } from "@/lib/opportunities";
import {
  trackProfileFunnelEvent,
  type ProfileFunnelSurface,
  type ProfileViewerState,
} from "@/lib/profileFunnel";
import { submitOpportunityInquiry } from "./opportunityInquiryActions";

/**
 * The shortest message the server action will accept. Stated here so the form
 * rejects a too-short message where the writer can still see the field,
 * rather than after a round trip.
 */
const MIN_INQUIRY_MESSAGE_LENGTH = 40;

interface ContactInquiryModalProps {
  talentProfileId: string;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  source?: string;
  /**
   * Present when this modal was opened from a public profile, which makes it
   * the terminal step of the profile funnel. Absent elsewhere, so no other
   * caller starts emitting profile events.
   */
  funnel?: {
    profileId: string;
    viewerState: ProfileViewerState;
    surface: ProfileFunnelSurface;
  } | null;
}

export default function ContactInquiryModal({
  talentProfileId,
  open,
  onClose,
  onSent,
  source = "profile",
  funnel = null,
}: ContactInquiryModalProps) {
  const [inquiry, setInquiry] = useState({
    organization_name: "",
    contact_email: "",
    opportunity_type: "",
    role_title: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Read as three primitives rather than as the object, which callers build
  // inline: an object literal is a new identity on every parent render, so
  // depending on it would re-announce the same opened modal on every keystroke
  // the parent re-rendered through.
  const funnelProfileId = funnel?.profileId ?? null;
  const funnelViewerState = funnel?.viewerState ?? null;
  const funnelSurface = funnel?.surface ?? null;

  useEffect(() => {
    if (!open) return;
    trackActivationEvent({
      event: "opportunity_inquiry_started",
      metadata: {
        talentProfileId,
        source,
      },
    });
    if (funnelProfileId && funnelViewerState && funnelSurface) {
      trackProfileFunnelEvent({
        event: "profile_inquiry_opened",
        profileId: funnelProfileId,
        viewerState: funnelViewerState,
        surface: funnelSurface,
      });
    }
  }, [
    funnelProfileId,
    funnelSurface,
    funnelViewerState,
    open,
    source,
    talentProfileId,
  ]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const message = inquiry.message.trim();
    if (message.length < MIN_INQUIRY_MESSAGE_LENGTH) {
      setError(
        `Describe the opportunity and why you are reaching out, in at least ${MIN_INQUIRY_MESSAGE_LENGTH} characters.`
      );
      return;
    }

    setSending(true);

    const result = await submitOpportunityInquiry({
      talentProfileId,
      organizationName: inquiry.organization_name,
      contactEmail: inquiry.contact_email,
      opportunityType: inquiry.opportunity_type,
      roleTitle: inquiry.role_title,
      // This form asks for one message rather than separate timeline and
      // commitment fields, so they are omitted rather than sent empty.
      fitReason: message,
      message,
    });

    setSending(false);

    if (!result.ok) {
      setError(result.error ?? "Unable to send inquiry.");
      return;
    }

    trackActivationEvent({
      event: "opportunity_inquiry_submitted",
      metadata: {
        talentProfileId,
        source,
        opportunityType: inquiry.opportunity_type || null,
        fitReasonLength: message.length,
        messageLength: message.length,
      },
    });

    // After the server confirmed the insert, so the funnel's last step counts
    // inquiries the author will actually receive rather than send attempts.
    if (funnelProfileId && funnelViewerState && funnelSurface) {
      trackProfileFunnelEvent({
        event: "profile_inquiry_submitted",
        profileId: funnelProfileId,
        viewerState: funnelViewerState,
        surface: funnelSurface,
      });
    }

    setSent(true);
    setInquiry({
      organization_name: "",
      contact_email: "",
      opportunity_type: "",
      role_title: "",
      message: "",
    });
    onSent?.();
  };

  const closeModal = () => {
    setError(null);
    setSent(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="opportunity-inquiry-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-card-border bg-card p-6 shadow-xl"
      >
        {sent ? (
          <div>
            <h3
              id="opportunity-inquiry-title"
              className="text-lg font-semibold text-ink"
            >
              Inquiry sent
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              The contributor will see this in their dashboard and notifications.
              Your reply email is included so they can follow up directly.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37]"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 id="opportunity-inquiry-title" className="font-semibold text-ink">
              Contact about an opportunity
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              Include the organization, role, reply email, and why this contributor
              is a relevant fit.
            </p>
          </>
        )}

        {!sent ? (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="inquiry-organization"
                className="mb-1 block text-sm font-medium text-ink-soft"
              >
                Organization *
              </label>
              <input
                id="inquiry-organization"
                required
                type="text"
                value={inquiry.organization_name}
                onChange={(event) =>
                  setInquiry((current) => ({
                    ...current,
                    organization_name: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-card-border px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
              />
            </div>
            <div>
              <label
                htmlFor="inquiry-email"
                className="mb-1 block text-sm font-medium text-ink-soft"
              >
                Reply email *
              </label>
              <input
                id="inquiry-email"
                required
                type="email"
                value={inquiry.contact_email}
                onChange={(event) =>
                  setInquiry((current) => ({
                    ...current,
                    contact_email: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-card-border px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="inquiry-role"
                className="mb-1 block text-sm font-medium text-ink-soft"
              >
                Role or opportunity *
              </label>
              <input
                id="inquiry-role"
                required
                type="text"
                value={inquiry.role_title}
                onChange={(event) =>
                  setInquiry((current) => ({
                    ...current,
                    role_title: event.target.value,
                  }))
                }
                placeholder="Research assistant, fellowship..."
                className="w-full rounded-lg border border-card-border px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
              />
            </div>
            <div>
              <label
                htmlFor="inquiry-type"
                className="mb-1 block text-sm font-medium text-ink-soft"
              >
                Type *
              </label>
              <select
                id="inquiry-type"
                required
                value={inquiry.opportunity_type}
                onChange={(event) =>
                  setInquiry((current) => ({
                    ...current,
                    opportunity_type: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-card-border px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
              >
                <option value="">Select a type</option>
                {OPPORTUNITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {OPPORTUNITY_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="inquiry-message"
              className="mb-1 block text-sm font-medium text-ink-soft"
            >
              Message *
            </label>
            <textarea
              id="inquiry-message"
              required
              rows={5}
              value={inquiry.message}
              onChange={(event) =>
                setInquiry((current) => ({
                  ...current,
                  message: event.target.value,
                }))
              }
              placeholder="Describe the opportunity, timeline, commitment expected, and why this contributor's work caught your attention."
              className="w-full resize-none rounded-lg border border-card-border px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink-soft"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-emerald-brand px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
        ) : null}
      </div>
    </div>
  );
}
