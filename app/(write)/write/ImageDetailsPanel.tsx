"use client";

import type { SelectedImage } from "@/components/editor/Editor";

interface ImageDetailsPanelProps {
  image: SelectedImage;
  onChange: (attrs: { alt?: string; caption?: string }) => void;
}

const FIELD =
  "min-h-11 w-full rounded-lg border border-card-border bg-surface px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-emerald-brand";

/**
 * An image carries a credit, a source, or the chart it came from, and none of
 * that survives in a bare picture. This appears while an image is selected: at
 * the foot of the writing column on a desktop, and just above the keyboard
 * toolbar on a phone.
 */
export default function ImageDetailsPanel({ image, onChange }: ImageDetailsPanelProps) {
  return (
    <section
      aria-label="Image details"
      className="fixed inset-x-3 bottom-[calc(var(--mobile-visual-viewport-bottom,0px)+3.75rem)] z-30 mx-auto max-w-[640px] space-y-3 rounded-xl border border-card-border bg-surface p-3 shadow-lg shadow-ink/10 md:bottom-6"
    >
      <p className="text-kicker font-semibold uppercase text-ink-muted">Selected image</p>
      <div>
        <label htmlFor="image-caption" className="mb-1.5 block text-sm font-semibold text-ink">
          Caption
        </label>
        <input
          id="image-caption"
          type="text"
          value={image.caption}
          onChange={(event) => onChange({ caption: event.target.value })}
          placeholder="What this shows, and who it is by"
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor="image-alt" className="mb-1.5 block text-sm font-semibold text-ink">
          Alt text
        </label>
        <input
          id="image-alt"
          type="text"
          value={image.alt}
          onChange={(event) => onChange({ alt: event.target.value })}
          placeholder="Describe the image"
          className={FIELD}
        />
        <p className="mt-1.5 text-meta text-ink-muted">
          Read aloud by screen readers, and shown when the image cannot load.
        </p>
      </div>
    </section>
  );
}
