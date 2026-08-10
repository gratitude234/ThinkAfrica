"use client";

import { useCallback, useRef, useState } from "react";
import ImageLightbox from "@/components/ui/ImageLightbox";
import PostCover, { type NaturalFit } from "./PostCover";

interface PostImageProps {
  src: string;
  alt: string;
  type?: string | null;
  content_kind?: string | null;
  article_format?: string | null;
  sizes?: string;
  priority?: boolean;
  /** Styling for the image box itself (width, radius, background). */
  className?: string;
  /** Styling for the tappable wrapper (spacing around the image). */
  wrapperClassName?: string;
  /**
   * Feed media uses a predictable editorial crop to keep the timeline
   * scannable. Detail pages retain the image's natural proportions.
   */
  variant?: "natural" | "feed" | "feed-thumbnail";
}

/**
 * An image attached to a post. Tapping it opens the full-screen viewer rather
 * than following the card's link to the post: the rest of the card already
 * navigates, and the viewer is the only way to see an image the feed's ratio
 * clamp has cropped.
 */
export default function PostImage({
  src,
  alt,
  type,
  content_kind,
  article_format,
  sizes,
  priority,
  className = "",
  wrapperClassName = "",
  variant = "natural",
}: PostImageProps) {
  const [open, setOpen] = useState(false);
  const [cropped, setCropped] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleNaturalFit = useCallback((fit: NaturalFit) => setCropped(fit.cropped), []);
  const handleClose = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const isFeedMedia = variant === "feed" || variant === "feed-thumbnail";
  const aspectClass =
    variant === "feed-thumbnail"
      ? "aspect-[4/3] sm:aspect-[16/10]"
      : variant === "feed"
        ? "aspect-[16/10] sm:aspect-[16/9]"
        : "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={alt ? `View image full screen: ${alt}` : "View image full screen"}
        className={`relative block w-full cursor-zoom-in rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${wrapperClassName}`}
      >
        <PostCover
          src={src}
          alt={alt}
          type={type}
          content_kind={content_kind}
          article_format={article_format}
          sizes={sizes}
          priority={priority}
          fit={isFeedMedia ? "cover" : "natural"}
          className={`${aspectClass} ${className}`}
          imageClassName="object-cover"
          onNaturalFit={isFeedMedia ? undefined : handleNaturalFit}
        />
        {!isFeedMedia && cropped ? (
          <span
            aria-hidden="true"
            className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-1 text-[11px] font-semibold leading-none text-white"
            title="Tap to see the whole image"
          >
            ⤢
          </span>
        ) : null}
      </button>
      <ImageLightbox src={src} alt={alt} open={open} onClose={handleClose} />
    </>
  );
}
