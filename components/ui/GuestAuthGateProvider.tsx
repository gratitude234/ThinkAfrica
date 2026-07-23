"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ContentKind } from "@/lib/contentModel";
import {
  buildLoginHref,
  getCurrentRelativePath,
  getGuestAuthCopy,
  type GuestAuthIntent,
} from "@/lib/guestAuth";

interface RequestAuthOptions {
  contentKind?: ContentKind | null;
}

interface GuestAuthGateContextValue {
  /** Opens the contextual sign-in gate for a guest attempting `intent`. */
  requestAuth: (intent: GuestAuthIntent, options?: RequestAuthOptions) => void;
}

const GuestAuthGateContext = createContext<GuestAuthGateContextValue | null>(null);

/**
 * One reusable guest-auth gate/modal for the whole app -- Like, Save,
 * Respond, and Create all call `requestAuth(intent, { contentKind })`
 * instead of redirecting straight to /login or duplicating dialog markup.
 * Mounted once in app/(main)/layout.tsx so every route in that group shares
 * a single modal instance.
 */
export function useGuestAuthGate() {
  const context = useContext(GuestAuthGateContext);
  if (!context) {
    throw new Error("useGuestAuthGate must be used within GuestAuthGateProvider");
  }
  return context;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function GuestAuthGateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState<{
    intent: GuestAuthIntent;
    contentKind: ContentKind | null;
  } | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setPending(null);
    triggerRef.current?.focus();
  }, []);

  const requestAuth = useCallback(
    (intent: GuestAuthIntent, options?: RequestAuthOptions) => {
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPending({ intent, contentKind: options?.contentKind ?? null });
    },
    []
  );

  useEffect(() => {
    if (!pending) return;

    const container = containerRef.current;
    container?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }

      if (event.key !== "Tab" || !container) return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [pending, close]);

  const value = useMemo<GuestAuthGateContextValue>(() => ({ requestAuth }), [requestAuth]);

  const copy = pending ? getGuestAuthCopy(pending.intent, pending.contentKind) : null;
  const loginHref = pending ? buildLoginHref(getCurrentRelativePath()) : "#";

  const modal =
    pending && copy ? (
      <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:p-4">
        <div
          className="absolute inset-0 bg-black/40"
          onClick={close}
          aria-hidden="true"
        />
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className="relative w-full max-w-sm animate-create-sheet-up rounded-t-[20px] bg-white p-6 text-center shadow-2xl outline-none motion-reduce:animate-none sm:animate-create-menu-in sm:rounded-2xl"
          style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
        >
          <div
            className="mx-auto mb-4 h-1 w-9 rounded-full bg-gray-200 sm:hidden"
            aria-hidden="true"
          />
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-tint"
            aria-hidden="true"
          >
            <svg
              className="h-5 w-5 text-emerald-brand"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
            </svg>
          </div>

          <h2 id={titleId} className="font-display text-[19px] font-semibold text-ink">
            {copy.title}
          </h2>
          <p id={descriptionId} className="mt-2 text-[13.5px] text-ink-muted">
            {copy.description}
          </p>

          <a
            href={loginHref}
            onClick={close}
            className="mt-5 block w-full rounded-lg bg-emerald-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Sign in
          </a>
          <button
            type="button"
            onClick={close}
            className="mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Continue browsing
          </button>
        </div>
      </div>
    ) : null;

  return (
    <GuestAuthGateContext.Provider value={value}>
      {children}
      {modal && typeof document !== "undefined" ? createPortal(modal, document.body) : null}
    </GuestAuthGateContext.Provider>
  );
}
