"use client";

import { useRef, useState } from "react";
import PostCover from "@/components/post/PostCover";
import type {
  ProfileSettingsModel,
  ProfileSettingsWorkOption,
} from "@/lib/profileSettings";
import { formatDate } from "@/lib/utils";
import { loadSelectedWorkPage, saveSelectedWorkSection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave, useUnsavedChangesWarning } from "../useSectionSave";

export default function SelectedWorkSection({
  model,
}: {
  model: ProfileSettingsModel;
}) {
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(
    model.selectedWorkId,
  );
  const [saved, setSaved] = useState<string | null>(model.selectedWorkId);
  const [options, setOptions] = useState(model.selectedWorkOptions);
  const [known, setKnown] = useState(model.selectedWorkOptions);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(model.selectedWorkHasMore ?? false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const requestId = useRef(0);
  const chosen = known.find((work) => work.id === selectedWorkId);
  const merge = (
    left: ProfileSettingsWorkOption[],
    right: ProfileSettingsWorkOption[],
  ) => [
    ...new Map([...left, ...right].map((work) => [work.id, work])).values(),
  ];
  const browse = async (nextPage: number, search: string) => {
    const request = ++requestId.current;
    setLoading(true);
    setSearchError(null);
    try {
      const result = await loadSelectedWorkPage({
        query: search,
        page: nextPage,
      });
      if (request !== requestId.current) return;
      if (!result.ok) {
        setSearchError(result.error ?? "Could not load your work. Try again.");
        return;
      }
      setOptions((current) =>
        nextPage === 0 ? result.items : merge(current, result.items),
      );
      setKnown((current) => merge(current, result.items));
      setHasMore(result.hasMore);
      setPage(nextPage);
      setAppliedQuery(search);
    } catch {
      if (request === requestId.current)
        setSearchError("Could not load your work. Try again.");
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  };
  const isDirty = selectedWorkId !== saved;
  useUnsavedChangesWarning(isDirty);

  const { status, error, save } = useSectionSave({
    section: "selected-work",
    profileId: model.id,
    isDirty,
  });

  return (
    <SectionShell
      section="selected-work"
      status={status}
      error={error}
      onSave={() =>
        void save(async () => {
          const result = await saveSelectedWorkSection({
            postId: selectedWorkId,
          });
          if (result.ok) setSaved(selectedWorkId);
          return result;
        })
      }
      canSave={isDirty}
      footnote="Only one work is selected. You can change or clear it at any time."
    >
      {model.selectedWorkUnavailable ? (
        <div
          role="status"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
        >
          Your previously selected work is no longer published. Choose another
          work, or select
          <strong> No selected work</strong> and save to clear the old
          selection.
        </div>
      ) : null}

      {chosen ? (
        <div
          className="mb-5 overflow-hidden rounded-xl border border-card-border bg-card"
          aria-label="Selected work preview"
        >
          {chosen.coverImageUrl ? (
            <PostCover
              src={chosen.coverImageUrl}
              alt=""
              content_kind={chosen.kind}
              sizes="600px"
              className="h-40 w-full"
            />
          ) : null}
          <div className="p-4">
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {chosen.kind === "article" ? "Article" : "Post"} · Selected work
              preview
            </p>
            <h3 className="mt-2 font-display text-2xl">{chosen.title}</h3>
            {chosen.kind === "article" && chosen.excerpt ? (
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                {chosen.excerpt}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void browse(0, query.trim());
        }}
        role="search"
        aria-label="Find published work"
      >
        <label htmlFor="selected-work-search" className="sr-only">
          Search published work
        </label>
        <input
          id="selected-work-search"
          type="search"
          value={query}
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search titles or text, including older work"
          className="min-w-0 flex-1 rounded-lg border border-card-border bg-card px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="focus-ring min-h-11 rounded-lg border border-card-border px-4 text-sm disabled:opacity-50"
        >
          {loading ? "Loading…" : "Search"}
        </button>
      </form>
      {searchError ? (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {searchError}
        </p>
      ) : null}
      <p className="mb-2 text-xs text-ink-muted" aria-live="polite">
        {appliedQuery
          ? `Results for “${appliedQuery}”`
          : "Newest published work first"}
      </p>
      <fieldset aria-busy={loading}>
        <legend className="sr-only">Select work for your profile</legend>
        <div className="divide-y divide-card-border border-y border-card-border">
          <label className="flex cursor-pointer items-start gap-3 py-4">
            <input
              type="radio"
              name="selected-work"
              checked={selectedWorkId === null}
              onChange={() => setSelectedWorkId(null)}
              className="mt-1 h-4 w-4 accent-emerald-brand"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">
                No selected work
              </span>
              <span className="mt-1 block text-xs leading-5 text-ink-muted">
                Your profile will begin with your Intellectual Record and Recent
                Work.
              </span>
            </span>
          </label>
          {options.map((work) => (
            <label
              key={work.id}
              className="flex cursor-pointer items-start gap-3 py-4"
            >
              <input
                type="radio"
                name="selected-work"
                value={work.id}
                checked={selectedWorkId === work.id}
                onChange={() => setSelectedWorkId(work.id)}
                className="mt-1 h-4 w-4 accent-emerald-brand"
              />
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  {work.kind === "article" ? "Article" : "Post"}
                </span>
                <span className="mt-1 block text-sm font-semibold leading-6 text-ink">
                  {work.title}
                </span>
                {work.publishedAt ? (
                  <span className="mt-1 block text-xs text-ink-muted">
                    {formatDate(work.publishedAt)}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
        {options.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            {appliedQuery
              ? "No published work matches this search. Try another title or phrase."
              : "Publish a Post or Article first. Once you do, it can be selected here to represent your work."}
          </p>
        ) : null}
      </fieldset>
      {hasMore ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void browse(page + 1, appliedQuery)}
          className="focus-ring mt-4 min-h-11 rounded-lg border border-card-border px-4 text-sm disabled:opacity-50"
        >
          Load older work
        </button>
      ) : null}
    </SectionShell>
  );
}
