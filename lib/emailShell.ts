/**
 * The Indegenius email shell: the branded frame every outbound email is poured
 * into. It lives apart from lib/email.ts, which is server-only, so the admin
 * broadcast preview can render the exact frame a recipient will receive rather
 * than an approximation of it.
 */
import { BRAND_PROMISE, BRAND_TAGLINE } from "@/lib/brand";
import { resolveEmailSender, type EmailSenderKey } from "@/lib/emailSenders";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmailShell(input: {
  preview: string;
  title: string;
  intro?: string;
  bodyHtml?: string;
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
  /**
   * Trusted markup appended below the footer note. Broadcasts use it to carry
   * Resend's unsubscribe link, which is a merge tag rather than text and so
   * cannot travel through footerNote, which is escaped. Nothing user-supplied
   * ever reaches this.
   */
  footerHtml?: string;
  sender?: EmailSenderKey;
}) {
  const preview = escapeHtml(input.preview);
  const title = escapeHtml(input.title);
  const introHtml = input.intro
    ? `<p class="email-text" style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">${escapeHtml(input.intro)}</p>`
    : "";
  const footerNote = escapeHtml(
    input.footerNote ?? resolveEmailSender(input.sender).footerNote
  );
  const footerExtraHtml = input.footerHtml
    ? `<div style="margin-top:10px;">${input.footerHtml}</div>`
    : "";
  const brandPromise = escapeHtml(BRAND_PROMISE);
  const brandTagline = escapeHtml(BRAND_TAGLINE);
  const ctaHtml =
    input.ctaLabel && input.ctaHref
      ? `<div style="margin:28px 0 18px;">
                  <a href="${escapeHtml(input.ctaHref)}" style="display:inline-block;border-radius:10px;background:#073929;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 18px;">${escapeHtml(input.ctaLabel)}</a>
                </div>
                <p class="email-muted" style="margin:0 0 18px;font-size:12px;line-height:1.6;color:#6b7280;">If the button does not work, open this link:<br><a href="${escapeHtml(input.ctaHref)}" style="color:#073929;">${escapeHtml(input.ctaHref)}</a></p>`
      : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${title}</title>
    <style>
      @media (prefers-color-scheme: dark) {
        .email-bg { background-color: #101613 !important; }
        .email-card { background-color: #171d1a !important; border-color: #2a332e !important; }
        .email-title { color: #f3f4f6 !important; }
        .email-text { color: #d1d5db !important; }
        .email-muted { color: #9ca3af !important; }
        .email-footer { background-color: #131815 !important; border-color: #2a332e !important; }
        .code-box { background-color: #0d1f16 !important; border-color: #234b36 !important; }
        .code-text { color: #7fe0b3 !important; }
      }
    </style>
  </head>
  <body class="email-bg" style="margin:0;background:#f6f7f5;color:#1f2937;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-bg" style="background:#f6f7f5;padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-card" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:22px 26px;border-bottom:1px solid #eef2f0;">
                <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#073929;">Indegenius</div>
                <div class="email-muted" style="margin-top:4px;font-size:12px;line-height:1.5;color:#6b7280;">${brandPromise}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 26px 8px;">
                <h1 class="email-title" style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#111827;">${title}</h1>
                ${introHtml}
                ${input.bodyHtml ?? ""}
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td class="email-footer" style="padding:18px 26px;background:#f9fafb;border-top:1px solid #eef2f0;font-size:12px;line-height:1.6;color:#6b7280;">
                <div style="margin-bottom:5px;font-weight:600;color:#4b5563;">${brandTagline}</div>
                ${footerNote}${footerExtraHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
