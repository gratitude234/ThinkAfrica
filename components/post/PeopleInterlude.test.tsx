import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PeopleInterlude from "./PeopleInterlude";

describe("PeopleInterlude rationale", () => {
  it("shows the actual suggestion rationale instead of claiming reading history", () => {
    render(
      <PeopleInterlude
        people={[
          {
            id: "writer-1",
            username: "amara",
            full_name: "Amara Okafor",
            university: "University of Lagos",
            avatar_url: null,
          },
        ]}
        reason="From your university"
        currentUserId={null}
      />
    );

    expect(screen.getByText("From your university")).toBeInTheDocument();
    expect(
      screen.queryByText("Based on your reading history")
    ).not.toBeInTheDocument();
  });
});
