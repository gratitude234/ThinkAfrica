"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { POST_TYPE_LABELS, type PostType } from "@/lib/utils";

interface PostCoverProps {
  src?: string | null;
  alt: string;
  type?: string | null;
  className?: string;
  imageClassName?: string;
  fit?: "cover" | "contain";
  sizes?: string;
  priority?: boolean;
  unoptimized?: boolean;
}

const FALLBACK_STYLES: Record<string, string> = {
  blog: "from-emerald-900 to-emerald-700 text-emerald-100/55",
  essay: "from-amber-100 to-amber-200 text-amber-900/45",
  research: "from-purple-100 to-purple-200 text-purple-900/45",
  policy_brief: "from-blue-100 to-blue-200 text-blue-900/45",
};

function normalizeType(type: string | null | undefined): PostType {
  if (
    type === "blog" ||
    type === "essay" ||
    type === "policy_brief" ||
    type === "research"
  ) {
    return type;
  }

  return "blog";
}

function shouldBypassOptimizer(src: string | null | undefined) {
  if (!src) return false;

  try {
    const url = new URL(src);
    return (
      url.hostname.endsWith(".supabase.co") &&
      url.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

export default function PostCover({
  src,
  alt,
  type,
  className = "",
  imageClassName,
  fit = "cover",
  sizes = "100vw",
  priority = false,
  unoptimized,
}: PostCoverProps) {
  const [failed, setFailed] = useState(false);
  const postType = normalizeType(type);
  const typeLabel = POST_TYPE_LABELS[postType] ?? "Post";
  const fallbackStyle = FALLBACK_STYLES[postType] ?? FALLBACK_STYLES.blog;
  const imageUnoptimized = useMemo(
    () => unoptimized ?? shouldBypassOptimizer(src),
    [src, unoptimized]
  );
  const resolvedImageClassName =
    imageClassName ?? (fit === "contain" ? "object-contain" : "object-cover");
  const containerClassName = fit === "contain" ? `bg-white ${className}` : className;

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden bg-gradient-to-br ${fallbackStyle} ${className}`}
      >
        <span className="px-3 text-center text-[11px] font-bold uppercase tracking-[0.15em]">
          {typeLabel}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${containerClassName}`}
      data-lite-placeholder={`${typeLabel} cover image`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        preload={priority}
        fetchPriority={priority ? "high" : undefined}
        unoptimized={imageUnoptimized}
        className={resolvedImageClassName}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
