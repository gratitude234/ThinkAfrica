import { describe, expect, it } from "vitest";
import { sanitizePostHtml } from "./sanitizePostHtml";

describe("sanitizePostHtml", () => {
  it("strips scripts and event handlers", () => {
    const result = sanitizePostHtml('<p>Keep</p><script>alert(1)</script><img src="https://x/a.png" onerror="alert(1)">');

    expect(result).toContain("<p>Keep</p>");
    expect(result).not.toContain("script");
    expect(result).not.toContain("onerror");
  });

  it("keeps a captioned image whole", () => {
    // The editor serializes a captioned image as a figure. If sanitizing
    // dropped either half, every caption a writer typed would vanish on save
    // with nothing to explain it.
    const result = sanitizePostHtml(
      '<figure><img src="https://x/chart.png" alt="A bar chart"><figcaption>Lagos, 2026</figcaption></figure>'
    );

    expect(result).toContain("<figure>");
    expect(result).toContain("<figcaption>Lagos, 2026</figcaption>");
    expect(result).toContain('alt="A bar chart"');
  });

  it("keeps the structure the toolbar can produce", () => {
    const result = sanitizePostHtml(
      "<h2>Section</h2><h3>Subsection</h3><hr /><blockquote><p>Quoted</p></blockquote><ol><li>One</li></ol>"
    );

    for (const fragment of ["<h2>", "<h3>", "<hr />", "<blockquote>", "<ol>"]) {
      expect(result).toContain(fragment);
    }
  });

  it("refuses an image served over plain http", () => {
    const result = sanitizePostHtml('<img src="http://insecure/a.png">');

    expect(result).not.toContain("insecure");
  });

  it("keeps a link's href and drops everything else", () => {
    const outbound = sanitizePostHtml('<a href="https://example.com">Source</a>');
    expect(outbound).toContain('href="https://example.com"');

    // An inline citation anchors to the bibliography on the same page.
    const citation = sanitizePostHtml('<a href="#ref-id-abc">[source]</a>');
    expect(citation).toContain('href="#ref-id-abc"');
  });

  /**
   * Documents current behaviour, not intended behaviour.
   *
   * normalizeAnchor() sets target="_blank" and rel="noopener noreferrer" on
   * outbound links, but sanitize-html applies allowedAttributes AFTER
   * transformTags, and `a` is allowed only `href`. Both attributes are
   * therefore stripped again and no published link has ever carried them.
   *
   * This is not a security hole: rel="noopener" only matters alongside
   * target="_blank", and that is stripped too, so outbound links open in the
   * same tab with no window.opener handle. It is a behaviour question, and
   * changing it would change how every published link on the site opens, so
   * it is recorded here rather than quietly fixed.
   */
  it("drops the target and rel that normalizeAnchor tries to set", () => {
    const outbound = sanitizePostHtml('<a href="https://example.com">Source</a>');

    expect(outbound).not.toContain("target");
    expect(outbound).not.toContain("rel=");
  });
});
