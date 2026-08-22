"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import PublishingTopicSelector from "@/components/topic/PublishingTopicSelector";
import CoAuthorPicker, {
  type CoAuthorProfile,
} from "@/components/collaboration/CoAuthorPicker";
import type { PostReferenceRecord } from "@/lib/types";
import { generateExcerpt, type PostType } from "@/lib/utils";
import { MAX_LONG_FORM_TOPICS } from "@/lib/tags";
import { trackActivationEvent } from "@/lib/activationEvents";
import { getPostQualitySummary, isLowQualityTitle } from "@/lib/postQuality";
import {
  ARTICLE_FORMAT_LABELS,
  type ArticleFormat,
} from "@/lib/contentModel";
import { publishPost } from "./actions";

type PreviewSurface = "feed" | "article" | "record";

interface PublishDrawerProps {
  open: boolean;
  onClose: () => void;
  draftId: string | null;
  title: string;
  content: string;
  wordCount: number;
  initialTags?: string[];
  initialCoverImageUrl?: string;
  initialExcerpt?: string;
  initialPostType?: PostType;
  initialArticleFormat?: ArticleFormat | null;
  initialReferences?: PostReferenceRecord[];
  initialCoAuthors?: CoAuthorProfile[];
  currentUserId?: string | null;
  author?: {
    full_name: string | null;
    username: string | null;
    university: string | null;
  } | null;
  inResponseTo?: string | null;
  responseContext?: { title: string; author?: string | null } | null;
  metadataReady?: boolean;
  onMetadataChange?: (changes: {
    tags?: string[];
    coverImageUrl?: string;
    articleFormat?: ArticleFormat | null;
    excerpt?: string;
    coAuthors?: CoAuthorProfile[];
  }) => void;
  onPublished?: (slug: string) => void | Promise<void>;
  coverUploading: boolean;
  onCoverUploadingChange: (uploading: boolean) => void;
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hasReferenceContent(reference: PostReferenceRecord) {
  return [
    reference.title,
    reference.authors,
    reference.source,
    reference.url,
    reference.doi,
    reference.raw,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
}

function isReferenceComplete(reference: PostReferenceRecord) {
  const hasVerificationDetail = [
    reference.source,
    reference.url,
    reference.doi,
    reference.raw,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
  return Boolean(reference.title?.trim() && hasVerificationDetail);
}

function countOrphanCitations(
  content: string,
  references: PostReferenceRecord[]
) {
  const citationKeys = new Set<string>();
  const patterns = [
    /\[ref:([a-zA-Z0-9-]+)\]/g,
    /href=["']#ref-id-([a-zA-Z0-9-]+)["']/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) citationKeys.add(match[1]);
  }

  const referenceIds = new Set(
    references.map((reference) => reference.id.replace(/^temp-/, ""))
  );
  return Array.from(citationKeys).filter((key) => {
    if (/^\d+$/.test(key)) {
      const position = Number.parseInt(key, 10);
      return position < 1 || position > references.length;
    }
    return !referenceIds.has(key);
  }).length;
}

function PreviewTabs({
  value,
  onChange,
}: {
  value: PreviewSurface;
  onChange: (value: PreviewSurface) => void;
}) {
  const options: Array<{ value: PreviewSurface; label: string }> = [
    { value: "feed", label: "Feed" },
    { value: "article", label: "Article" },
    { value: "record", label: "Intellectual Record" },
  ];

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % options.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + options.length) % options.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = options.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextValue = options[nextIndex].value;
    onChange(nextValue);
    document.getElementById(`publication-preview-tab-${nextValue}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Publication preview"
      className="grid grid-cols-3 rounded-xl bg-gray-100 p-1"
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          id={`publication-preview-tab-${option.value}`}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          aria-controls="publication-preview-panel"
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition-colors sm:text-[13px] ${
            value === option.value
              ? "bg-white text-ink shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function PublishDrawer({
  open,
  onClose,
  draftId,
  title,
  content,
  wordCount,
  initialTags = [],
  initialCoverImageUrl = "",
  initialExcerpt = "",
  initialPostType,
  initialArticleFormat = null,
  initialReferences = [],
  initialCoAuthors = [],
  currentUserId = null,
  author = null,
  inResponseTo,
  responseContext = null,
  metadataReady = true,
  onMetadataChange,
  onPublished,
  coverUploading,
  onCoverUploadingChange,
}: PublishDrawerProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const publishingRef = useRef(false);
  const [postType, setPostType] = useState<PostType>(initialPostType ?? "essay");
  const [articleFormat, setArticleFormat] = useState<ArticleFormat | null>(
    initialArticleFormat
  );
  const [tags, setTags] = useState<string[]>(initialTags);
  const [summary, setSummary] = useState(initialExcerpt);
  const [coAuthors, setCoAuthors] = useState<CoAuthorProfile[]>(initialCoAuthors);
  const [previewSurface, setPreviewSurface] = useState<PreviewSurface>("feed");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPublishWithoutTopics, setConfirmPublishWithoutTopics] =
    useState(false);

  const suggestedSummary = useMemo(
    () => generateExcerpt(content, 220),
    [content]
  );
  const bodyPreview = useMemo(() => stripHtml(content), [content]);
  const meaningfulReferences = useMemo(
    () => initialReferences.filter(hasReferenceContent),
    [initialReferences]
  );
  const validReferences = useMemo(
    () => meaningfulReferences.filter(isReferenceComplete),
    [meaningfulReferences]
  );
  const incompleteReferenceCount =
    meaningfulReferences.length - validReferences.length;
  const orphanCitationCount = useMemo(
    () => countOrphanCitations(content, meaningfulReferences),
    [content, meaningfulReferences]
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    trackActivationEvent({
      event: "publish_drawer_opened",
      metadata: { draftId, postType: initialPostType ?? "essay", wordCount },
    });
    setPostType(initialPostType ?? "essay");
    setArticleFormat(initialArticleFormat);
    setTags(initialTags);
    setSummary(initialExcerpt.trim() || suggestedSummary);
    setCoAuthors(initialCoAuthors);
    setPreviewSurface("feed");
    setPublishing(false);
    publishingRef.current = false;
    setError(null);
    setConfirmPublishWithoutTopics(false);
    // The values above are a snapshot taken when review opens. Parent changes
    // while the dialog is open are already reflected through local state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !publishingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      lastFocusedRef.current?.focus();
    };
  }, [open]);

  const qualitySummary = useMemo(
    () =>
      getPostQualitySummary({
        // /write is an Article composer. Legacy policy-brief drafts are
        // converted to ordinary Article genre metadata at first publish.
        type: "essay",
        status: "draft",
        title,
        excerpt: summary,
        content,
        wordCount,
        tags,
        referenceCount: validReferences.length,
        isResponse: Boolean(inResponseTo),
      }),
    [content, inResponseTo, summary, tags, title, validReferences.length, wordCount]
  );

  const warnings = useMemo(
    () =>
      qualitySummary.checklist
        .filter((item) => item.key !== "title" && item.blocking && !item.done)
        .map((item) => item.helper),
    [qualitySummary]
  );

  if (!open) return null;

  const handleTagChange = (nextTags: string[]) => {
    setTags(nextTags);
    setConfirmPublishWithoutTopics(false);
    onMetadataChange?.({ tags: nextTags });
  };

  const handleArticleFormatChange = (nextFormat: ArticleFormat | null) => {
    setArticleFormat(nextFormat);
    onMetadataChange?.({ articleFormat: nextFormat });
  };

  const handleSummaryChange = (nextSummary: string) => {
    setSummary(nextSummary);
    onMetadataChange?.({ excerpt: nextSummary });
  };

  const handleCoAuthorChange = (nextCoAuthors: CoAuthorProfile[]) => {
    setCoAuthors(nextCoAuthors);
    onMetadataChange?.({ coAuthors: nextCoAuthors });
  };

  const handlePublish = async (allowNoTopics = false) => {
    if (publishing) return;
    if (!metadataReady) {
      setError("Sources and collaborators are still loading. Try again in a moment.");
      return;
    }
    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }
    if (isLowQualityTitle(title)) {
      setError(
        'Add a real title before publishing. "Untitled draft" and similar placeholders are not allowed.'
      );
      return;
    }
    if (incompleteReferenceCount > 0) {
      setError(
        `Complete or remove the incomplete source${incompleteReferenceCount === 1 ? "" : "s"} before publishing.`
      );
      return;
    }
    if (orphanCitationCount > 0) {
      setError(
        `Remove the orphaned citation marker${orphanCitationCount === 1 ? "" : "s"} or restore the cited source before publishing.`
      );
      return;
    }
    if (!qualitySummary.readyForSubmission) {
      setError(warnings[0] ?? "Complete the required checks.");
      return;
    }
    if (tags.length === 0 && !allowNoTopics) {
      setConfirmPublishWithoutTopics(true);
      document
        .getElementById("article-topic-selector")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setPublishing(true);
    publishingRef.current = true;
    setError(null);

    const finalExcerpt = summary.trim() || suggestedSummary;
    let publishResult: Awaited<ReturnType<typeof publishPost>>;
    try {
      publishResult = await publishPost({
        draftId,
        title: title.trim(),
        excerpt: finalExcerpt,
        content,
        tags,
        postType,
        articleFormat: articleFormat ?? null,
        coverImageUrl: initialCoverImageUrl,
        inResponseTo,
        references: initialReferences,
        coAuthors: coAuthors.map((coAuthor, index) => ({
          user_id: coAuthor.id,
          display_order: index + 1,
        })),
      });
    } catch {
      setError("We couldn't publish this Article. Check your connection and try again.");
      setPublishing(false);
      publishingRef.current = false;
      return;
    }

    const { error: publishError, slug: publishedPostSlug } = publishResult;

    if (publishError || !publishedPostSlug) {
      setError(publishError ?? "Failed to publish.");
      setPublishing(false);
      publishingRef.current = false;
      return;
    }

    trackActivationEvent({
      event: "quality_check_completed",
      metadata: {
        draftId,
        postType: "essay",
        wordCount,
        referenceCount: validReferences.length,
      },
    });
    if (tags.length === 0) {
      trackActivationEvent({
        event: "topic_selection_skipped",
        metadata: { contentKind: "article" },
      });
    }

    try {
      await onPublished?.(publishedPostSlug);
    } catch {
      // Device-backup cleanup must never strand someone on a stale publish
      // screen after the server has already made the Article public.
    }
    router.replace(`/post/${publishedPostSlug}?justPublished=1&live=1`);
  };

  const displayName = author?.full_name?.trim() || author?.username || "You";
  const previewSummary = summary.trim() || suggestedSummary;
  const genreLabel = articleFormat ? ARTICLE_FORMAT_LABELS[articleFormat] : "Article";

  return (
    <div className="fixed inset-0 z-50 animate-fade-in bg-black/[0.48] lg:flex lg:items-center lg:justify-center lg:p-8">
      <button
        type="button"
        onClick={() => !publishing && onClose()}
        className="absolute inset-0 cursor-default"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div
        ref={dialogRef}
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[92vh] w-full max-w-[620px] animate-slide-up overflow-y-auto rounded-t-[24px] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl lg:relative lg:inset-auto lg:max-h-[90vh] lg:max-w-[920px] lg:animate-create-menu-in lg:rounded-[24px] lg:px-8 lg:pb-8 lg:pt-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-drawer-title"
        aria-describedby="publish-drawer-description"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          disabled={publishing}
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40 lg:right-5 lg:top-5"
          aria-label="Close publication review"
        >
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="pr-12">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Final review
          </p>
          <h2 id="publish-drawer-title" className="mt-1 font-display text-[24px] font-semibold leading-tight text-ink lg:text-[30px]">
            See what readers will see
          </h2>
          <p id="publish-drawer-description" className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Your Article publishes immediately. Review its feed summary, attribution,
            sources, and discovery settings before it goes public.
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.18fr)_minmax(300px,0.82fr)]">
          <div className="min-w-0 space-y-5">
            <section aria-labelledby="preview-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 id="preview-heading" className="text-sm font-semibold text-ink">Preview</h3>
                <span className="text-xs text-gray-400">Live surfaces</span>
              </div>
              <PreviewTabs value={previewSurface} onChange={setPreviewSurface} />

              <div
                id="publication-preview-panel"
                role="tabpanel"
                aria-labelledby={`publication-preview-tab-${previewSurface}`}
                className="mt-3 min-h-[250px] overflow-hidden rounded-2xl border border-gray-200 bg-canvas"
              >
                {previewSurface === "feed" ? (
                  <article className="bg-white">
                    {initialCoverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={initialCoverImageUrl} alt="Article cover preview" className="h-36 w-full object-cover sm:h-44" />
                    ) : (
                      <div className="flex h-28 items-center justify-center bg-gradient-to-br from-emerald-50 to-amber-50 text-xs font-medium text-gray-400 sm:h-36">
                        Cover is optional
                      </div>
                    )}
                    <div className="p-5">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-semibold text-emerald-700">{genreLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{wordCount.toLocaleString()} words</span>
                      </div>
                      <h4 className="mt-2 font-display text-xl font-semibold leading-snug text-ink">{title || "Untitled Article"}</h4>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">{previewSummary || "Your feed summary will appear here."}</p>
                      <p className="mt-4 text-xs font-medium text-gray-500">By {displayName}{coAuthors.length ? ` + ${coAuthors.length} invited collaborator${coAuthors.length === 1 ? "" : "s"}` : ""}</p>
                    </div>
                  </article>
                ) : null}

                {previewSurface === "article" ? (
                  <article className="bg-white px-6 py-7 sm:px-9 sm:py-9">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">{genreLabel}</p>
                    <h4 className="mt-3 font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl">{title || "Untitled Article"}</h4>
                    <p className="mt-3 text-sm leading-6 text-gray-500">{previewSummary}</p>
                    <div className="my-5 h-px bg-gray-100" />
                    <p className="line-clamp-6 font-serif text-[15px] leading-7 text-gray-700">{bodyPreview || "Your Article body will appear here."}</p>
                  </article>
                ) : null}

                {previewSurface === "record" ? (
                  <div className="p-5 sm:p-7">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Intellectual Record</p>
                    <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-emerald-700">Published Article</p>
                          <h4 className="mt-1 truncate font-display text-lg font-semibold text-ink">{title || "Untitled Article"}</h4>
                          <p className="mt-2 text-xs leading-5 text-gray-500">{validReferences.length > 0 ? `Source-backed · ${validReferences.length} source${validReferences.length === 1 ? "" : "s"}` : "Add sources when they strengthen your argument."}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Public</span>
                      </div>
                    </div>
                    <p className="mt-4 text-xs leading-5 text-gray-500">This is contribution history, not a quality score. Genre and sources are shown as descriptive context.</p>
                  </div>
                ) : null}
              </div>
            </section>

            <section>
              <label htmlFor="article-feed-summary" className="text-sm font-semibold text-ink">Feed summary</label>
              <p className="mt-1 text-xs leading-5 text-gray-500">This is the one- or two-sentence promise readers see before opening the Article. We suggested a starting point from your draft. Edit it in your own voice.</p>
              <textarea
                id="article-feed-summary"
                value={summary}
                onChange={(event) => handleSummaryChange(event.target.value.slice(0, 300))}
                rows={3}
                maxLength={300}
                disabled={publishing}
                className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm leading-6 text-ink outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-gray-50"
              />
              <p className="mt-1 text-right text-[11px] text-gray-400">{summary.length}/300</p>
            </section>

            {responseContext ? (
              <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Response context</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{responseContext.title}</p>
                {responseContext.author ? <p className="mt-1 text-xs text-gray-500">By @{responseContext.author}</p> : null}
              </section>
            ) : null}
          </div>

          <div className="min-w-0 space-y-5">
            <section>
              <p className="mb-2 text-sm font-semibold text-ink">Cover image</p>
              <CoverImageUploader
                initialUrl={initialCoverImageUrl}
                onUpload={(url) => onMetadataChange?.({ coverImageUrl: url })}
                onRemove={() => onMetadataChange?.({ coverImageUrl: "" })}
                onUploadingChange={onCoverUploadingChange}
              />
            </section>

            <section>
              <PublishingTopicSelector
                id="article-topic-selector"
                contentKind="article"
                title={title}
                content={content}
                value={tags}
                maxTopics={MAX_LONG_FORM_TOPICS}
                onChange={handleTagChange}
                disabled={publishing}
              />
            </section>

            <section>
              <p className="mb-1 text-sm font-semibold text-ink">Genre <span className="font-normal text-gray-400">optional</span></p>
              <p className="mb-2.5 text-xs leading-5 text-gray-500">Descriptive context only. It never changes publication timing or implies review.</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: null, label: "General" },
                  { value: "essay" as ArticleFormat, label: ARTICLE_FORMAT_LABELS.essay },
                  { value: "policy_brief" as ArticleFormat, label: ARTICLE_FORMAT_LABELS.policy_brief },
                ] as const).map((option) => {
                  const selected = articleFormat === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => handleArticleFormatChange(option.value)}
                      aria-pressed={selected}
                      disabled={publishing}
                      className={`min-h-10 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${selected ? "border-emerald-brand bg-green-tint text-emerald-brand" : "border-gray-200 bg-white text-gray-700 hover:border-emerald-brand hover:text-emerald-brand"}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">Sources</p>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600">{validReferences.length}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500">{validReferences.length ? `${validReferences.length} structured source${validReferences.length === 1 ? " is" : "s are"} attached to this Article.` : "No sources attached. Sources are optional for Articles, but useful when readers should verify a claim."}</p>
              {incompleteReferenceCount > 0 ? (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  Complete or remove {incompleteReferenceCount} incomplete source{incompleteReferenceCount === 1 ? "" : "s"} before publishing.
                </p>
              ) : null}
              {orphanCitationCount > 0 ? (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  {orphanCitationCount} citation marker{orphanCitationCount === 1 ? "" : "s"} no longer has a source. Keep editing to remove the marker or restore the source.
                </p>
              ) : null}
            </section>

            {currentUserId ? (
              <CoAuthorPicker
                userId={currentUserId}
                value={coAuthors}
                onChange={handleCoAuthorChange}
                source="publish_drawer"
                disabled={publishing}
              />
            ) : null}

            <section className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
              <p className="text-sm font-semibold text-emerald-900">Public immediately</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-emerald-800">
                <li>Appears on your profile and Intellectual Record</li>
                <li>Eligible for Home, Explore, and selected topic feeds</li>
                <li>Followers may receive it through their publication preferences</li>
              </ul>
            </section>
          </div>
        </div>

        <div className="mt-6 space-y-3 border-t border-gray-100 pt-5">
          {warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              {warnings[0]}
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          {confirmPublishWithoutTopics && tags.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">Publish without topics?</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">The Article can still publish, but topics help interested readers find it.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setConfirmPublishWithoutTopics(false); document.getElementById("article-topic-selector")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className="min-h-10 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900">Add topics</button>
                <button type="button" onClick={() => void handlePublish(true)} className="min-h-10 rounded-lg bg-amber-800 px-3 text-xs font-semibold text-white">Publish without topics</button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={publishing} className="sm:min-w-28">Keep editing</Button>
            <Button type="button" size="lg" loading={publishing} disabled={!metadataReady || incompleteReferenceCount > 0 || orphanCitationCount > 0 || !qualitySummary.readyForSubmission || coverUploading} onClick={() => void handlePublish()} className="sm:min-w-44">Publish now</Button>
          </div>
          <p className="text-center text-[11px] leading-5 text-gray-400 sm:text-right">Publishing is immediate. You can edit the Article afterward.</p>
        </div>
      </div>
    </div>
  );
}
