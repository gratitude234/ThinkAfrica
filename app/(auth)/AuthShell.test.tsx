import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BRAND_PROMISE, BRAND_TAGLINE } from "@/lib/brand";
import { AuthShell } from "./AuthShell";

describe("AuthShell brand contract", () => {
  it("uses the canonical promise and supporting tagline", () => {
    render(
      <AuthShell
        eyebrow="Create your profile"
        title="Create your account"
        subtitle="Start here."
        proofItems={["Publish", "Respond", "Debate"]}
        quote="Ideas deserve a durable record."
        quoteSource="Indegenius"
      >
        <div>Form</div>
      </AuthShell>
    );

    expect(screen.getByRole("heading", { name: BRAND_PROMISE })).toBeInTheDocument();
    expect(screen.getByText(BRAND_TAGLINE)).toBeInTheDocument();
  });
});
