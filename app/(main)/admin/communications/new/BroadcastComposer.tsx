"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EmailSenderKey } from "@/lib/emailSenders";
import { buildBroadcastEmailHtml, isBroadcastBodyEmpty } from "@/lib/broadcastEmail";
import {
  BROADCAST_AUDIENCES,
  findSenderOption,
  formatRecipientCount,
  getBroadcastAudience,
  subjectGuidance,
  type BroadcastAudienceKey,
  type BroadcastSenderOption,
} from "@/lib/broadcasts";
import {
  dispatchBroadcast,
  refreshAudienceCount,
  saveBroadcastDraft,
  sendBroadcastTest,
} from "../actions";
import BroadcastEditor from "./BroadcastEditor";
import EmailPreview from "./EmailPreview";
import FieldSelect from "./FieldSelect";
import Modal from "./Modal";

type Stage = "compose" | "sending" | "sent";
type OpenModal = "test" | "preview" | "confirm" | null;
type SaveState = "clean" | "saving" | "saved" | "error" | "locked";

export type SelectableRecipient = {
  id: string;
  name: string;
  handle: string;
  detail: string;
};

/** A draft reopened for editing, as the composer needs it. */
export type ComposerDraft = {
  id: string;
  subject: string;
  previewText: string;
  bodyHtml: string;
  senderKey: EmailSenderKey;
  audienceKey: BroadcastAudienceKey;
  selectedProfileIds: string[];
  statusNote?: string;
};

/** Above this, a send gets an explicit acknowledgement rather than one click. */
const ACKNOWLEDGEMENT_THRESHOLD = 500;

const AUTOSAVE_DELAY_MS = 900;

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-5 sm:px-6">
      <span className="w-14 shrink-0 pt-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-5">
      <dt className="w-24 shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
        {label}
      </dt>
      <dd className="min-w-0 text-sm font-medium leading-6 text-ink">{value}</dd>
    </div>
  );
}

