import { mergeAttributes, type Extensions } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import type { DOMOutputSpec } from "@tiptap/pm/model";

export const TEXT_ALIGNMENTS = ["left", "center", "right", "justify"] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

/**
 * An image on a publication is rarely just a picture. It has a source, a
 * photographer, or a chart it came from, and none of that survives in a bare
 * <img>. This renders as <figure><img><figcaption> when a caption exists and
 * as a plain <img> when it does not, so the many images already published
 * without one keep parsing and re-serializing unchanged.
 */
export const CaptionedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-caption"),
        // The caption is rendered as figcaption text below, never as an
        // attribute on the img itself.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure",
        getAttrs: (element) => {
          const image = (element as HTMLElement).querySelector("img");
          if (!image?.getAttribute("src")) return false;
          return {
            src: image.getAttribute("src"),
            alt: image.getAttribute("alt"),
            title: image.getAttribute("title"),
            caption:
              (element as HTMLElement).querySelector("figcaption")?.textContent?.trim() || null,
          };
        },
      },
      { tag: "img[src]" },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const image = [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ] as DOMOutputSpec;
    const caption = typeof node.attrs.caption === "string" ? node.attrs.caption.trim() : "";
    return (
      caption ? ["figure", {}, image, ["figcaption", {}, caption]] : image
    ) as DOMOutputSpec;
  },
});

/**
 * TextAlign as shipped writes `text-align: left` on every paragraph once left
 * is the default, which would rewrite the HTML of every piece saved before
 * alignment existed. The default is still "left", so a plain paragraph reads
 * as left-aligned, but it is written as nothing.
 */
const Alignment = TextAlign.extend({
  addGlobalAttributes() {
    const { types, alignments, defaultAlignment } = this.options;
    return [
      {
        types,
        attributes: {
          textAlign: {
            default: defaultAlignment,
            parseHTML: (element) => {
              const alignment = element.style.textAlign;
              return alignments.includes(alignment) ? alignment : defaultAlignment;
            },
            renderHTML: (attributes) =>
              !attributes.textAlign || attributes.textAlign === defaultAlignment
                ? {}
                : { style: `text-align: ${attributes.textAlign}` },
          },
        },
      },
    ];
  },
});

/**
 * The editor's schema, in one place so it can be tested without React.
 */
export function editorExtensions({ placeholder }: { placeholder: string }): Extensions {
  return [
    StarterKit,
    Placeholder.configure({ placeholder }),
    CharacterCount,
    // Curly quotes, real ellipses and proper dashes, applied as the writer
    // types. A publication should not ship typewriter quotes.
    Typography,
    CaptionedImage.configure({ inline: false, allowBase64: false }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
    }),
    // Only the blocks the live page sets as text. The sanitizer allows the
    // same four values on the same tags (p, h2, h3), and left writes nothing,
    // so every piece saved before alignment existed round-trips unchanged.
    Alignment.configure({
      types: ["heading", "paragraph"],
      alignments: [...TEXT_ALIGNMENTS],
      defaultAlignment: "left",
    }),
  ];
}
