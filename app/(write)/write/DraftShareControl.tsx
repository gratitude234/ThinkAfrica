"use client";

import { useEffect, useState } from "react";
import { createDraftShareLink, revokeDraftShareLink } from "./shareActions";

/**
 * "Can you read this before I post it?" is how most serious writing gets
 * finished, and until now the only way to do it here was to publish and hope.
 * The link needs no account on the other end, because the person a student
 * most wants to read a draft is usually their supervisor, who does not have
 * one.
 *
 * Controlled by the composer rather than holding its own token. The composer
 * needs to know a link is live in order to say so in the header, and that has
 * to be true before this drawer has ever been opened.
 */
export default function DraftShareControl({
  postId,
  token,
  onTokenChange,
}: {
  postId: string;
  token: string | null;
  onTokenChange: (token: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read in an effect rather than during render. This component is server
  // rendered along with the composer, and `window` does not exist there.
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = token && origin ? `${origin}/draft/${token}` : null;

  const create = async () => {
    setBusy(true);
    setError(null);
    const result = await createDraftShareLink({ postId });
    setBusy(false);
    if (result.error || !result.token) {
      setError(result.error ?? "We couldn't create a link.");
      return;
    }
    onTokenChange(result.token);
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    const result = await revokeDraftShareLink({ postId });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onTokenChange(null);
    setCopied(false);
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy. Select the link and copy it by hand.");
    }
  };

  return (
    <div>
      {token && url ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Draft share link"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-card-border bg-canvas px-3 text-sm text-ink-soft outline-none focus:ring-2 focus:ring-emerald-brand"
            />
            <button
              type="button"
              onClick={() => void copy()}
              className="min-h-11 rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-meta text-ink-muted">
              Anyone with this link can read the draft. It stops working when you publish or revoke it.
            </p>
            <button
              type="button"
              onClick={() => void revoke()}
              disabled={busy}
              className="min-h-9 shrink-0 rounded-lg px-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Revoke
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy}
            className="min-h-11 rounded-lg border border-card-border bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create share link"}
          </button>
          <p className="mt-2 text-meta text-ink-muted">
            A private, unlisted address for this draft. No account needed to read it.
          </p>
        </>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
