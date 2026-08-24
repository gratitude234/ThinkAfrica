import type { IntellectualRecordLabel } from "@/lib/intellectualRecord";

/**
 * Evidence chips previously mapped to four raw Tailwind hues (emerald, sky,
 * purple, amber) in two separate files. Four bright colours at 10px compete
 * with the brand on a card that can carry three of them at once, and they read
 * as status badges rather than as evidence.
 *
 * Colour now carries meaning only where the meaning differs. Reviewed and
 * Citable are the two claims about a formal record, so they keep the purple
 * and gold brand hues. Source-backed sits in the house green, and Co-authored
 * is a fact about people rather than about evidence, so it goes neutral.
 */
const LABEL_CLASSES: Record<IntellectualRecordLabel["tone"], string> = {
  emerald: "border-green-wash-border bg-green-tint text-emerald-ink",
  purple: "border-purple-tint bg-purple-tint text-purple-accent",
  sky: "border-gold-tint bg-gold-tint text-gold-ink",
  amber: "border-card-border bg-canvas text-ink-muted",
};

export function evidenceLabelClass(tone: IntellectualRecordLabel["tone"]) {
  return LABEL_CLASSES[tone];
}

export default function EvidenceLabels({
  labels,
  className = "",
}: {
  labels: IntellectualRecordLabel[];
  className?: string;
}) {
  if (labels.length === 0) return null;

  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Publication evidence">
      {labels.map((label) => (
        <li
          key={label.key}
          title={label.description}
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${LABEL_CLASSES[label.tone]}`}
        >
          {label.label}
        </li>
      ))}
    </ul>
  );
}
