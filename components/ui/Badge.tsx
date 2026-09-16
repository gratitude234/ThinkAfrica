import {
  getContentKindLabel,
  resolveContentKind,
  type ContentKind,
} from "@/lib/contentModel";

interface BadgeProps {
  content_kind?: string | null;
  className?: string;
}

/**
 * What a piece is: Post or Article.
 *
 * It used to be keyed on the legacy `posts.type`, with a genre suffix
 * ("Article · Policy Brief") and a "Quick Take" label for a short Blog. The
 * product has two kinds and no genres, so the badge says one of two words.
 */
const KIND_STYLES: Record<ContentKind, string> = {
  post: "bg-green-tint text-emerald-brand",
  article: "bg-gold-tint text-gold-ink",
};

export default function Badge({ content_kind, className = "" }: BadgeProps) {
  const kind = resolveContentKind({ content_kind });
  const styles = kind ? KIND_STYLES[kind] : "bg-gray-100 text-gray-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles} ${className}`}
    >
      {getContentKindLabel(kind)}
    </span>
  );
}
