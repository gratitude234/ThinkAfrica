"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import TagInput from "@/components/ui/TagInput";
import CoAuthorPicker, {
  type CoAuthorProfile,
} from "@/components/collaboration/CoAuthorPicker";
import type { PostReferenceRecord } from "@/lib/types";
import {
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

    const formData = new FormData();
    formData.append("file", file);

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
    setNotice("PDF uploaded. Save the draft to attach it to this submission.");
    setUploading(false);
  };

  const updateReference = (
    index: number,
    changes: Partial<PostReferenceRecord>
  ) => {
    setReferences((current) =>
      current.map((reference, itemIndex) =>
        itemIndex === index ? { ...reference, ...changes } : reference
      )
    );
  };

  const removeReference = (index: number) => {
    setReferences((current) => current.filter((_, itemIndex) => itemIndex !== index));
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
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="rounded-2xl border border-purple-100 bg-purple-50 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-700">
          Research submission
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          Upload a research paper
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-purple-950/75">
          Research papers are reviewed from a submitted PDF. The abstract,
          authors, references, and accepted document become the citable archive.
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
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-canvas px-4 py-5">
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-brand file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
              {uploading ? (
                <p className="mt-3 text-sm text-gray-500">Uploading PDF...</p>
              ) : null}
              {document.documentPath ? (
                <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                  <p className="font-semibold">{document.originalName}</p>
                  <p className="mt-0.5 text-xs text-emerald-800/75">
                    {formatBytes(document.sizeBytes)} / PDF uploaded
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
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">References</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Add the core references reviewers need to verify the paper.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReferences((current) => [...current, emptyReference()])}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:border-emerald-200 hover:text-emerald-700"
              >
                Add reference
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {references.map((reference, index) => (
                <div key={reference.id} className="rounded-xl border border-gray-100 bg-canvas p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={reference.title ?? ""}
                      onChange={(event) =>
                        updateReference(index, { title: event.target.value })
                      }
                      placeholder="Reference title"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={reference.authors ?? ""}
                      onChange={(event) =>
                        updateReference(index, { authors: event.target.value })
                      }
                      placeholder="Authors"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={reference.source ?? ""}
                      onChange={(event) =>
                        updateReference(index, { source: event.target.value })
                      }
                      placeholder="Source / journal / publisher"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={reference.url ?? ""}
                      onChange={(event) =>
                        updateReference(index, { url: event.target.value })
                      }
                      placeholder="URL or DOI"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeReference(index)}
                    className="mt-2 text-xs font-semibold text-gray-400 hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          {needsAuthorNote ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-lg font-semibold text-amber-950">
                Revision response
              </h2>
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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Submission readiness
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <p className={title.trim() ? "text-emerald-700" : "text-gray-500"}>
                Title {title.trim() ? "ready" : "needed"}
              </p>
              <p className={abstract.trim() ? "text-emerald-700" : "text-gray-500"}>
                Abstract {abstract.trim() ? "ready" : "needed"}
              </p>
              <p className={document.documentPath ? "text-emerald-700" : "text-gray-500"}>
                PDF {document.documentPath ? "uploaded" : "needed"}
              </p>
              <p className={tags.length > 0 ? "text-emerald-700" : "text-gray-500"}>
                Topics {tags.length > 0 ? "selected" : "needed"}
              </p>
              <p className={references.some((ref) => ref.title?.trim()) ? "text-emerald-700" : "text-gray-500"}>
                References {references.some((ref) => ref.title?.trim()) ? "added" : "needed"}
              </p>
            </div>

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
                disabled={uploading}
                onClick={submit}
              >
                Submit for review
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
