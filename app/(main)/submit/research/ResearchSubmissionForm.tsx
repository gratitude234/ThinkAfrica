"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import TagInput from "@/components/ui/TagInput";
import CoAuthorPicker, {
  type CoAuthorProfile,
} from "@/components/collaboration/CoAuthorPicker";
import type { PostReferenceRecord } from "@/lib/types";
import ReferenceRow from "@/components/ui/ReferenceRow";
import {
  ensureResearchDraftForUpload,
  saveResearchDraft,
  submitResearchPaper,
  type ResearchDocumentInput,
} from "./actions";

export interface ResearchDraft {
  id: string;
  title: string;
  abstract: string;
  tags: string[];
  status: string;
  currentRound: number;
  document: ResearchDocumentInput;
}

interface ResearchSubmissionFormProps {
  userId: string;
  initialDraft: ResearchDraft | null;
  initialReferences: PostReferenceRecord[];
  initialCoAuthors: CoAuthorProfile[];
}

const emptyDocument: ResearchDocumentInput = {
  documentPath: null,
  originalName: null,
  mimeType: null,
  sizeBytes: null,
};

function formatBytes(value: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function emptyReference(): PostReferenceRecord {
  return {
    id: `temp-${Date.now().toString(36)}`,
    post_id: "",
    display_order: 0,
    ref_type: "other",
    authors: null,
    title: "",
    year: null,
    source: null,
    url: null,
    doi: null,
    raw: null,
  };
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          done ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
        }`}
      >
        {done ? (
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : null}
      </span>
      <span className={`text-sm ${done ? "text-gray-900" : "text-gray-500"}`}>
        {label}
      </span>
    </div>
  );
}

function TimelineDot({
  done,
  current,
}: {
  done: boolean;
  current: boolean;
}) {
  return (
    <span
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
        done
          ? "border-emerald-500 bg-emerald-500 text-white"
          : current
            ? "border-purple-400 bg-purple-50 text-purple-700"
            : "border-gray-200 bg-white text-gray-300"
      }`}
      aria-hidden="true"
    >
      {done ? "OK" : ""}
    </span>
  );
}

