import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, query = "") {
  await page.goto(`/dev-preview/profile${query}`);
  await expect(page.locator("#profile-name")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".profile-avatar")).toBeVisible();
  // Exclude the development indicator from visual assertions.
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

for (const width of [1440, 900, 390, 320]) {
  test(`profile visual and geometry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await open(page);
    await noOverflow(page);
    const avatar = await page.locator(".profile-avatar").boundingBox();
    const cover = await page.locator(".profile-cover").boundingBox();
    expect(avatar!.width).toBe(width < 768 ? 84 : 108);
    expect(avatar!.y).toBeLessThan(cover!.y + cover!.height);
    expect(avatar!.y + avatar!.height).toBeGreaterThan(
      cover!.y + cover!.height,
    );
    if (width >= 1100) {
      const aside = await page.locator(".profile-overview-aside").boundingBox();
      expect(Math.abs(aside!.y - cover!.y)).toBeLessThan(2);
    }
    const selectedCover = await page
      .locator(".profile-selected-cover")
      .boundingBox();
    expect(selectedCover!.height).toBe(width < 768 ? 168 : 220);
    expect(selectedCover!.width).toBeGreaterThan(250);
    expect(
      await page
        .locator(".profile-record-metrics")
        .evaluate(
          (element) =>
            getComputedStyle(element).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(3);
    expect(errors).toEqual([]);
    await expect(page).toHaveScreenshot(`profile-${width}.png`, {
      animations: "disabled",
    });
  });
}

test("featured work is absent from Recent Work and engagement opens the guest gate", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator(".profile-recent-work")).not.toContainText(
    "The city we build together",
  );
  await page
    .locator(".profile-selected-work")
    .getByRole("button", { name: "Like this item" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("sharing and More actions support keyboard focus and clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await page
    .locator(".profile-header-actions")
    .getByRole("button", { name: "Share profile", exact: true })
    .click();
  await expect(page.getByText("Profile URL copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "http://127.0.0.1:3100/dev-preview/profile",
  );
  const more = page.getByRole("button", { name: "More profile actions" });
  await more.click();
  await expect(
    page
      .getByRole("dialog", { name: "More profile actions" })
      .getByRole("button", { name: "Share profile", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
});

test("mobile sticky tabs, biography and activity remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "?long=1");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Less", exact: true }),
  ).toBeVisible();
  const january = page.getByRole("button", {
    name: "January 2026: 0 published works",
  });
  await january.click();
  await expect(page.locator(".profile-activity-value")).toContainText(
    "January 2026 · 0 published works",
  );
  await expect(page.locator(".profile-compact")).toBeVisible();
  await noOverflow(page);
  await page
    .locator(".profile-tabs-compact")
    .getByRole("tab", { name: "Articles" })
    .click();
  await expect(
    page
      .locator(".profile-primary > .profile-tabs")
      .getByRole("tab", { name: "Articles" }),
  ).toHaveAttribute("aria-selected", "true");
  await noOverflow(page);
});

test("owner, empty, sparse, post and broken-media states", async ({ page }) => {
  await open(page, "?owner=1&empty=1");
  await expect(
    page.getByRole("link", { name: "Edit profile", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Build your intellectual record" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Drafts" })).toBeVisible();
  await open(page, "?sparse=1&cover=0");
  await expect(page.locator(".profile-cover")).toHaveCount(0);
  await open(page, "?featured=post");
  await expect(page.getByRole("link", { name: "Read post" })).toBeVisible();
  await open(page, "?broken=1");
  await expect(page.locator(".profile-cover")).toHaveCount(0);
  await expect(page.locator(".profile-avatar svg")).toBeVisible();
  await noOverflow(page);
});

test("large text and keyboard tab navigation", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page, "?long=1");
  await page.addStyleTag({ content: "html { font-size: 24px !important; }" });
  await noOverflow(page);
  const tabs = page.locator(".profile-primary > .profile-tabs");
  await tabs.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Posts" })).toBeFocused();
  await expect(tabs.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: "About" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page
      .locator(".profile-primary > .profile-tabs")
      .getByRole("tab", { name: "About" }),
  ).toHaveAttribute("aria-selected", "true");
  await noOverflow(page);
});
