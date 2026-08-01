"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { POST_TYPE_LABELS, type PostType } from "@/lib/utils";
import {
  getArticleFormatLabel,
  getContentKindLabel,
  resolveArticleFormat,
  resolveContentKind,
} from "@/lib/contentModel";

interface PostCoverProps {
  src?: string | null;
  alt: string | null | undefined;
  type?: string | null;
  // Optional new-model columns, mirroring components/ui/Badge.tsx -- when a
  // caller supplies these, the fallback placeholder's label (shown when
  // there's no cover image) stays consistent with the resolved label shown
  // in the adjacent Badge for the same post, instead of a raw `type` label
  // that can diverge for a Policy-Brief-format Article (whose legacy type
  // is always "essay" -- see lib/contentModel.ts). Callers that don't pass
  // them yet still get the legacy-type-only label, unchanged.
  content_kind?: string | null;
  article_format?: string | null;
  className?: string;
  imageClassName?: string;
  // "cover"/"contain" size the image inside whatever box `className` sets
  // (callers pass an aspect utility). "natural" instead lets the image's own
  // proportions drive the box height: the container's aspect ratio is taken
  // from the loaded image and clamped to NATURAL_*_RATIO, so a portrait photo
  // stays portrait instead of being sliced into a 16/9 letterbox.
  fit?: "cover" | "contain" | "natural";
  sizes?: string;
  priority?: boolean;
  unoptimized?: boolean;
}

const FALLBACK_STYLES: Record<string, string> = {
  blog: "from-emerald-brand to-[#0E4B37] text-green-tint/45",
  essay: "from-gold-ink to-gold text-gold-tint/45",
  research: "from-purple-accent to-[#6B4A94] text-purple-tint/45",
  policy_brief: "from-purple-accent to-[#6B4A94] text-purple-tint/45",
};

// Bounds for `fit="natural"`, mirroring how a timeline shows attached media:
// anything between a tall portrait and a wide landscape is shown uncropped,
// and only the extremes (panoramas, very tall screenshots) get trimmed.
const NATURAL_MIN_RATIO = 3 / 4;
const NATURAL_MAX_RATIO = 16 / 9;
// Height reserved before the image reports its intrinsic size.
const NATURAL_DEFAULT_RATIO = 16 / 9;

function clampNaturalRatio(width: number, height: number) {
  if (!width || !height) return null;
  return Math.min(NATURAL_MAX_RATIO, Math.max(NATURAL_MIN_RATIO, width / height));
}

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
  content_kind,
  article_format,
  className = "",
  imageClassName,
  fit = "cover",
  sizes = "100vw",
  priority = false,
  unoptimized,
}: PostCoverProps) {
  const [failed, setFailed] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const postType = normalizeType(type);
  // Measured off the element rather than next/image's `onLoad`, which fires
  // asynchronously behind a decode() promise. A cached image can also be
  // complete before the ref runs, so check for that too.
  const measureRef = useCallback((node: HTMLImageElement | null) => {
    if (!node) return;
    const measure = () =>
      setNaturalRatio(clampNaturalRatio(node.naturalWidth, node.naturalHeight));
    if (node.complete) measure();
    node.addEventListener("load", measure);
    return () => node.removeEventListener("load", measure);
  }, []);
  // Mirrors Badge.tsx's label logic exactly: an Article (generic or a
  // legacy Essay/Policy Brief) always leads with "Article", with the
  // format (if any) as a secondary suffix.
  const resolvedKind = resolveContentKind({ content_kind, type });
  const resolvedFormat = resolveArticleFormat({ content_kind, article_format, type });
  const formatLabel = getArticleFormatLabel(resolvedFormat);
  const typeLabel =
    resolvedKind === "article"
      ? formatLabel
        ? `${getContentKindLabel(resolvedKind)} · ${formatLabel}`
        : getContentKindLabel(resolvedKind)
      : (POST_TYPE_LABELS[postType] ?? "Post");
  const resolvedAlt = alt?.trim() || `${typeLabel} cover image`;
  const fallbackStyle = FALLBACK_STYLES[postType] ?? FALLBACK_STYLES.blog;
  const imageUnoptimized = useMemo(
    () => unoptimized ?? shouldBypassOptimizer(src),
    [src, unoptimized]
  );
  const resolvedImageClassName =
    imageClassName ?? (fit === "contain" ? "object-contain" : "object-cover");
  const containerClassName = fit === "contain" ? `bg-white ${className}` : className;
  // In natural mode the height comes from the ratio, not from a caller aspect
  // utility, so the same style also backs the no-image fallback box.
  const naturalStyle =
    fit === "natural"
      ? { aspectRatio: String(naturalRatio ?? NATURAL_DEFAULT_RATIO) }
      : undefined;

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden bg-gradient-to-br ${fallbackStyle} ${className}`}
        style={naturalStyle}
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
      style={naturalStyle}
      data-lite-placeholder={`${typeLabel} cover image`}
    >
      <Image
        ref={fit === "natural" ? measureRef : undefined}
        src={src}
        alt={resolvedAlt}
        fill
        sizes={sizes}
        preload={priority}
        fetchPriority={priority ? "high" : undefined}
        loading={priority ? "eager" : undefined}
        unoptimized={imageUnoptimized}
        className={resolvedImageClassName}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