export default function ResearchSubmissionForm({
  userId,
  initialDraft,
  initialReferences,
  initialCoAuthors,
}: ResearchSubmissionFormProps) {
  const router = useRouter();
  const [draftId, setDraftId] = useState(initialDraft?.id ?? null);
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [abstract, setAbstract] = useState(initialDraft?.abstract ?? "");
  const [tags, setTags] = useState<string[]>(initialDraft?.tags ?? ["research"]);
  const [document, setDocument] = useState<ResearchDocumentInput>(
    initialDraft?.document ?? emptyDocument
  );
  const [references, setReferences] = useState<PostReferenceRecord[]>(
    initialReferences.length > 0 ? initialReferences : [emptyReference()]
  );
  const [coAuthors, setCoAuthors] = useState<CoAuthorProfile[]>(initialCoAuthors);
  const [authorNote, setAuthorNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const status = initialDraft?.status ?? "draft";
  const currentRound = initialDraft?.currentRound ?? 1;
  const needsAuthorNote = status === "pending_revision";
  const metadataReady =
    title.trim().length > 0 && abstract.trim().length > 0 && tags.length > 0;
  const pdfUploaded = Boolean(document.documentPath);
  const pdfAttached = Boolean(document.documentPath && draftId);
  const referencesReady = references.some((ref) => ref.title?.trim());
  const submittedForReview = status === "pending" || status === "pending_revision";
  const canChangePdf = status === "draft" || status === "pending_revision";
  const reviewerDecision =
    status === "pending_revision" || status === "published" || status === "rejected";
  const citationArchived = status === "published";
  const timeline = [
    {
      label: "Metadata",
      helper: "Title, abstract, and topics",
      done: metadataReady,
      current: !metadataReady,
    },
    {
      label: "PDF uploaded",
      helper: "Final manuscript PDF",
      done: pdfUploaded,
      current: metadataReady && !pdfUploaded,
    },
    {
      label: "References added",
      helper: "Sources reviewers can verify",
      done: referencesReady,
      current: metadataReady && pdfUploaded && !referencesReady,
    },
    {
      label: needsAuthorNote ? "Revision response" : "Submitted for review",
      helper: needsAuthorNote
        ? "Explain changes before resubmission"
        : "Enters editorial workflow",
      done: submittedForReview && !needsAuthorNote,
      current: metadataReady && pdfUploaded && referencesReady && !submittedForReview,
    },
    {
      label: "Reviewer decision",
      helper: "Accept, revise, or reject",
      done: reviewerDecision,
      current: status === "pending",
    },
    {
      label: "Citation archive",
      helper: "Accepted PDF is preserved",
      done: citationArchived,
      current: false,
    },
  ];

  const payload = {
    draftId,
    title,
    abstract,
    tags,
    document,
    references,
    coAuthors: coAuthors.map((coAuthor, index) => ({
      user_id: coAuthor.id,
      display_order: index + 1,
      corresponding_author: false,
    })),
    authorNote,
    currentStatus: status,
    currentRound,
  };

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setNotice(null);

    const draftResult = await ensureResearchDraftForUpload({
      draftId,
      title,
      abstract,
      tags,
    });

    if (draftResult.error || !draftResult.postId) {
      setError(draftResult.error ?? "Unable to prepare the research draft for upload.");
      setUploading(false);
      return;
    }

    setDraftId(draftResult.postId);
    router.replace(`/submit/research?draft=${draftResult.postId}`);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("postId", draftResult.postId);

    const response = await fetch("/api/research-document/upload", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json()) as ResearchDocumentInput & {
      error?: string;
    };

    if (!response.ok || result.error) {
      setError(result.error ?? "PDF upload failed.");
      setUploading(false);
      return;
    }

    setDocument({
      documentPath: result.documentPath,
      originalName: result.originalName,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
    });
    setNotice("PDF uploaded and attached to this research draft.");
    setUploading(false);
  };

  const saveDraft = () => {
    setError(null);
    setNotice(null);
    startTransition(() => {
      void (async () => {
        const result = await saveResearchDraft(payload);
        if (result.error) {
          setError(result.error);
          return;
        }
        setDraftId(result.postId);
        setNotice("Research draft saved.");
        if (result.postId) {
          router.replace(`/submit/research?draft=${result.postId}`);
        }
      })();
    });
  };

  const submit = () => {
    setError(null);
    setNotice(null);
    startTransition(() => {
      void (async () => {
        const result = await submitResearchPaper(payload);
        if (result.error) {
          setError(result.error);
          return;
        }
        router.push("/dashboard");
      })();
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-24 lg:pb-16">
      <div className="rounded-2xl border border-purple-100 bg-purple-50 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-700">
          Research submission
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          Upload a research paper
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-purple-950/75">
          Research papers are reviewed from a submitted PDF. Use PDF for final
          submission because it preserves formatting for review, citation, and
          archiving.
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-purple-900/70">
          From Word or Google Docs? Export or download the final manuscript as a
          PDF before submitting.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-gray-900">Paper metadata</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-900" htmlFor="research-title">
                  Title
                </label>
                <input
                  id="research-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                  placeholder="Research title"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900" htmlFor="research-abstract">
                  Abstract
                </label>
                <textarea
                  id="research-abstract"
                  value={abstract}
                  onChange={(event) => setAbstract(event.target.value)}
                  rows={8}
                  className="mt-2 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm leading-6 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                  placeholder="Summarize the research question, method, findings, and contribution."
                />
              </div>
              <TagInput
                label="Topics"
                value={tags}
                maxTags={5}
                helperText="Add 1 to 5 topics so reviewers and readers can classify the paper."
                placeholder="Add topic"
                onChange={setTags}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-gray-900">Research PDF</h2>
            <p className="mt-1 text-sm text-gray-500">
              Upload the final manuscript as a PDF. Accepted research keeps this
              document attached to the citation archive.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-purple-50 px-2.5 py-1 font-medium text-purple-700">
                PDF only
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600">
                Max 20MB
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600">
                Final manuscript version
              </span>
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-canvas px-4 py-5">
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={!canChangePdf || uploading}
                onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-brand file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
              {uploading ? (
                <p className="mt-3 text-sm text-gray-500">
                  Preparing draft and uploading PDF...
                </p>
              ) : null}
              {document.documentPath ? (
                <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                  <p className="font-semibold">{document.originalName}</p>
                  <p className="mt-0.5 text-xs text-emerald-800/75">
                    {formatBytes(document.sizeBytes)} / PDF attached to this draft
                  </p>
                  {draftId ? (
                    <a
                      href={`/api/research-document/${draftId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-semibold text-emerald-700 underline"
                    >
                      Open uploaded PDF
                    </a>
                  ) : null}
                </div>
              ) : null}
              {!canChangePdf ? (
                <p className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500">
                  PDFs can be changed while a paper is a draft or when revision is requested.
                </p>
              ) : null}
              <p className="mt-3 text-xs leading-5 text-gray-500">
                DOCX is fine for drafting, but the review packet requires PDF so
                every reviewer sees the same formatting, tables, references, and
                page breaks.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">References</h2>
              <p className="mt-1 text-sm text-gray-500">
                Add the core references reviewers need to verify the paper.
              </p>
            </div>

            <div className="space-y-3">
              {references.map((reference, index) => (
                <ReferenceRow
                  key={reference.id}
                  index={index}
                  reference={reference}
                  canMoveUp={index > 0}
                  canMoveDown={index < references.length - 1}
                  onMove={(direction) => {
                    const next = [...references];
                    const target = direction === "up" ? index - 1 : index + 1;
                    const [item] = next.splice(index, 1);
                    next.splice(target, 0, item);
                    setReferences(next.map((r, i) => ({ ...r, display_order: i })));
                  }}
                  onChange={(nextRef) =>
                    setReferences(
                      references.map((r, i) =>
                        i === index ? { ...nextRef, display_order: index } : r
                      )
                    )
                  }
                  onRemove={() =>
                    setReferences(
                      references
                        .filter((_, i) => i !== index)
                        .map((r, i) => ({ ...r, display_order: i }))
                    )
                  }
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                setReferences((current) => [
                  ...current,
                  { ...emptyReference(), display_order: current.length },
                ])
              }
              className="mt-3 w-full rounded-lg border border-dashed border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              + Add reference
            </button>
          </section>

          {needsAuthorNote ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-lg font-semibold text-amber-950">
                Revision requested
              </h2>
              <p className="mt-1 text-sm leading-6 text-amber-900/80">
                Upload the revised PDF if needed, then explain what changed before
                resubmitting to reviewers.
              </p>
              <textarea
                value={authorNote}
                onChange={(event) => setAuthorNote(event.target.value)}
                rows={4}
                className="mt-3 w-full resize-none rounded-xl border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="Explain what changed in this revision."
              />
            </section>
          ) : null}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-[76px] lg:self-start">
          <CoAuthorPicker
            userId={userId}
            value={coAuthors}
            onChange={setCoAuthors}
            source="write"
          />

          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-purple-700">
              Review journey
            </p>
            <div className="mt-4 space-y-3">
              {timeline.map((item) => (
                <div key={item.label} className="flex gap-3">
                  <TimelineDot done={item.done} current={item.current} />
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        item.done || item.current ? "text-gray-900" : "text-gray-400"
                      }`}
                    >
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-gray-500">
                      {item.helper}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Submission readiness
            </p>
            <div className="mt-4 space-y-2.5">
              <CheckItem done={title.trim().length > 0} label="Title" />
              <CheckItem done={abstract.trim().length > 0} label="Abstract" />
              <CheckItem done={Boolean(document.documentPath)} label="PDF uploaded" />
              <CheckItem done={tags.length > 0} label="Topics selected" />
              <CheckItem
                done={references.some((ref) => ref.title?.trim())}
                label="References added"
              />
            </div>

            {pdfUploaded && !pdfAttached ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                PDF attached. Refresh the page if the draft link has not updated yet.
              </div>
            ) : null}

            {notice ? (
              <p className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            ) : null}

            <div className="mt-5 space-y-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={isPending || uploading}
                onClick={saveDraft}
              >
                Save draft
              </Button>
              <Button
                type="button"
                className="w-full"
                loading={isPending}
                disabled={uploading || !canChangePdf}
                onClick={submit}
              >
                {needsAuthorNote ? "Resubmit" : "Submit for review"}
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
              What reviewers see
            </p>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <p>PDF manuscript</p>
              <p>Title and abstract</p>
              <p>References and topics</p>
              <p>Co-authors and author response notes</p>
            </div>
          </section>
        </aside>
      </div>

      {/* Mobile submit footer — hidden on desktop where sidebar buttons are used */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-gray-200 bg-white px-4 py-3 lg:hidden">
        {error ? (
          <p className="mb-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mb-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={isPending || uploading}
            onClick={saveDraft}
          >
            Save draft
          </Button>
          <Button
            type="button"
            className="flex-1"
            loading={isPending}
            disabled={uploading || !canChangePdf}
            onClick={submit}
          >
            {needsAuthorNote ? "Resubmit" : "Submit for review"}
          </Button>
        </div>
      </div>
    </div>
  );
}
