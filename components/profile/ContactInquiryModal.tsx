"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ContactInquiryModalProps {
  talentProfileId: string;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}

export default function ContactInquiryModal({
  talentProfileId,
  open,
  onClose,
  onSent,
}: ContactInquiryModalProps) {
  const [inquiry, setInquiry] = useState({
    organization_name: "",
    contact_email: "",
    message: "",
  });
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);

    const supabase = createClient();
    await supabase.from("talent_inquiries").insert([
      {
        talent_id: talentProfileId,
        ...inquiry,
      },
    ]);

    setSending(false);
    setInquiry({ organization_name: "", contact_email: "", message: "" });
    onClose();
    onSent?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <h3 className="mb-4 font-semibold text-gray-900">Send an Inquiry</h3>
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
              Your Email *
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
              Message
            </label>
            <textarea
              rows={3}
              value={inquiry.message}
              onChange={(event) =>
                setInquiry((current) => ({
                  ...current,
                  message: event.target.value,
                }))
              }
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
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
      </div>
    </div>
  );
}
