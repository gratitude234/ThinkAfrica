import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ActivationBanner from "./ActivationBanner";

describe("ActivationBanner -- Post CTA bypasses the generic Create chooser", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it("routes 'Write your first post' straight to the Post composer, not the Article composer", () => {
    render(
      <ActivationBanner
        userId="user-1"
        hasPublished={false}
        hasFollowed={true}
        hasDebated={true}
      />
    );

    expect(screen.getByRole("link", { name: "Write your first post →" })).toHaveAttribute(
      "href",
      "/create/post"
    );
  });

  it("renders a plain link with no chooser dialog involved", () => {
    render(
      <ActivationBanner
        userId="user-1"
        hasPublished={false}
        hasFollowed={true}
        hasDebated={true}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create/i })).not.toBeInTheDocument();
  });
});
