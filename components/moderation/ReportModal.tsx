"use client";

import { useState } from "react";
import { submitReport } from "@/components/moderation/reportActions";
import {
  REPORT_REASONS,
  type ReportReason,
  type ReportTargetType,
} from "@/components/moderation/reportReasons";

interface ReportModalProps {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  open: boolean;
  onClose: () => void;
}

const TARGET_TITLES: Record<ReportTargetType, string> = {
  post: "Report this post",
  comment: "Report this comment",
  user: "Report this user",
};

export default function ReportModal({
  targetType,
  targetId,
  targetLabel,
  open,
  onClose,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!reason) {
      setError("Choose a reason for this report.");
      return;
    }

    setSending(true);
    const result = await submitReport({
      targetType,
      targetId,
      reason,
      details,
    });
    setSending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSent(true);
  };

  const closeModal = () => {
    setReason(null);
    setDetails("");
    setError(null);
    setSent(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        {sent ? (
          <div>
            <h3 id="report-modal-title" className="text-lg font-semibold text-gray-900">
              Report submitted
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Thanks for helping keep Indegenius safe. Our team will review this
              report and take action if it breaks our guidelines.
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
            <h3 id="report-modal-title" className="font-semibold text-gray-900">
              {TARGET_TITLES[targetType]}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Reporting {targetLabel}. Your report is confidential.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <fieldset className="space-y-1.5">
                <legend className="mb-1 block text-sm font-medium text-gray-700">
                  Why are you reporting this?
                </legend>
                {REPORT_REASONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      reason === option.value
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-gray-200 text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={option.value}
                      checked={reason === option.value}
                      onChange={() => setReason(option.value)}
                      className="h-3.5 w-3.5 accent-emerald-600"
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Details <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="Anything that helps our team understand the problem."
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
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
                  className="px-3 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {sending ? "Submitting..." : "Submit report"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
