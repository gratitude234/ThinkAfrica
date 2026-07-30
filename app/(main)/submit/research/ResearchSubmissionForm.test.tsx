import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ResearchSubmissionForm, {
  type ResearchDraft,
} from "./ResearchSubmissionForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        ilike: () => ({
          neq: () => ({
            limit: () => Promise.resolve({ data: [] }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/activationEvents", () => ({
  trackActivationEvent: vi.fn(),
}));

vi.mock("./actions", () => ({
  ensureResearchDraftForUpload: vi.fn(),
  saveResearchDraft: vi.fn(),
  submitResearchPaper: vi.fn(),
}));

function editableMetadataDraft(): ResearchDraft {
  return {
    id: "research-draft-1",
    title: "Community health systems",
    abstract: "",
    topics: [],
    keywords: [],
    status: "draft",
    currentRound: 1,
    document: {
      documentPath: "writer/research-draft-1/paper.pdf",
      originalName: "paper.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    },
  };
}

describe("ResearchSubmissionForm topic encouragement", () => {
  it("requires keywords but allows one explicit continuation without topics", async () => {
    const user = userEvent.setup();
    render(
      <ResearchSubmissionForm
        userId="writer-1"
        author={{
          username: "writer",
          fullName: "A Writer",
          university: "A University",
        }}
        initialDraft={editableMetadataDraft()}
        initialReferences={[]}
        initialCoAuthors={[]}
      />
    );

    expect(screen.getByText("Topics (optional)")).toBeInTheDocument();
    expect(screen.getByText(/Keywords/)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Abstract"),
      "This study examines access to community health systems across rural regions."
    );
    await user.type(screen.getByLabelText(/Keywords/), "health systems");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Continue without topics?")).toBeInTheDocument();
    expect(screen.queryByText("Authors & references")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Continue without topics" })
    );
    expect(screen.getByText("Authors & references")).toBeInTheDocument();
  });
});
