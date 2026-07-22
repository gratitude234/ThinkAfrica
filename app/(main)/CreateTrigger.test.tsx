import type { AnchorHTMLAttributes } from "react";
import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateTrigger from "./CreateTrigger";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

// These tests stand in for a future ad-hoc CTA (Footer "Write", a dashboard
// "Start writing" button, ...) that has nothing to do with NavClient or
// BottomNav -- proving the chooser is reachable without going through either
// of them, and without re-implementing the sheet/popover markup.
describe("CreateTrigger -- reusable outside navigation", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
  });

  afterEach(() => cleanup());

  it("opens the same chooser (CREATE_ACTIONS-driven) from an arbitrary popover trigger", () => {
    render(
      <CreateTrigger userId="user-1" presentation="popover" className="footer-write-cta">
        Write
      </CreateTrigger>
    );

    const trigger = screen.getByRole("button", { name: "Write" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Create" });
    const links = within(dialog).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName(/^Post/);
    expect(links[1]).toHaveAccessibleName(/^Article/);
    expect(links[2]).toHaveAccessibleName(/^Research Paper/);
  });

  it("opens the same chooser from an arbitrary sheet trigger, and closes on Escape with focus restored", () => {
    render(
      <CreateTrigger userId="user-1" presentation="sheet" className="dashboard-start-writing-cta">
        Start writing
      </CreateTrigger>
    );

    const trigger = screen.getByRole("button", { name: "Start writing" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Create" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("routes Post/Article/Research Paper identically to the nav chooser, since both read CREATE_ACTIONS", () => {
    render(
      <CreateTrigger userId={null} presentation="popover">
        Write
      </CreateTrigger>
    );

    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByRole("link", { name: /^Post/ })).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Fcreate%2Fpost"
    );
    expect(within(dialog).getByRole("link", { name: /^Article/ })).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Fwrite%3Fkind%3Darticle"
    );
    expect(within(dialog).getByRole("link", { name: /^Research Paper/ })).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Fsubmit%2Fresearch"
    );
  });

  it("does not collide with a second, independently-mounted trigger elsewhere on the page", () => {
    render(
      <>
        <CreateTrigger userId="user-1" presentation="popover">
          Write
        </CreateTrigger>
        <CreateTrigger userId="user-1" presentation="sheet">
          Start writing
        </CreateTrigger>
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    const dialogs = screen.getAllByRole("dialog", { name: "Create" });
    expect(dialogs).toHaveLength(2);
    const ids = dialogs.map((dialog) => dialog.id);
    expect(new Set(ids).size).toBe(2);
  });
});
