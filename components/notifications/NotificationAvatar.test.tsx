import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotificationAvatar, { NotificationTypeIcon } from "./NotificationAvatar";
import {
  NOTIFICATION_DESCRIPTORS,
  type NotificationIconName,
} from "@/lib/notificationCatalog";

function paths(container: HTMLElement) {
  return Array.from(container.querySelectorAll("svg path")).map((node) =>
    node.getAttribute("d")
  );
}

describe("NotificationTypeIcon", () => {
  it("renders artwork for every icon the catalog can ask for", () => {
    const names = new Set<NotificationIconName>(
      Object.values(NOTIFICATION_DESCRIPTORS).map(
        (descriptor) => descriptor.icon
      )
    );

    for (const name of names) {
      const { container, unmount } = render(<NotificationTypeIcon name={name} />);
      const drawn = paths(container);
      expect(drawn.length, name).toBeGreaterThan(0);
      expect(drawn.every((d) => d && d.length > 0), name).toBe(true);
      unmount();
    }
  });

  it("hides the artwork from assistive technology", () => {
    // The row text already says what happened; announcing the icon repeats it.
    // The old ASCII glyphs were real text, so a like was read as "less than three".
    const { container } = render(<NotificationTypeIcon name="heart" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("NotificationAvatar", () => {
  it("shows a tinted type icon when the actor has no avatar", () => {
    const { container } = render(<NotificationAvatar type="like" />);

    expect(container.querySelector("img")).toBeNull();
    expect(paths(container).length).toBeGreaterThan(0);
    expect(container.firstElementChild?.className).toContain("bg-gray-100");
  });

  it("badges the type onto the avatar instead of replacing it", () => {
    // Previously the icon appeared *instead of* the avatar, so on any row with an
    // avatar the notification's type was invisible -- a like and a follow from the
    // same person looked identical.
    const { container } = render(
      <NotificationAvatar
        type="like"
        avatarUrl="https://example.test/a.png"
      />
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.test/a.png"
    );
    expect(paths(container).length).toBeGreaterThan(0);
  });

  it("tints a suspension differently from a like", () => {
    const { container: critical } = render(
      <NotificationAvatar type="account_suspended" />
    );
    const { container: neutral } = render(<NotificationAvatar type="like" />);

    expect(critical.firstElementChild?.className).toContain("bg-rose-100");
    expect(neutral.firstElementChild?.className).toContain("bg-gray-100");
  });

  it("falls back to the bell for an unrecognised type", () => {
    const { container } = render(<NotificationAvatar type="invented_later" />);
    expect(paths(container).length).toBeGreaterThan(0);
  });

  it("stays out of the accessibility tree", () => {
    const { container } = render(
      <NotificationAvatar type="follow" avatarUrl="https://example.test/a.png" />
    );

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    // A decorative image must have an empty alt, not a name that duplicates the row.
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});
