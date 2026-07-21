import {
  isQuickTake,
  POST_TYPE_LABELS,
  type PostType,
} from "@/lib/utils";
import {
  getArticleFormatLabel,
  getContentKindLabel,
  resolveArticleFormat,
  resolveContentKind,
} from "@/lib/contentModel";

interface BadgeProps {
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  className?: string;
  wordCount?: number;
}

const TYPE_STYLES: Record<string, string> = {
  blog: "bg-green-tint text-emerald-brand",
  essay: "bg-gold-tint text-gold-ink",
  research: "bg-purple-tint text-purple-accent",
  policy_brief: "bg-purple-tint text-purple-accent",
};

export default function Badge({
  type,
  content_kind,
  article_format,
  className = "",
  wordCount,
}: BadgeProps) {
  const styles = TYPE_STYLES[type] ?? "bg-gray-100 text-gray-700";
  // An Article (generic or a legacy Essay/Policy Brief) always leads with
  // "Article" -- the historical format, if any, is a secondary suffix, not
  // a replacement for the primary identity (see docs/content-model.md).
  const resolvedKind = resolveContentKind({ content_kind, type });
  const resolvedFormat = resolveArticleFormat({ content_kind, article_format, type });
  const formatLabel = getArticleFormatLabel(resolvedFormat);
  const label =
    resolvedKind === "article"
      ? formatLabel
        ? `${getContentKindLabel(resolvedKind)} · ${formatLabel}`
        : getContentKindLabel(resolvedKind)
      : typeof wordCount === "number" && isQuickTake(type, wordCount)
        ? "Quick Take"
        : POST_TYPE_LABELS[type as PostType] ?? type;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
