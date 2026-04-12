"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { POST_POINTS, POST_TYPE_LABELS } from "@/lib/utils";

const steps = [
  { label: "Drafted", status: "done" },
  { label: "Under Review", status: "current" },
  { label: "Published", status: "pending" },
] as const;

function StepIcon({ status }: { status: (typeof steps)[number]["status"] }) {
  if (status === "done") {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
        <svg
          className="h-3.5 w-3.5 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
    );
  }

  if (status === "current") {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
      </div>
    );
  }

  return <div className="h-6 w-6 rounded-full border-2 border-dashed border-gray-300" />;
}

export default function SubmittedPage() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") ?? "";
  const type = searchParams.get("type") ?? "blog";
  const typeLabel = POST_TYPE_LABELS[type] ?? "Post";
  const points = POST_POINTS[type] ?? 10;

  return (
    <div className="mx-auto max-w-lg py-20">
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-8 w-8 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Your post is under review</h1>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              {typeLabel}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              +{points} points earned
            </span>
          </div>
          {slug ? (
            <p className="mt-3 text-xs text-gray-400">Reference: /post/{slug}</p>
          ) : null}
        </div>

        <div className="mt-8">
          <p className="mb-4 text-sm font-semibold text-gray-900">Timeline</p>
          {steps.map((step, index) => (
            <div key={step.label}>
              <div className="flex items-center gap-3 py-2">
                <StepIcon status={step.status} />
                <span
                  className={`text-sm ${
                    step.status === "done"
                      ? "text-gray-700"
                      : step.status === "current"
                        ? "font-medium text-gray-900"
                        : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 ? <div className="ml-3 h-6 w-px bg-gray-200" /> : null}
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">What happens next</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Our editorial team reviews every submission within 24-48 hours. You&apos;ll
            get a notification when your post goes live.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="flex-1 rounded-xl border border-gray-300 px-5 py-3 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            View my posts
          </Link>
          <Link
            href="/write"
            className="flex-1 rounded-xl bg-emerald-brand px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            Write another
          </Link>
        </div>
      </div>
    </div>
  );
}
