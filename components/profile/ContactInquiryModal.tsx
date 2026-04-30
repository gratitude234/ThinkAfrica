"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackActivationEvent } from "@/lib/activationEvents";

interface ContactInquiryModalProps {
  talentProfileId: string;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  source?: string;
}

export default function ContactInquiryModal({
  talentProfileId,
  open,
  onClose,
  onSent,
  source = "profile",
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

  useEffect(() => {
    if (!open) return;
    trackActivationEvent({
      event: "opportunity_inquiry_started",
      metadata: {
        talentProfileId,
        source,
      },
    });
  }, [open, source, talentProfileId]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const message = inquiry.message.trim();
    if (message.length < 40) {
      setError("Add a substantive message so the student can evaluate the opportunity.");
      return;
    }

    setSending(true);

    const composedMessage = [
      inquiry.role_title.trim()
        ? `Role/opportunity: ${inquiry.role_title.trim()}`
        : null,
      inquiry.opportunity_type ? `Opportunity type: ${inquiry.opportunity_type}` : null,
      `Message: ${message}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const supabase = createClient();
    const { error: insertError } = await supabase.from("talent_inquiries").insert([
      {
        talent_id: talentProfileId,
        organization_name: inquiry.organization_name.trim(),
        contact_email: inquiry.contact_email.trim(),
        message: composedMessage,
      },
    ]);

    setSending(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    trackActivationEvent({
      event: "opportunity_inquiry_submitted",
      metadata: {
        talentProfileId,
        source,
        opportunityType: inquiry.opportunity_type || null,
        messageLength: message.length,
      },
    });

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
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        {sent ? (
          <div>
            <h3
              id="opportunity-inquiry-title"
              className="text-lg font-semibold text-gray-900"
            >
              Inquiry sent
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              The student will see this as opportunity interest on their
              dashboard. Email delivery is not configured yet, so use your reply
              email in the message if you need a direct response.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 id="opportunity-inquiry-title" className="font-semibold text-gray-900">
              Contact about an opportunity
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Include the organization, role, reply email, and why this student
              is a relevant fit.
            </p>
          </>
        )}

        {!sent ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Organization *
            </label>
            <input
              required
              type="text"
              value={inquiry.organization_name}
              onChange={(event) =>
                setInquiry((current) => ({
                  ...current,
                  organization_name: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Reply email *
            </label>
            <input
              required
              type="email"
              value={inquiry.contact_email}
              onChange={(event) =>
                setInquiry((current) => ({
                  ...current,
                  contact_email: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Role or opportunity *
            </label>
            <input
              required
              type="text"
              value={inquiry.role_title}
              onChange={(event) =>
                setInquiry((current) => ({
                  ...current,
                  role_title: event.target.value,
                }))
              }
              placeholder="Research assistant, policy internship, fellowship..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Opportunity type *
            </label>
            <select
              required
              value={inquiry.opportunity_type}
              onChange={(event) =>
                setInquiry((current) => ({
                  ...current,
                  opportunity_type: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            >
              <option value="">Select a type</option>
              <option value="internship">Internship</option>
              <option value="research">Research project</option>
              <option value="fellowship">Fellowship</option>
              <option value="job">Job</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Message *
            </label>
            <textarea
              required
              rows={4}
              value={inquiry.message}
              onChange={(event) =>
                setInquiry((current) => ({
                  ...current,
                  message: event.target.value,
                }))
              }
              placeholder="Explain the opportunity, timeline, expected commitment, and why their work stood out."
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
            <p className="mt-1 text-xs text-gray-400">
              {inquiry.message.trim().length} / 40 characters minimum
            </p>
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
              className="px-3 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-emerald-brand px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
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
