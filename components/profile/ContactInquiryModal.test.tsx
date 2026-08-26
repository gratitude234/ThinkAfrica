import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContactInquiryModal from "./ContactInquiryModal";

const trackActivationEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activationEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activationEvents")>()),
  trackActivationEvent,
}));

const submitOpportunityInquiry = vi.hoisted(() => vi.fn());
vi.mock("./opportunityInquiryActions", () => ({ submitOpportunityInquiry }));

const funnel = {
  profileId: "author-1",
  viewerState: "authenticated" as const,
  surface: "profile_header" as const,
};

function funnelEvents(name: string) {
  return trackActivationEvent.mock.calls.filter(
    ([payload]) => payload.event === name
  );
}

// No inter-keystroke delay: this form takes five fields and a sentence, and
// the real-time default made the whole file slow enough to trip the suite
// timeout when the run is under load.
const setup = () => userEvent.setup({ delay: null });

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Organization \*/), "Civic Lab");
  await user.type(screen.getByLabelText(/Reply email \*/), "team@civic.example");
  await user.type(screen.getByLabelText(/Role or opportunity \*/), "Research fellow");
  await user.selectOptions(screen.getByLabelText(/Type \*/), "fellowship");
  await user.type(
    screen.getByLabelText(/Message \*/),
    "We read your work on budget audits and would like to discuss a six month fellowship."
  );
  await user.click(screen.getByRole("button", { name: "Send" }));
}

describe("ContactInquiryModal funnel", () => {
  beforeEach(() => {
    trackActivationEvent.mockClear();
    submitOpportunityInquiry.mockReset();
    submitOpportunityInquiry.mockResolvedValue({ ok: true });
  });

  it("records the inquiry opened once, when it opens", () => {
    const { rerender } = render(
      <ContactInquiryModal
        talentProfileId="talent-1"
        open={false}
        onClose={() => {}}
        funnel={funnel}
      />
    );
    expect(funnelEvents("profile_inquiry_opened")).toHaveLength(0);

    rerender(
      <ContactInquiryModal
        talentProfileId="talent-1"
        open
        onClose={() => {}}
        funnel={funnel}
      />
    );
    expect(funnelEvents("profile_inquiry_opened")).toHaveLength(1);
    expect(funnelEvents("profile_inquiry_opened")[0][0]).toEqual({
      event: "profile_inquiry_opened",
      source: "profile_header",
      metadata: {
        profileId: "author-1",
        viewerState: "authenticated",
        surface: "profile_header",
      },
    });
  });

  it("does not re-announce the same open modal when the parent rerenders", () => {
    const { rerender } = render(
      <ContactInquiryModal
        talentProfileId="talent-1"
        open
        onClose={() => {}}
        funnel={{ ...funnel }}
      />
    );
    // A fresh object each time, which is what an inline prop actually does.
    rerender(
      <ContactInquiryModal
        talentProfileId="talent-1"
        open
        onClose={() => {}}
        funnel={{ ...funnel }}
      />
    );

    expect(funnelEvents("profile_inquiry_opened")).toHaveLength(1);
  });

  it("records a submission only after the server accepted it", async () => {
    const user = setup();
    render(
      <ContactInquiryModal
        talentProfileId="talent-1"
        open
        onClose={() => {}}
        funnel={funnel}
      />
    );

    await fillAndSubmit(user);

    expect(submitOpportunityInquiry).toHaveBeenCalledTimes(1);
    expect(funnelEvents("profile_inquiry_submitted")).toHaveLength(1);
    expect(funnelEvents("profile_inquiry_submitted")[0][0].metadata).toEqual({
      profileId: "author-1",
      viewerState: "authenticated",
      surface: "profile_header",
    });
    expect(screen.getByText("Inquiry sent")).toBeInTheDocument();
  });

  it("records nothing when the server rejects the inquiry", async () => {
    submitOpportunityInquiry.mockResolvedValue({
      ok: false,
      error: "This profile is not accepting opportunity inquiries.",
    });
    const user = setup();
    render(
      <ContactInquiryModal
        talentProfileId="talent-1"
        open
        onClose={() => {}}
        funnel={funnel}
      />
    );

    await fillAndSubmit(user);

    expect(funnelEvents("profile_inquiry_submitted")).toHaveLength(0);
    expect(
      screen.getByText("This profile is not accepting opportunity inquiries.")
    ).toBeInTheDocument();
  });

  it("omits the timeline and commitment the form does not collect", async () => {
    const user = setup();
    render(
      <ContactInquiryModal
        talentProfileId="talent-1"
        open
        onClose={() => {}}
        funnel={funnel}
      />
    );

    await fillAndSubmit(user);

    const [input] = submitOpportunityInquiry.mock.calls[0];
    expect(input.timeline).toBeUndefined();
    expect(input.commitment).toBeUndefined();
  });

  it("emits no profile events when opened outside a profile", () => {
    render(
      <ContactInquiryModal talentProfileId="talent-1" open onClose={() => {}} />
    );

    expect(funnelEvents("profile_inquiry_opened")).toHaveLength(0);
    // The pre-existing opportunity event is untouched.
    expect(funnelEvents("opportunity_inquiry_started")).toHaveLength(1);
  });
});
