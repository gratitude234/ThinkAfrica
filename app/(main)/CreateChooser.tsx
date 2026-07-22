"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { CREATE_ACTIONS, getCreateHref } from "./createActions";

function PostIcon({ className = "h-5 w-5" }: { className?: string }) {
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
        d="M7 8.5h10M7 12.25h6.5M5.75 19 9 15.75h8.25A2.75 2.75 0 0020 13V7.75A2.75 2.75 0 0017.25 5H6.75A2.75 2.75 0 004 7.75V13a2.75 2.75 0 002.75 2.75H7V19z"
      />
    </svg>
  );
}

function ArticleIcon({ className = "h-5 w-5" }: { className?: string }) {
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

function ResearchIcon({ className = "h-5 w-5" }: { className?: string }) {
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
        d="M9 7h6M9 10.5h6M9 14h3.5M7 4.25h10a1.5 1.5 0 0 1 1.5 1.5V18a1.75 1.75 0 0 1-1.75 1.75H8.25A1.75 1.75 0 0 1 6.5 18V5.75a1.5 1.5 0 0 1 1.5-1.5z"
      />
    </svg>
  );
}

const ACTION_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  post: PostIcon,
  article: ArticleIcon,
  "research-paper": ResearchIcon,
};

interface CreateChooserOptionsProps {
  userId: string | null;
  /** "comfortable" = large mobile-sheet rows (~68px). "compact" = desktop popover rows. */
  size: "comfortable" | "compact";
  onSelect?: () => void;
}

export function CreateChooserOptions({ userId, size, onSelect }: CreateChooserOptionsProps) {
  return (
    <div className={size === "comfortable" ? "flex flex-col gap-1.5 p-3" : "grid gap-1 p-2"}>
      {CREATE_ACTIONS.map((action) => {
        const Icon = ACTION_ICONS[action.id];
        return (
          <Link
            key={action.id}
            href={getCreateHref(action.href, userId)}
            onClick={onSelect}
            className={
              size === "comfortable"
                ? "flex min-h-[68px] w-full items-start gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-canvas active:bg-canvas"
                : "flex items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-canvas"
            }
          >
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
              aria-hidden="true"
            >
              <Icon className={size === "comfortable" ? "h-[18px] w-[18px]" : "h-4 w-4"} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-gray-900">
                {action.label}
              </span>
              <span className="mt-0.5 block text-[13px] leading-5 text-gray-500">
                {action.description}
              </span>
              <span className="mt-1.5 inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                {action.badge}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
