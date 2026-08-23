import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CampusPromptLink from "./CampusPromptLink";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock("@/lib/activationEvents", () => ({
  trackActivationEvent: mocks.track,
}));

describe("CampusPromptLink", () => {
  it("preserves prompt attribution and records the prompt-open conversion", () => {
    render(
      <CampusPromptLink promptId="prompt 1" source="campus_hub">
        Use prompt
      </CampusPromptLink>
    );

    const link = screen.getByRole("link", { name: "Use prompt" });
    expect(link).toHaveAttribute("href", "/write?prompt=prompt%201");
    fireEvent.click(link);
    expect(mocks.track).toHaveBeenCalledWith({
      event: "campus_prompt_opened",
      source: "campus_hub",
      metadata: { promptId: "prompt 1" },
    });
  });
});
