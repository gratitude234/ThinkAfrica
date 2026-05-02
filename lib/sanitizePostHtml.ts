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

export function sanitizePostHtml(content: string | null | undefined): string {
  return sanitizeHtml(content ?? "", {
    allowedTags,
    allowedAttributes: {
      a: ["href"],
      img: ["alt", "src", "title"],
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
}
