"use client";

import { useCallback, useRef, useState } from "react";
import ImageLightbox from "@/components/ui/ImageLightbox";
import PostCover from "./PostCover";

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
  /** Feed keeps Post media natural, Article thumbnails editorially cropped,
   *  and Research previews paper-shaped and contained. */
  variant?: "natural" | "feed" | "feed-thumbnail" | "research-preview";
}

/**
 * An image attached to a post. Tapping it opens the full-screen viewer rather
 * than following the card's link to the post: the rest of the card already
 * navigates, while the viewer offers a distraction-free inspection.
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const isEditorialCrop = variant === "feed-thumbnail";
  const isResearchPreview = variant === "research-preview";
  const aspectClass =
    isEditorialCrop
      ? "aspect-[4/3] sm:aspect-[16/10]"
      : isResearchPreview
        ? "aspect-[3/4]"
        : "";
  const heightGuard = variant === "feed" ? "max-h-[72svh] sm:max-h-[720px]" : "";
  const fit = isEditorialCrop ? "cover" : isResearchPreview ? "contain" : "natural";

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
          fit={fit}
          className={`${aspectClass} ${heightGuard} ${className}`}
          imageClassName={isEditorialCrop ? "object-cover" : "object-contain"}
        />
      </button>
      <ImageLightbox src={src} alt={alt} open={open} onClose={handleClose} />
    </>
  );
}