export default function BroadcastComposer({
  senderOptions,
  initialSenderKey,
  defaultTestRecipient,
  audienceCounts,
  selectableRecipients,
  recipientsStale,
  draft,
}: {
  senderOptions: BroadcastSenderOption[];
  initialSenderKey: EmailSenderKey;
  defaultTestRecipient: string;
  audienceCounts: Record<BroadcastAudienceKey, number>;
  selectableRecipients: SelectableRecipient[];
  recipientsStale: boolean;
  /** Present when an existing draft was reopened rather than a new one started. */
  draft?: ComposerDraft;
}) {
  const [stage, setStage] = useState<Stage>("compose");
  const [openModal, setOpenModal] = useState<OpenModal>(null);

  const [senderKey, setSenderKey] = useState<EmailSenderKey>(
    draft?.senderKey ?? initialSenderKey
  );
  const [audienceKey, setAudienceKey] = useState<BroadcastAudienceKey>(
    draft?.audienceKey ?? "all"
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(
    draft?.selectedProfileIds ?? []
  );
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [previewText, setPreviewText] = useState(draft?.previewText ?? "");
  const [bodyHtml, setBodyHtml] = useState(draft?.bodyHtml || "<p></p>");

  const [broadcastId, setBroadcastId] = useState<string | null>(draft?.id ?? null);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [testRecipient, setTestRecipient] = useState(defaultTestRecipient);
  const [testSentTo, setTestSentTo] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testPending, setTestPending] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [sending, setSending] = useState(false);

  const hasEditedRef = useRef(false);
  const broadcastIdRef = useRef<string | null>(draft?.id ?? null);
  const savingRef = useRef(false);
  // Set when an edit lands while a save is already in flight. Without it the
  // last keystroke before a slow save is silently dropped.
  const dirtyRef = useRef(false);

  const sender = findSenderOption(senderOptions, senderKey) ?? senderOptions[0];
  const audience = getBroadcastAudience(audienceKey);
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const recipientCount =
    audienceKey === "selected"
      ? (selectedCount ?? selectedIds.length)
      : (audienceCounts[audienceKey] ?? 0);

  const guidance = subjectGuidance(subject);
  const hasBody = !isBroadcastBodyEmpty(bodyHtml);
  const canReview = subject.trim().length > 0 && hasBody && recipientCount > 0;
  const needsAcknowledgement = recipientCount > ACKNOWLEDGEMENT_THRESHOLD;

  const emailHtml = useMemo(
    () =>
      buildBroadcastEmailHtml({
        subject: subject.trim() || "Untitled broadcast",
        previewText,
        bodyHtml,
        senderKey,
      }),
    [subject, previewText, bodyHtml, senderKey]
  );

  const persistDraft = useCallback(async () => {
    // A save is already in flight. Mark the work outstanding rather than
    // dropping it: the in-flight save will run again with the newer state.
    if (savingRef.current) {
      dirtyRef.current = true;
      return;
    }

    savingRef.current = true;
    setSaveState("saving");

    const result = await saveBroadcastDraft({
      broadcastId: broadcastIdRef.current,
      subject,
      previewText,
      bodyHtml,
      senderKey,
      audienceKey,
      selectedProfileIds: selectedIds,
    });

    savingRef.current = false;

    if (!result.ok) {
      setSaveState("error");
      setSendError(result.error);
      return;
    }

    broadcastIdRef.current = result.broadcastId;
    setBroadcastId(result.broadcastId);

    if (result.locked) {
      // The row is no longer editable, which means a send claimed it. Saying
      // "saved" here would tell the admin their edit went somewhere it did not.
      setSaveState("locked");
      return;
    }

    setSaveState("saved");
  }, [subject, previewText, bodyHtml, senderKey, audienceKey, selectedIds]);

  // Autosave, kept deliberately quiet. The draft is a real row from the first
  // keystroke, so the composer has something to send and something to return to.
  useEffect(() => {
    if (!hasEditedRef.current) return;
    const timer = setTimeout(() => {
      void (async () => {
        await persistDraft();
        // Catch up on anything typed while that save was in the air.
        if (dirtyRef.current) {
          dirtyRef.current = false;
          await persistDraft();
        }
      })();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [persistDraft]);

  // The eligible size of a hand-picked list is a server question: somebody
  // ticked may have opted out since the page loaded. Counted rather than
  // assumed, so the confirmation dialog states the number that will be written
  // to rather than the number of boxes ticked.
  useEffect(() => {
    if (audienceKey !== "selected") {
      setSelectedCount(null);
      return;
    }
    if (selectedIds.length === 0) {
      setSelectedCount(0);
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await refreshAudienceCount("selected", selectedIds);
      if (!cancelled && result.ok) setSelectedCount(result.count);
    })();

    return () => {
      cancelled = true;
    };
  }, [audienceKey, selectedIds]);

  // The progress bar climbs while the send request is in flight and stops
  // short of the end, because the end is the server answering, not a timer.
  useEffect(() => {
    if (stage !== "sending") return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setProgress(Math.min(0.9, elapsed / 2600));
    }, 60);
    return () => clearInterval(timer);
  }, [stage]);

  function markEdited() {
    hasEditedRef.current = true;
  }

  async function confirmSend() {
    // A second click while the first is in flight must not reach the server.
    // The claim on the server is the real guard; this only spares the round
    // trip and keeps the progress screen honest.
    if (sending) return;
    setSending(true);
    setOpenModal(null);
    setSendError(null);

    try {
      // Flush any pending edit so the row that gets sent is the row on screen.
      await persistDraft();
      if (dirtyRef.current) {
        dirtyRef.current = false;
        await persistDraft();
      }

      const id = broadcastIdRef.current;

      if (!id) {
        setSendError("The draft could not be saved, so it was not sent.");
        return;
      }

      setProgress(0);
      setStage("sending");

      const result = await dispatchBroadcast(id);

      if (!result.ok) {
        setStage("compose");
        setSendError(result.error);
        return;
      }

      setProgress(1);
      setSentCount(result.recipientCount);
      setStage("sent");
    } finally {
      setSending(false);
    }
  }

  if (stage === "sending") {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand">
          Communications
        </p>
        <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight text-ink">
          Sending your broadcast
        </h1>
        <p className="mt-2 truncate text-sm text-gray-500">{subject}</p>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="mt-9 h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
        >
          <div
            className="h-full rounded-full bg-emerald-brand transition-[width] duration-100 ease-linear"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="mt-3 text-xs tabular-nums text-gray-400">
          Handing {formatRecipientCount(recipientCount)} recipients to the mail
          provider
        </p>
        <p className="mt-8 text-xs leading-5 text-gray-400">
          Delivery continues even if you leave this page.
        </p>
      </div>
    );
  }

  if (stage === "sent") {
    return (
      <div className="mx-auto max-w-xl py-14">
        <div className="rounded-xl border border-green-wash-border bg-green-wash px-6 py-10 text-center sm:px-10">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-brand text-white">
            <CheckIcon />
          </span>
          <h1 className="font-display mt-5 text-2xl font-semibold tracking-tight text-ink">
            Broadcast sent
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-gray-600">
            <span className="font-medium text-ink">{subject}</span> is being
            delivered to {formatRecipientCount(sentCount)} recipients.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href={`/admin/communications/${broadcastId}`}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
            >
              View broadcast
            </Link>
            <Link
              href="/admin/communications"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-canvas"
            >
              Return to Communications
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="sticky top-[var(--app-sticky-offset)] z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/admin/communications"
            className="text-xs font-medium text-gray-500 transition-colors hover:text-emerald-brand"
          >
            Communications
          </Link>
          <span aria-hidden="true" className="text-gray-300">
            /
          </span>
          <span className="text-xs font-medium text-ink">
            {draft ? "Edit broadcast" : "New broadcast"}
          </span>
          {saveState === "clean" ? null : (
            <span
              aria-live="polite"
              className={`ml-1 hidden text-xs sm:inline ${
                saveState === "error" || saveState === "locked"
                  ? "text-red-600"
                  : "text-gray-400"
              }`}
            >
              {saveState === "saving"
                ? "Saving"
                : saveState === "error"
                  ? "Not saved"
                  : saveState === "locked"
                    ? "Locked"
                    : "Saved"}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpenModal("test")}
            className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-canvas"
          >
            Send test
          </button>
          <button
            type="button"
            onClick={() => setOpenModal("preview")}
            className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-canvas"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={!canReview || sending || saveState === "locked"}
            onClick={() => setOpenModal("confirm")}
            className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Review and send
          </button>
        </div>
      </div>

      {sendError ? (
        <p
          role="alert"
          className="mx-auto max-w-[720px] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
        >
          {sendError}
        </p>
      ) : null}

      {saveState === "locked" ? (
        <p
          role="alert"
          className="mx-auto max-w-[720px] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
        >
          This broadcast has been handed to the mail provider, so it can no
          longer be edited. Your recent changes were not saved.{" "}
          <Link
            href={`/admin/communications/${broadcastId}`}
            className="font-semibold underline"
          >
            Open the record
          </Link>{" "}
          to see where its delivery got to.
        </p>
      ) : null}

      {draft?.statusNote ? (
        <p className="mx-auto max-w-[720px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          The last attempt did not send. {draft.statusNote}
        </p>
      ) : null}

      {recipientsStale ? (
        <p className="mx-auto max-w-[720px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          Recipient sync has not completed recently, so these counts may be out
          of date and a send will be refused. Run the recipient sync first.
        </p>
      ) : null}

      <div className="mx-auto max-w-[720px] overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="divide-y divide-gray-100 border-b border-gray-200">
          <FieldRow label="From">
            <FieldSelect
              ariaLabel="Sender identity"
              value={senderKey}
              onChange={(key) => {
                markEdited();
                setSenderKey(key as EmailSenderKey);
              }}
              options={senderOptions.map((option) => ({
                key: option.key,
                label: option.name,
                sublabel: option.address,
                disabled: !option.allowed,
                disabledNote: option.allowed ? undefined : "Restricted",
              }))}
            >
              <span className="block truncate text-[15px] font-semibold text-ink">
                {sender.name}
              </span>
              <span className="mt-0.5 block truncate text-xs text-gray-400">
                {sender.address}
              </span>
            </FieldSelect>
            {sender.replyable ? null : (
              <p className="mt-1 px-2.5 text-xs leading-5 text-gray-500">
                Replies to this address are not monitored. The footer tells
                recipients so.
              </p>
            )}
          </FieldRow>

          <FieldRow label="To">
            <FieldSelect
              ariaLabel="Audience"
              value={audienceKey}
              onChange={(key) => {
                markEdited();
                setAudienceKey(key as BroadcastAudienceKey);
              }}
              options={BROADCAST_AUDIENCES.map((option) => ({
                key: option.key,
                label: option.label,
                description: option.description,
                meta: option.isStanding
                  ? formatRecipientCount(audienceCounts[option.key] ?? 0)
                  : undefined,
              }))}
            >
              <span className="block truncate text-[15px] font-semibold text-ink">
                {audience.label}
              </span>
              <span className="mt-0.5 block truncate text-xs text-gray-400">
                {audienceKey === "selected"
                  ? `${formatRecipientCount(recipientCount)} chosen by hand`
                  : `${formatRecipientCount(recipientCount)} recipients`}
              </span>
            </FieldSelect>

            <p className="mt-1 px-2.5 text-xs leading-5 text-gray-500">
              Anyone who has turned off platform email is already excluded from
              this count. There is no way to send past that preference.
            </p>

            {audienceKey === "selected" ? (
              <div className="mt-3 rounded-lg border border-gray-200 bg-canvas p-1.5">
                <div className="max-h-56 overflow-y-auto">
                  {selectableRecipients.length === 0 ? (
                    <p className="px-2.5 py-6 text-center text-xs text-gray-400">
                      No eligible members to choose from yet. Run the recipient
                      sync first.
                    </p>
                  ) : (
                    selectableRecipients.map((person) => {
                      const isChecked = selectedIds.includes(person.id);
                      return (
                        <label
                          key={person.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              markEdited();
                              setSelectedIds((previous) =>
                                previous.includes(person.id)
                                  ? previous.filter((id) => id !== person.id)
                                  : [...previous, person.id]
                              );
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-emerald-brand focus:ring-emerald-brand"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-ink">
                              {person.name}
                            </span>
                            <span className="block truncate text-xs text-gray-400">
                              {person.detail}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </FieldRow>
        </div>

        <div className="border-b border-gray-100 px-4 pb-4 pt-5 sm:px-6">
          <label htmlFor="broadcast-subject" className="sr-only">
            Subject
          </label>
          <input
            id="broadcast-subject"
            value={subject}
            onChange={(event) => {
              markEdited();
              setSubject(event.target.value);
            }}
            placeholder="Subject"
            className="font-display w-full border-0 bg-transparent p-0 text-2xl font-semibold leading-snug tracking-tight text-ink placeholder:text-gray-300 focus:outline-none"
          />
          <p
            className={`mt-2 text-xs ${
              guidance.isLong ? "text-gold-ink" : "text-gray-400"
            }`}
          >
            {guidance.length} characters. {guidance.note}
          </p>

          <label htmlFor="broadcast-preview-text" className="sr-only">
            Preview text
          </label>
          <input
            id="broadcast-preview-text"
            value={previewText}
            onChange={(event) => {
              markEdited();
              setPreviewText(event.target.value);
            }}
            placeholder="Preview text shown beside the subject in the inbox (optional)"
            className="mt-4 w-full border-0 bg-transparent p-0 text-sm leading-6 text-gray-600 placeholder:text-gray-400 focus:outline-none"
          />
        </div>

        <BroadcastEditor
          html={bodyHtml}
          onChange={(html) => {
            markEdited();
            setBodyHtml(html);
          }}
        />
      </div>

      {openModal === "test" ? (
        <Modal label="Send test email" onClose={() => setOpenModal(null)}>
          <div className="p-6">
            <h2 className="font-display text-xl font-semibold text-ink">
              Send test email
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Send yourself exactly what a recipient will receive. Nothing goes
              to {audience.label.toLowerCase()}.
            </p>

            <label
              htmlFor="broadcast-test-recipient"
              className="mt-5 block text-xs font-semibold uppercase tracking-[0.08em] text-gray-400"
            >
              Test recipient
            </label>
            <input
              id="broadcast-test-recipient"
              type="email"
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-ink focus:border-emerald-brand/50 focus:outline-none"
            />

            {testSentTo ? (
              <p className="mt-4 rounded-lg border border-green-wash-border bg-green-wash px-4 py-3 text-sm leading-6 text-emerald-brand">
                Test sent to {testSentTo}. Check your inbox.
              </p>
            ) : null}

            {testError ? (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
              >
                {testError}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-canvas"
              >
                {testSentTo ? "Done" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={!testRecipient.trim() || testPending}
                onClick={() => {
                  setTestError(null);
                  setTestPending(true);
                  void (async () => {
                    const result = await sendBroadcastTest({
                      broadcastId: broadcastIdRef.current,
                      recipient: testRecipient,
                      subject,
                      previewText,
                      bodyHtml,
                      senderKey,
                    });
                    setTestPending(false);
                    if (result.ok) {
                      setTestSentTo(result.recipient);
                    } else {
                      setTestError(result.error);
                    }
                  })();
                }}
                className="rounded-lg bg-emerald-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {testPending ? "Sending" : "Send test"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {openModal === "preview" ? (
        <Modal
          label="Email preview"
          onClose={() => setOpenModal(null)}
          panelClassName="max-w-4xl"
        >
          <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">
                Preview
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                The Indegenius email template, rendered exactly as it will send.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenModal(null)}
              className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-canvas"
            >
              Close
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto bg-canvas px-4 py-6 sm:px-6">
            <EmailPreview
              html={emailHtml}
              senderName={sender.name}
              senderAddress={sender.address}
              subject={subject}
              previewText={previewText}
            />
          </div>
        </Modal>
      ) : null}

      {openModal === "confirm" ? (
        <Modal label="Confirm broadcast" onClose={() => setOpenModal(null)}>
          <div className="p-6">
            <h2 className="font-display text-xl font-semibold text-ink">
              Ready to send?
            </h2>

            <dl className="mt-5 divide-y divide-gray-100 border-y border-gray-100">
              <SummaryLine label="From" value={sender.name} />
              <SummaryLine label="Audience" value={audience.label} />
              <SummaryLine
                label="Recipients"
                value={formatRecipientCount(recipientCount)}
              />
              <SummaryLine label="Subject" value={subject} />
            </dl>

            <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              This email will be sent to {formatRecipientCount(recipientCount)}{" "}
              people and cannot be recalled after delivery begins.
            </p>

            {testSentTo ? null : (
              <p className="mt-3 text-xs leading-5 text-gray-500">
                You have not sent yourself a test of this email yet.
              </p>
            )}

            {needsAcknowledgement ? (
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-6 text-gray-600">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-emerald-brand focus:ring-emerald-brand"
                />
                <span>I have previewed this email and confirmed the audience.</span>
              </label>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-canvas"
              >
                Back to edit
              </button>
              <button
                type="button"
                disabled={(needsAcknowledgement && !acknowledged) || sending}
                onClick={() => void confirmSend()}
                className="rounded-lg bg-emerald-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {recipientCount === 1
                  ? "Send 1 email"
                  : `Send ${formatRecipientCount(recipientCount)} emails`}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
