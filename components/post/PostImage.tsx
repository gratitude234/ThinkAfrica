"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import ImageLightbox from "@/components/ui/ImageLightbox";
import PostCover, { type NaturalFit } from "./PostCover";

interface PostImageProps {
  src: string;
  alt: string;
  /** Post or Article, for the placeholder PostCover falls back to. */
  content_kind?: string | null;
  sizes?: string;
  priority?: boolean;
  /** Styling for the image box itself (width, radius, background). */
  className?: string;
  fallbackClassName?: string;
  fallbackLabel?: string;
  /** Styling for the tappable wrapper (spacing around the image). */
  wrapperClassName?: string;
  /** Feed keeps Post media natural and Article thumbnails editorially cropped. */
  variant?: "natural" | "feed" | "feed-thumbnail";
}

/**
 * An image attached to a post. Tapping it opens the full-screen viewer rather
 * than following the card's link to the post: the rest of the card already
 * navigates, while the viewer offers a distraction-free inspection.
 */
export default function PostImage({
  src,
  alt,
  content_kind,
  sizes,
  priority,
  className = "",
  fallbackClassName,
  fallbackLabel,
  wrapperClassName = "",
  variant = "natural",
}: PostImageProps) {
  const [open, setOpen] = useState(false);
  const [measured, setMeasured] = useState<{ src: string; ratio: number } | null>(null);
  const measureFeedImage = useCallback((fit: NaturalFit) => {
    setMeasured((current) => current?.src === src && current.ratio === fit.ratio
      ? current : { src, ratio: fit.ratio });
  }, [src]);
  const ratio = measured?.src === src ? measured.ratio : 4 / 3;
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const isEditorialCrop = variant === "feed-thumbnail";
  const aspectClass = isEditorialCrop ? "aspect-[4/3] sm:aspect-[16/10]" : "";
  const fit = isEditorialCrop ? "cover" : variant === "feed" ? "proportional" : "natural";
  // Constrain BOTH dimensions. A height cap on a full-width box creates
  // empty sidebars around portraits; proportional width keeps the frame snug.
  const feedStyle = variant === "feed"
    ? { "--post-media-width": `min(100%, ${60 * ratio}svh, ${480 * ratio}px)`, width: "var(--post-media-width)" } as CSSProperties
    : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        style={feedStyle}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={alt ? `View image full screen: ${alt}` : "View image full screen"}
        className={`relative block w-full cursor-zoom-in rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${wrapperClassName}`}
      >
        <PostCover
          key={src}
          onNaturalFit={variant === "feed" ? measureFeedImage : undefined}
          fallbackClassName={fallbackClassName}
          fallbackLabel={fallbackLabel}
          src={src}
          alt={alt}
          content_kind={content_kind}
          sizes={sizes}
          priority={priority}
          fit={fit}
          className={`${aspectClass} ${className}`}
          imageClassName={isEditorialCrop ? "object-cover" : "object-contain"}
        />
      </button>
      <ImageLightbox src={src} alt={alt} open={open} onClose={handleClose} />
    </>
  );
}
