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

function ComposeIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m11.75 14.25.45-2.35 5.55-5.55a1.6 1.6 0 0 1 2.25 0l.15.15a1.6 1.6 0 0 1 0 2.25l-5.55 5.55-2.35.45.5-2.35"
      />
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
      <div className="md:hidden">
        <Link
          href={getCreateHref("/write", userId)}
          className="group fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_8px_20px_-7px_rgb(7_57_41/0.5)] ring-1 ring-black/5 transition-[background-color,box-shadow,transform] duration-200 hover:bg-emerald-700 hover:shadow-[0_10px_24px_-7px_rgb(7_57_41/0.55)] active:scale-[0.96] motion-reduce:transition-none"
          aria-label="Start writing"
        >
          <ComposeIcon className="h-[25px] w-[25px] transition-transform duration-200 group-active:scale-95 motion-reduce:transition-none" />
        </Link>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative hidden sm:inline-flex">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors ${
          isActive ? "bg-ink" : "bg-emerald-brand hover:bg-[#0E4B37]"
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
              Format is chosen when you publish.
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
