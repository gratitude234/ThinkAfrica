import type { PostType } from "@/lib/utils";

const SUBTITLE_PATTERN =
  /^<p\b[^>]*data-subtitle="true"[^>]*>([\s\S]*?)<\/p>/i;

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function encodeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function extractSubtitleFromContent(content: string) {
  const trimmedContent = content.trim();
  const match = trimmedContent.match(SUBTITLE_PATTERN);

  if (!match) {
    return {
      subtitle: "",
      content: trimmedContent,
    };
  }

  const subtitleText = decodeHtml(match[1].replace(/<[^>]*>/g, "").trim());
  const bodyContent = trimmedContent.replace(SUBTITLE_PATTERN, "").trim();

  return {
    subtitle: subtitleText,
    content: bodyContent,
  };
}

export function composeContentWithSubtitle(content: string, subtitle: string) {
  const trimmedContent = content.trim();
  const trimmedSubtitle = subtitle.trim();

  if (!trimmedSubtitle) {
    return trimmedContent;
  }

  const subtitleParagraph = `<p data-subtitle="true" class="lead ta-subtitle">${encodeHtml(
    trimmedSubtitle
  )}</p>`;

  return `${subtitleParagraph}${trimmedContent}`;
}

export function inferTypeFromContent(
  content: string,
  wordCount: number
): PostType {
  const h2Count = (content.match(/<h2/gi) ?? []).length;

  if (wordCount >= 2500) return "research";
  if (h2Count >= 3 && wordCount >= 700) return "policy_brief";
  if (wordCount >= 600) return "essay";
  return "blog";
}
