import { describe, expect, it } from "vitest";
import { BRAND_PROMISE, BRAND_TAGLINE } from "@/lib/brand";
import { renderEmailShell } from "@/lib/email";

describe("renderEmailShell brand contract", () => {
  it("carries the public promise and supporting Africa tagline", () => {
    const html = renderEmailShell({
      preview: "Preview",
      title: "Account update",
    });

    expect(html).toContain(BRAND_PROMISE);
    expect(html).toContain(BRAND_TAGLINE.replace("'", "&#39;"));
    expect(html).not.toContain("academic identity");
  });
});
