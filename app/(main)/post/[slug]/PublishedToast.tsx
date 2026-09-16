"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface RelatedTarget {
  id: string;
  title: string;
  slug: string;
}

interface Props {
  postId: string;
  contentKind: string | null;
  title: string;
  slug: string;
  username: string;
  relatedTarget: RelatedTarget | null;
}

export default function PublishedToast({ slug }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const justPublished = searchParams.get("justPublished") === "1";
  const [open, setOpen] = useState(justPublished);

  useEffect(() => {
    if (justPublished) router.replace(`/post/${slug}`, { scroll: false });
  }, [justPublished, router, slug]);

  if (!open) return null;

  return (
    <section
      role="status"
      className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
    >
      <p className="text-sm font-semibold text-emerald-950">
        Published successfully.
      </p>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="focus-ring min-h-10 rounded-lg px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
      >
        Dismiss
      </button>
    </section>
  );
}