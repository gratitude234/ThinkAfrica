import { describe, expect, it } from "vitest";
import { normalizeLinkUrl } from "./linkUrl";

describe("normalizeLinkUrl", () => {
  it.each([
    ["example.com", "https://example.com"],
    ["www.bbc.co.uk/news", "https://www.bbc.co.uk/news"],
    ["  punchng.com/story?id=4  ", "https://punchng.com/story?id=4"],
    ["example.com:8080/path", "https://example.com:8080/path"],
    ["//cdn.example.com/file.pdf", "https://cdn.example.com/file.pdf"],
    ["http://example.org", "http://example.org"],
    ["HTTPS://Example.com/Path", "HTTPS://Example.com/Path"],
    ["https://xn--mnchen-3ya.de", "https://xn--mnchen-3ya.de"],
    ["102.89.1.4/report", "https://102.89.1.4/report"],
    ["mailto:editor@indegenius.africa", "mailto:editor@indegenius.africa"],
  ])("accepts %s as %s", (typed, expected) => {
    expect(normalizeLinkUrl(typed)).toBe(expected);
  });

  it.each([
    ["a word with no domain", "hrbdbf"],
    ["nothing", "   "],
    ["a one-letter ending", "site.x"],
    ["spaces", "my site.com"],
    ["a script", "javascript:alert(1)"],
    ["data", "data:text/html,hello"],
    ["another scheme", "ftp://files.example.com"],
    ["a scheme with nothing after it", "https://"],
    ["a local address", "localhost:3000"],
    ["a mail link with no address", "mailto:someone"],
    ["a phone number", "tel:+2348000000000"],
  ])("refuses %s", (_label, typed) => {
    expect(normalizeLinkUrl(typed)).toBeNull();
  });
});
