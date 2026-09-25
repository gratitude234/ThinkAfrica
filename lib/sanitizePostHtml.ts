import "server-only";

import sanitizeHtml from "sanitize-html";

const allowedTags = [
  ...sanitizeHtml.defaults.allowedTags,
  "h1",
  "h2",
  "h3",
  "img",
  "s",
  "span",
  "sub",
  "sup",
  "u",
];

/**
 * Alignment is the one style a writer can set, and only on the blocks the
 * editor's TextAlign extension covers. Every other property, and any value
 * outside these four, is removed, so a pasted `color` or `background:url()`
 * never reaches a published page.
 */
const ALIGNMENT_STYLE = { "text-align": [/^(left|center|right|justify)$/] };

function normalizeAnchor(
  tagName: string,
  attribs: sanitizeHtml.Attributes
): sanitizeHtml.Tag {
  const href = attribs.href ?? "";
  const nextAttribs: sanitizeHtml.Attributes = {};

  if (href) {
    nextAttribs.href = href;
  }

  if (href && !href.startsWith("#")) {
    nextAttribs.target = "_blank";
    nextAttribs.rel = "noopener noreferrer";
  }

  return { tagName, attribs: nextAttribs };
}

function normalizeImage(
  tagName: string,
  attribs: sanitizeHtml.Attributes
): sanitizeHtml.Tag {
  const nextAttribs: sanitizeHtml.Attributes = {};

  if (attribs.src) {
    nextAttribs.src = attribs.src;
  }

  if (attribs.alt) {
    nextAttribs.alt = attribs.alt;
  }

  if (attribs.title) {
    nextAttribs.title = attribs.title;
  }

  return { tagName, attribs: nextAttribs };
}

function removeDraftSectionLabels(content: string) {
  return content
    .replace(
      /<p>\s*(?:<strong>)?\s*Body:\s*(?:<\/strong>)?\s*<\/p>\s*/i,
      ""
    )
    .replace(
      /<p>\s*(?:<strong>)?\s*Body:\s*(?:<\/strong>)?\s*/i,
      "<p>"
    );
}

export function sanitizePostHtml(content: string | null | undefined): string {
  const sanitized = sanitizeHtml(content ?? "", {
    allowedTags,
    allowedAttributes: {
      a: ["href"],
      img: ["alt", "src", "title"],
      p: ["style"],
      h2: ["style"],
      h3: ["style"],
    },
    allowedStyles: {
      p: ALIGNMENT_STYLE,
      h2: ALIGNMENT_STYLE,
      h3: ALIGNMENT_STYLE,
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["https"],
    },
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
    transformTags: {
      a: normalizeAnchor,
      img: normalizeImage,
    },
  });

  return removeDraftSectionLabels(sanitized);
}
