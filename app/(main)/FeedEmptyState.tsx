import type { ReactNode } from "react";

export default function FeedEmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{body}</p>
      {cta ? <div className="mt-5 flex justify-center">{cta}</div> : null}
    </div>
  );
}
