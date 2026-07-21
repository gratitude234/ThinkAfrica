import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResponseStartLink from "./ResponseStartLink";

describe("ResponseStartLink (responses to any post always start an Article)", () => {
  it("builds a kind=article link to the Article composer for a response to a titleless Post", () => {
    render(<ResponseStartLink postId="titleless-post-id" />);

    const link = screen.getByRole("link", { name: "Write a response" });
    expect(link).toHaveAttribute(
      "href",
      "/write?inResponseTo=titleless-post-id&kind=article"
    );
  });

  it("includes starter/responseIntent params without dropping kind=article", () => {
    render(
      <ResponseStartLink postId="post-2" starter="response" responseIntent="challenge" />
    );

    const link = screen.getByRole("link", { name: "Write a response" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("kind=article");
    expect(href).toContain("inResponseTo=post-2");
    expect(href).toContain("starter=response");
    expect(href).toContain("responseIntent=challenge");
  });
});
