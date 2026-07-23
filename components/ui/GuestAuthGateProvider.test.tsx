import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import GuestAuthGateProvider, { useGuestAuthGate } from "./GuestAuthGateProvider";
import type { GuestAuthIntent } from "@/lib/guestAuth";
import type { ContentKind } from "@/lib/contentModel";

function Trigger({
  intent,
  contentKind,
  label = "Do the thing",
}: {
  intent: GuestAuthIntent;
  contentKind?: ContentKind | null;
  label?: string;
}) {
  const { requestAuth } = useGuestAuthGate();
  return (
    <button type="button" onClick={() => requestAuth(intent, { contentKind })}>
      {label}
    </button>
  );
}

function renderWithGate(children: React.ReactNode) {
  return render(<GuestAuthGateProvider>{children}</GuestAuthGateProvider>);
}

describe("GuestAuthGateProvider -- contextual copy", () => {
  afterEach(() => cleanup());

  it.each([
    ["like", "post", "Sign in to like this Post"],
    ["like", "article", "Sign in to like this Article"],
    ["save", "research", "Sign in to save this Research"],
    ["respond", undefined, "Sign in to respond"],
    ["create", undefined, "Sign in to publish"],
  ] as const)("shows the correct title for %s / %s", (intent, contentKind, expectedTitle) => {
    renderWithGate(<Trigger intent={intent} contentKind={contentKind ?? null} />);

    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(expectedTitle)).toBeInTheDocument();
  });

  it("never exposes a raw database value (e.g. 'policy_brief') in the title", () => {
    renderWithGate(<Trigger intent="like" contentKind="article" />);
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    expect(screen.getByText("Sign in to like this Article")).toBeInTheDocument();
    expect(screen.queryByText(/policy_brief|content_kind/)).not.toBeInTheDocument();
  });
});

describe("GuestAuthGateProvider -- dialog behavior", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?tab=home&type=article#responses");
  });

  afterEach(() => cleanup());

  it("has an accessible dialog title and description", () => {
    renderWithGate(<Trigger intent="respond" />);
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(dialog).toHaveAttribute("aria-describedby");
  });

  it("moves focus inside the dialog on open", () => {
    renderWithGate(<Trigger intent="respond" />);
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    expect(screen.getByRole("dialog")).toContainElement(
      document.activeElement as HTMLElement
    );
  });

  it("Continue browsing closes the dialog and changes no data", () => {
    renderWithGate(<Trigger intent="respond" />);
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue browsing" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape closes the dialog", () => {
    renderWithGate(<Trigger intent="respond" />);
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("backdrop click closes the dialog", () => {
    renderWithGate(<Trigger intent="respond" />);
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.parentElement?.querySelector("[aria-hidden='true']");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("restores focus to the triggering element on close", async () => {
    const user = userEvent.setup();
    renderWithGate(<Trigger intent="respond" />);
    const trigger = screen.getByRole("button", { name: "Do the thing" });
    // userEvent (unlike a raw fireEvent.click) simulates the browser's
    // default click-focuses-the-button behavior, which is what the gate
    // relies on to know which element to restore focus to.
    await user.click(trigger);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.activeElement).toBe(trigger);
  });

  it("traps Tab focus inside the dialog, wrapping from the last control back to the first", () => {
    renderWithGate(<Trigger intent="respond" />);
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    const dialog = screen.getByRole("dialog");
    const controls = dialog.querySelectorAll<HTMLElement>('a[href], button');
    const last = controls[controls.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(controls[0]);
  });

  it("builds a same-origin redirectTo containing the complete relative URL (path + query + hash), URL-encoded", () => {
    renderWithGate(<Trigger intent="respond" />);
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    const signInLink = screen.getByRole("link", { name: "Sign in" });
    expect(signInLink).toHaveAttribute(
      "href",
      "/login?redirectTo=%2F%3Ftab%3Dhome%26type%3Darticle%23responses"
    );
  });

  it("never produces an open redirect -- the href is always same-origin, starting with a single slash", () => {
    renderWithGate(<Trigger intent="respond" />);
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    const href = screen.getByRole("link", { name: "Sign in" }).getAttribute("href")!;
    const redirectTo = new URL(href, "http://localhost").searchParams.get("redirectTo")!;
    expect(redirectTo.startsWith("/")).toBe(true);
    expect(redirectTo.startsWith("//")).toBe(false);
  });

  it("does not replay or track any pending action -- Sign in is a plain navigation link, not an action dispatcher", () => {
    renderWithGate(<Trigger intent="respond" />);
    fireEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    const signInLink = screen.getByRole("link", { name: "Sign in" });
    // A real <a href> navigation -- nothing to "replay" client-side once the
    // user comes back from /login.
    expect(signInLink.tagName).toBe("A");
  });
});
