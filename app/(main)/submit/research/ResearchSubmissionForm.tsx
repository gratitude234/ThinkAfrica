"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { trackActivationEvent } from "@/lib/activationEvents";
import type { CoAuthorProfile } from "@/components/collaboration/CoAuthorPicker";
import type { PostReferenceRecord } from "@/lib/types";
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

export interface SubmittingAuthor {
  username: string;
  fullName: string | null;
  university: string | null;
}

interface ResearchSubmissionFormProps {
  userId: string;
  author: SubmittingAuthor | null;
  initialDraft: ResearchDraft | null;
  initialReferences: PostReferenceRecord[];
  initialCoAuthors: CoAuthorProfile[];
}

type SubmissionStep = 1 | 2 | 3 | 4;

const TOPIC_OPTIONS = [
  "Politics",
  "Education",
  "Health",
  "Technology",
  "Culture",
  "Economics",
  "Climate",
  "Gender",
] as const;

const MAX_PDF_MB = 20;

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

function referenceToLine(reference: PostReferenceRecord) {
  if (reference.raw?.trim()) return reference.raw.trim();
  return [
    reference.authors,
    reference.title,
    reference.source,
    reference.year ? String(reference.year) : null,
    reference.doi ?? reference.url,
  ]
    .map((part) => part?.toString().trim())
    .filter(Boolean)
    .join(". ");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const NON_EDITABLE_STATUS_COPY: Record<string, string> = {
  withdrawn: "This submission was withdrawn and can no longer be edited or resubmitted from here.",
  pending: "This submission is awaiting a reviewer decision and can't be edited right now.",
  published: "This paper was accepted and its record is locked so its citation stays stable.",
  rejected: "This submission was declined and can no longer be edited.",
  removed: "This post was removed and can no longer be edited.",
};

function AuthorCard({
  name,
  detail,
  suffix,
  onRemove,
}: {
  name: string;
  detail: string | null;
  suffix?: string;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-accent text-sm font-bold text-white">
        {initials(name) || "?"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">
          {name} {suffix ? <span className="font-normal text-gray-400">{suffix}</span> : null}
        </span>
        {detail ? (
          <span className="block truncate text-sm text-gray-500">{detail}</span>
        ) : null}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-semibold text-gray-400 transition-colors hover:text-red-600"
          aria-label={`Remove ${name}`}
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

export default function ResearchSubmissionForm({
  userId,
  author,
  initialDraft,
  initialReferences,
  initialCoAuthors,
}: ResearchSubmissionFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draftId, setDraftId] = useState(initialDraft?.id ?? null);
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [abstract, setAbstract] = useState(initialDraft?.abstract ?? "");
  const initialTags = initialDraft?.tags ?? [];
  const [topics, setTopics] = useState<string[]>(
    TOPIC_OPTIONS.filter((topic) => initialTags.includes(topic.toLowerCase()))
  );
  const [keywords, setKeywords] = useState(
    initialTags
      .filter(
        (tag) =>
          tag !== "research" &&
          !TOPIC_OPTIONS.some((topic) => topic.toLowerCase() === tag)
      )
      .join(", ")
  );
  const [document, setDocument] = useState<ResearchDocumentInput>(
    initialDraft?.document ?? emptyDocument
  );
  const [referencesText, setReferencesText] = useState(
    initialReferences.map(referenceToLine).join("\n")
  );
  const [coAuthors, setCoAuthors] = useState<CoAuthorProfile[]>(initialCoAuthors);
  const [coAuthorQuery, setCoAuthorQuery] = useState("");
  const [coAuthorResults, setCoAuthorResults] = useState<CoAuthorProfile[]>([]);
  const [searchingCoAuthors, setSearchingCoAuthors] = useState(false);
  const [showManualHint, setShowManualHint] = useState(false);
  const [authorNote, setAuthorNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<SubmissionStep>(() => {
    if (
      initialDraft &&
      initialDraft.status !== "draft" &&
      initialDraft.status !== "pending_revision"
    ) {
      return 4;
    }
    if (!initialDraft?.document.documentPath) return 1;
    if (!initialDraft.title.trim() || !initialDraft.abstract.trim()) return 2;
    return 3;
  });
  const [isPending, startTransition] = useTransition();

  const status = initialDraft?.status ?? "draft";
  const needsAuthorNote = status === "pending_revision";
  const isEditable = status === "draft" || status === "pending_revision";
  const canChangePdf = isEditable;
  const statusNoticeCopy = !isEditable
    ? (NON_EDITABLE_STATUS_COPY[status] ?? "This submission can no longer be edited from here.")
    : null;

  const keywordList = keywords
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const tags = [
    ...topics.map((topic) => topic.toLowerCase()),
    ...keywordList.map((keyword) => keyword.toLowerCase()),
  ];
  const pdfUploaded = Boolean(document.documentPath);
  const metadataReady =
    title.trim().length > 0 && abstract.trim().length > 0 && tags.length > 0;
  const authorName = author?.fullName?.trim() || author?.username || "You";

  useEffect(() => {
    const trimmed = coAuthorQuery.trim();
    if (trimmed.length < 2 || coAuthors.length >= 5) {
      setCoAuthorResults([]);
      setSearchingCoAuthors(false);
      return;
    }

    setSearchingCoAuthors(true);
    const supabase = createClient();
    const timer = setTimeout(() => {
      supabase
        .from("profiles")
        .select("id, username, full_name, university, field_of_study")
        .ilike("username", `%${trimmed}%`)
        .neq("id", userId)
        .limit(6)
        .then(({ data }) => {
          const selected = new Set(coAuthors.map((coAuthor) => coAuthor.id));
          const nextResults = ((data as CoAuthorProfile[] | null) ?? []).filter(
            (profile) => !selected.has(profile.id)
          );
          setCoAuthorResults(nextResults);
          setSearchingCoAuthors(false);
          trackActivationEvent({
            event: "coauthor_search_performed",
            metadata: {
              source: "write",
              queryLength: trimmed.length,
              resultCount: nextResults.length,
            },
          });
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [coAuthorQuery, coAuthors, userId]);

  const buildReferences = (): PostReferenceRecord[] =>
    referencesText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({
        id: initialReferences[index]?.id ?? `temp-${index}-${Date.now().toString(36)}`,
        post_id: "",
        display_order: index,
        ref_type: "other",
        authors: null,
        title: line,
        year: null,
        source: null,
        url: null,
        doi: null,
        raw: line,
      }));

  const buildPayload = () => ({
    draftId,
    title,
    abstract,
    tags,
    document,
    references: buildReferences(),
    coAuthors: coAuthors.map((coAuthor, index) => ({
      user_id: coAuthor.id,
      display_order: index + 1,
      corresponding_author: false,
    })),
    authorNote,
  });

  const canContinue =
    currentStep === 1 ? pdfUploaded : currentStep === 2 ? metadataReady : true;

  const goBack = () => {
    setError(null);
    setCurrentStep((step) => Math.max(1, step - 1) as SubmissionStep);
  };

  const goNext = () => {
    if (!canContinue) {
      setError(
        currentStep === 1
          ? "Upload the PDF manuscript to continue."
          : "Add a title, an abstract, and at least one topic or keyword to continue."
      );
      return;
    }
    setError(null);
    setCurrentStep((step) => Math.min(4, step + 1) as SubmissionStep);
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
    setUploading(false);
  };

  const saveDraft = () => {
    setError(null);
    setNotice(null);
    startTransition(() => {
      void (async () => {
        const result = await saveResearchDraft(buildPayload());
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
        const result = await submitResearchPaper(buildPayload());
        if (result.error) {
          setError(result.error);
          return;
        }
        router.push("/dashboard");
      })();
    });
  };

  const addCoAuthor = (profile: CoAuthorProfile) => {
    if (coAuthors.some((item) => item.id === profile.id) || coAuthors.length >= 5) return;
    setCoAuthors([...coAuthors, profile]);
    setCoAuthorQuery("");
    setCoAuthorResults([]);
  };

  const summaryTopics = topics.length > 0 ? topics : keywordList.slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-md pb-16 sm:max-w-lg">
      {/* Step header: close, count, segmented progress */}
      <div className="pt-1">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            aria-label="Close submission"
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-ink"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="text-lg font-bold text-ink">Step {currentStep} of 4</p>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2.5" aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`h-[3px] rounded-full ${
                step <= currentStep ? "bg-emerald-brand" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>

      {statusNoticeCopy ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {statusNoticeCopy}
        </div>
      ) : null}

      {currentStep === 1 ? (
        <section className="mt-8">
          <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">
            Upload manuscript
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-gray-600">
            PDF preferred. This will be attached to your submission for reviewers.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={!canChangePdf || uploading}
            onChange={(event) => {
              void handleUpload(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canChangePdf || uploading}
            className="mt-6 flex min-h-[190px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-300 bg-white px-4 py-10 transition-colors hover:border-emerald-brand/50 hover:bg-green-wash disabled:pointer-events-none disabled:opacity-60"
          >
            {uploading ? (
              <>
                <svg className="h-7 w-7 animate-spin text-emerald-brand" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="mt-1 text-[15px] text-gray-600">Uploading your PDF...</span>
              </>
            ) : pdfUploaded ? (
              <>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-tint text-emerald-brand">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="mt-1 max-w-full truncate px-4 text-[15px] font-semibold text-ink">
                  {document.originalName}
                </span>
                <span className="text-sm text-gray-500">
                  {formatBytes(document.sizeBytes)}
                  {canChangePdf ? " · Click to replace" : ""}
                </span>
              </>
            ) : (
              <>
                <svg className="h-7 w-7 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5l5 5M4 20h16" />
                </svg>
                <span className="mt-1 text-[17px] text-gray-600">Click to select a file</span>
                <span className="text-[15px] text-gray-400">PDF, up to {MAX_PDF_MB}MB</span>
              </>
            )}
          </button>
          {pdfUploaded && draftId ? (
            <p className="mt-3 text-center">
              <a
                href={`/api/research-document/${draftId}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-emerald-brand underline underline-offset-2"
              >
                Open uploaded PDF
              </a>
            </p>
          ) : null}
        </section>
      ) : null}

      {currentStep === 2 ? (
        <section className="mt-8">
          <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">
            Title, abstract, keywords &amp; topics
          </h1>
          <div className="mt-6 space-y-6">
            <div>
              <label className="text-[15px] font-bold text-ink" htmlFor="research-title">
                Title
              </label>
              <input
                id="research-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={!isEditable}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="Manuscript title"
              />
            </div>
            <div>
              <label className="text-[15px] font-bold text-ink" htmlFor="research-abstract">
                Abstract
              </label>
              <textarea
                id="research-abstract"
                value={abstract}
                onChange={(event) => setAbstract(event.target.value)}
                rows={7}
                disabled={!isEditable}
                className="mt-2 w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] leading-6 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="Summarize your research question, method, and findings"
              />
            </div>
            <div>
              <label className="text-[15px] font-bold text-ink" htmlFor="research-keywords">
                Keywords
              </label>
              <input
                id="research-keywords"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                disabled={!isEditable}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="e.g. groundwater, mining, environmental policy"
              />
              <p className="mt-2 text-sm text-gray-500">Separate keywords with commas.</p>
            </div>
            <div>
              <p className="text-[15px] font-bold text-ink">Topics</p>
              <div className="mt-2.5 flex flex-wrap gap-2.5">
                {TOPIC_OPTIONS.map((topic) => {
                  const selected = topics.includes(topic);
                  return (
                    <button
                      key={topic}
                      type="button"
                      disabled={!isEditable}
                      aria-pressed={selected}
                      onClick={() =>
                        setTopics((current) =>
                          current.includes(topic)
                            ? current.filter((item) => item !== topic)
                            : [...current, topic]
                        )
                      }
                      className={`rounded-full border px-4 py-1.5 text-[15px] transition-colors disabled:pointer-events-none disabled:opacity-60 ${
                        selected
                          ? "border-emerald-brand bg-emerald-brand text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:border-emerald-brand/40"
                      }`}
                    >
                      {topic}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {currentStep === 3 ? (
        <section className="mt-8">
          <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">
            Authors &amp; references
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-gray-600">
            Search for co-authors by their Indegenius account.
          </p>
          <div className="mt-5 space-y-3">
            <AuthorCard name={authorName} detail={author?.university ?? null} suffix="(you)" />
            {coAuthors.map((coAuthor) => (
              <AuthorCard
                key={coAuthor.id}
                name={coAuthor.full_name?.trim() || `@${coAuthor.username}`}
                detail={coAuthor.university ?? null}
                onRemove={
                  isEditable
                    ? () => setCoAuthors(coAuthors.filter((item) => item.id !== coAuthor.id))
                    : undefined
                }
              />
            ))}
          </div>
          <div className="mt-3">
            <input
              type="text"
              value={coAuthorQuery}
              onChange={(event) => setCoAuthorQuery(event.target.value)}
              disabled={!isEditable || coAuthors.length >= 5}
              placeholder={
                coAuthors.length >= 5 ? "Maximum co-authors reached" : "Search by username"
              }
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand disabled:bg-gray-50 disabled:text-gray-400"
            />
            {searchingCoAuthors ? (
              <p className="mt-2 text-sm text-gray-400">Searching...</p>
            ) : null}
            {coAuthorResults.length > 0 ? (
              <div className="mt-2 space-y-1.5 rounded-xl border border-gray-100 bg-canvas p-2">
                {coAuthorResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => addCoAuthor(result)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 text-left text-sm transition-colors hover:bg-green-wash"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">
                        {result.full_name?.trim() || `@${result.username}`}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {[`@${result.username}`, result.university].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="text-xs font-bold text-emerald-brand">Add</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowManualHint((current) => !current)}
            className="mt-4 text-[15px] font-bold text-ink underline-offset-2 hover:underline"
          >
            Can&apos;t find them? Add manually
          </button>
          {showManualHint ? (
            <p className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-600">
              Co-authors need an Indegenius account to be credited on the record.
              Invite them to sign up, then search for their username here.
            </p>
          ) : null}
          <div className="mt-7">
            <label className="text-[15px] font-bold text-ink" htmlFor="research-references">
              References <span className="font-normal text-gray-400">(one per line)</span>
            </label>
            <textarea
              id="research-references"
              value={referencesText}
              onChange={(event) => setReferencesText(event.target.value)}
              rows={5}
              disabled={!isEditable}
              className="mt-2 w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] leading-6 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand disabled:bg-gray-50 disabled:text-gray-400"
              placeholder="Paste or type your reference list"
            />
          </div>
        </section>
      ) : null}

      {currentStep === 4 ? (
        <section className="mt-8">
          <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">
            Review &amp; submit
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-gray-600">
            Every submission goes through formal editorial review before it
            appears as citable, reviewed work. Most decisions arrive within
            three weeks.
          </p>

          {needsAuthorNote ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[15px] font-bold text-amber-950">Revision requested</p>
              <p className="mt-1 text-sm leading-6 text-amber-900/80">
                Explain what changed before resubmitting to reviewers.
              </p>
              <textarea
                value={authorNote}
                onChange={(event) => setAuthorNote(event.target.value)}
                rows={4}
                className="mt-3 w-full resize-none rounded-xl border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="Explain what changed in this revision."
              />
            </div>
          ) : null}

          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
              Summary
            </p>
            <p className="mt-3 text-lg font-bold text-ink">
              {title.trim() || "Untitled manuscript"}
            </p>
            <p className="mt-1 text-[15px] text-gray-600">
              {[
                [authorName, ...coAuthors.map((coAuthor) => coAuthor.full_name?.trim() || `@${coAuthor.username}`)].join(", "),
                formatBytes(document.sizeBytes),
                document.originalName,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {summaryTopics.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {summaryTopics.map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full border border-gray-200 bg-white px-3.5 py-1 text-sm text-gray-700"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-6 rounded-xl border border-green-wash-border bg-green-wash px-4 py-3 text-sm text-emerald-brand">
          {notice}
        </p>
      ) : null}

      <div className="mt-8 flex gap-3">
        {currentStep > 1 ? (
          <Button type="button" variant="secondary" size="lg" className="flex-1 rounded-xl" onClick={goBack}>
            Back
          </Button>
        ) : null}
        {currentStep < 4 ? (
          <Button
            type="button"
            size="lg"
            className="flex-[1.6] rounded-xl"
            disabled={!canContinue || uploading}
            onClick={goNext}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="flex-[1.6] rounded-xl"
            loading={isPending}
            disabled={uploading || !isEditable || !metadataReady || !pdfUploaded}
            onClick={submit}
          >
            {needsAuthorNote ? "Resubmit for review" : "Submit for review"}
          </Button>
        )}
      </div>
      {isEditable && currentStep > 1 ? (
        <p className="mt-4 text-center">
          <button
            type="button"
            onClick={saveDraft}
            disabled={isPending || uploading}
            className="text-sm font-medium text-gray-500 underline underline-offset-2 transition-colors hover:text-ink disabled:opacity-50"
          >
            Save draft and finish later
          </button>
        </p>
      ) : null}
    </div>
  );
}
