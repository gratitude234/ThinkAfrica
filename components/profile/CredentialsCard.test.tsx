import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CredentialsCard from "./CredentialsCard";

describe("CredentialsCard portfolio metrics", () => {
  it("labels the combined published-work count 'Published', not 'Publications' -- it includes short Posts, not just Article/Research", () => {
    render(
      <CredentialsCard
        profile={{
          username: "student1",
          university: "University of Somewhere",
          field_of_study: "Economics",
          points: 40,
          verified: false,
          verified_type: null,
        }}
        badges={[]}
        postCount={7}
        totalViews={0}
        totalLikes={0}
        citableWorkCount={1}
        reviewedWorkCount={1}
        coAuthoredWorkCount={0}
        debateContributionCount={0}
        reviewsCompletedCount={0}
        topicStats={[]}
        followerCount={0}
        followingCount={0}
        isOpenToOpportunities={false}
        opportunityVisible={false}
        opportunityReadinessStatus="Not started"
      />
    );

    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.queryByText("Publications")).not.toBeInTheDocument();
  });
});
