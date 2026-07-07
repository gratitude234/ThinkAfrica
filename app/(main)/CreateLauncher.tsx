"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CREATE_ACTIONS, getCreateHref } from "./createActions";

interface CreateLauncherProps {
  userId: string | null;
  variant?: "desktop" | "mobileFab";
  isActive?: boolean;
}

function PlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function actionTone(category: string) {
  if (category === "community") return "bg-purple-50 text-purple-700";
  if (category === "profile") return "bg-blue-50 text-blue-700";
  return "bg-emerald-50 text-emerald-700";
}

export default function CreateLauncher({
  userId,
  variant = "desktop",
  isActive = false,
}: CreateLauncherProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (variant === "mobileFab") {
    return (
      <div ref={rootRef} className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-brand text-white shadow-[0_12px_24px_-8px_rgb(16_185_129/0.65)] transition-[background-color,transform] duration-200 hover:bg-emerald-600 active:scale-95 motion-reduce:transition-none"
          aria-label="Create"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
        >
          <PlusIcon
            className={`h-6 w-6 transition-transform duration-200 motion-reduce:transition-none ${
              open ? "rotate-45" : "group-active:rotate-45"
            }`}
          />
        </button>

        {open ? (
          <div className="fixed inset-0 z-[70] animate-fade-in bg-black/40 motion-reduce:animate-none">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              onClick={() => setOpen(false)}
              aria-label="Close create menu"
            />
            <div
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${panelId}-title`}
              className="absolute inset-x-0 bottom-0 max-h-[82vh] animate-create-sheet-up overflow-y-auto rounded-t-3xl bg-white px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4 shadow-2xl motion-reduce:animate-none"
            >
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-200" />
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 id={`${panelId}-title`} className="text-lg font-semibold text-ink">
                    Create
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Start with the contribution that fits your idea.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-1 text-2xl leading-none text-gray-400 hover:bg-canvas hover:text-gray-600"
                  aria-label="Close create menu"
                >
                  x
                </button>
              </div>
              <div className="space-y-2">
                {CREATE_ACTIONS.map((action, index) => (
                  <Link
                    key={action.id}
                    href={getCreateHref(action.href, userId)}
                    onClick={() => setOpen(false)}
                    className="block animate-create-item-in rounded-2xl border border-gray-200 bg-white p-4 opacity-0 transition-colors hover:border-emerald-200 hover:bg-canvas motion-reduce:animate-none motion-reduce:opacity-100"
                    style={{ animationDelay: `${index * 35}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {action.label}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-gray-500">
                          {action.description}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${actionTone(
                          action.category
                        )}`}
                      >
                        {action.badge}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative hidden sm:inline-flex">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors ${
          isActive ? "bg-ink" : "bg-emerald-brand hover:bg-emerald-600"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <PlusIcon className="h-3.5 w-3.5" />
        Create
      </button>

      {open ? (
        <div
          id={panelId}
          role="menu"
          className="absolute right-0 top-[calc(100%+10px)] z-[80] w-[380px] animate-create-menu-in overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl motion-reduce:animate-none"
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink">Create on Indegenius</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Choose the format before the workspace opens.
            </p>
          </div>
          <div className="grid gap-1 p-2">
            {CREATE_ACTIONS.map((action, index) => (
              <Link
                key={action.id}
                role="menuitem"
                href={getCreateHref(action.href, userId)}
                onClick={() => setOpen(false)}
                className="animate-create-item-in rounded-xl px-3 py-3 opacity-0 transition-colors hover:bg-canvas motion-reduce:animate-none motion-reduce:opacity-100"
                style={{ animationDelay: `${index * 25}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {action.label}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      {action.description}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${actionTone(
                      action.category
                    )}`}
                  >
                    {action.badge}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
