"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/ui/UserAvatar";
import "./search-overlay.css";

interface PublicationResult {
  id: string;
  title: string | null;
  excerpt?: string | null;
  slug: string;
  content_kind?: string | null;
  profiles: { full_name: string | null; username: string } | null;
}
interface WriterResult {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}
interface Result {
  id: string;
  label: string;
  detail: string;
  kind: "Post" | "Article" | "Writer";
  url: string;
  avatar?: string | null;
}
interface SearchOverlayProps { isOpen: boolean; onClose: () => void; }

// Text only: legacy markup is never inserted into the result row as HTML.
function plainExcerpt(value: string | null | undefined) {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

export default function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setQuery(""); setResults([]); setFocusedIndex(0); setFailed(false);
    // Native modality makes the background inert and traps keyboard focus.
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute("open", "");
    inputRef.current?.focus();
    return () => {
      dialog?.close?.();
      document.body.style.overflow = oldOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !query.trim()) { setLoading(false); return; }
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?scope=overlay&q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search unavailable");
        const payload = await response.json() as { posts?: PublicationResult[]; people?: WriterResult[] };
        if (!current) return;
        const posts: Result[] = (payload.posts ?? []).slice(0, 6).map(post => ({
          id: `post-${post.id}`,
          label: post.content_kind === "post" ? plainExcerpt(post.excerpt) || "Post" : post.title || plainExcerpt(post.excerpt) || "Article",
          detail: post.profiles?.full_name || post.profiles?.username || "",
          kind: post.content_kind === "post" ? "Post" : "Article",
          url: `/post/${encodeURIComponent(post.slug)}`,
        }));
        const people: Result[] = (payload.people ?? []).slice(0, 3).map(person => ({
          id: `writer-${person.id}`, label: person.full_name || person.username,
          detail: `@${person.username}`, kind: "Writer", avatar: person.avatar_url,
          url: `/${encodeURIComponent(person.username)}`,
        }));
        setResults([...posts, ...people]); setFocusedIndex(0);
      } catch {
        if (current) { setResults([]); setFailed(true); }
      } finally { if (current) setLoading(false); }
    }, 300);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [isOpen, query]);

  useEffect(() => {
    if (isOpen) document.getElementById(`search-result-${focusedIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [focusedIndex, isOpen]);

  function changeQuery(value: string) {
    setQuery(value); setResults([]); setFocusedIndex(0); setFailed(false); setLoading(Boolean(value.trim()));
  }

  if (!isOpen) return null;
  return <dialog ref={dialogRef} className="global-search-backdrop" aria-modal="true" aria-labelledby="search-overlay-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input'));
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <div className="global-search-panel">
      <h2 id="search-overlay-title" className="sr-only">Search Indegenius</h2>
      <div className="global-search-input-row">
        <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input ref={inputRef} value={query} onChange={event => changeQuery(event.target.value)}
          aria-label="Search Indegenius" aria-controls="global-search-results" autoComplete="off"
          placeholder="Search posts, articles, writers…"
          onKeyDown={event => {
            if (!results.length) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setFocusedIndex(index => (index + (event.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
            } else if (event.key === "Enter") {
              event.preventDefault(); router.push(results[focusedIndex].url); onClose();
            }
          }} />
        {query ? <button type="button" aria-label="Clear search" onClick={() => { changeQuery(""); inputRef.current?.focus(); }}>×</button> : null}
        <button type="button" className="global-search-close" onClick={onClose} aria-label="Close search">Close</button>
      </div>
      <div className="global-search-results" id="global-search-results" aria-label="Search results" aria-busy={loading}>
        <p className="sr-only" role="status">{loading ? "Searching" : `${results.length} results`}{results[focusedIndex] ? `, ${results[focusedIndex].label}` : ""}</p>
        {!query.trim() ? <p className="global-search-message">Search posts, articles, writers…</p> : loading ? <p className="global-search-message">Searching…</p>
          : failed ? <p className="global-search-message" role="alert">Search is unavailable. Please try again.</p>
          : !results.length ? <p className="global-search-message">No results found for “{query}”</p> : null}
        {results.map((result, index) => <Link key={result.id} id={`search-result-${index}`} href={result.url}
          onClick={onClose} onFocus={() => setFocusedIndex(index)}
          className={`global-search-result${focusedIndex === index ? " is-selected" : ""}`}>
          {result.kind === "Writer" ? <UserAvatar name={result.label} src={result.avatar} size={30} /> : null}
          <span className="global-search-text"><span className="global-search-title">{result.label}</span><span className="global-search-detail">{result.detail}</span></span>
          <span className={`global-search-kind kind-${result.kind.toLowerCase()}`}>{result.kind}</span>
        </Link>)}
      </div>
      {query.trim() ? <Link className="global-search-all" href={`/search?q=${encodeURIComponent(query.trim())}`} onClick={onClose}>See all results</Link> : null}
    </div>
  </dialog>;
}
