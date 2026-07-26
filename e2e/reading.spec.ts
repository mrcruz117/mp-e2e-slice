// The reader's side of it, in a real browser: a working API behind a blank page
// must not pass.
//
// Un-skipped by the ticket that renders Items. It needs the boot Refresh wired
// to the local stub rather than to HTTP, which is the same seam the API specs
// drive; until that exists there is nothing on the page to assert.

import { expect, test } from "@playwright/test";

test.describe.skip("reading the list", () => {
  test("every Item renders with its Feed's title, newest first", async ({
    page,
  }) => {
    await page.goto("/");

    const items = page.getByTestId("item");
    await expect(items.first()).toBeVisible();

    const titles = await items.getByTestId("item-title").allTextContents();
    const published = await items
      .getByTestId("item-published")
      .allTextContents();
    expect(titles.length).toBeGreaterThan(1);
    expect(published).toHaveLength(titles.length);

    // Newest first: the rendered dates are non-increasing down the list.
    const dates = published
      .map((text) => Date.parse(text))
      .filter(Number.isFinite);
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);

    for (const feedTitle of await items
      .getByTestId("feed-title")
      .allTextContents()) {
      expect(feedTitle.trim()).not.toBe("");
    }
  });

  test("clicking a title opens the Item's link in a new tab and dims the row in place", async ({
    context,
    page,
  }) => {
    await page.goto("/");

    const row = page.getByTestId("item").first();
    const before = await page.getByTestId("item").count();
    await expect(row).toHaveAttribute("data-read", "false");

    const opened = context.waitForEvent("page");
    await row.getByTestId("item-title").click();
    const linked = await opened;
    expect(linked.url()).not.toBe(page.url());

    // Read, not gone: the row stays where it was and only dims.
    await expect(row).toHaveAttribute("data-read", "true");
    await expect(page.getByTestId("item")).toHaveCount(before);
    await expect(page.getByTestId("item").nth(1)).toHaveAttribute(
      "data-read",
      "false",
    );
  });

  test("read state survives a reload", async ({ page }) => {
    await page.goto("/");

    const row = page.getByTestId("item").first();
    await row.getByTestId("item-title").click();
    await expect(row).toHaveAttribute("data-read", "true");

    await page.reload();
    await expect(page.getByTestId("item").first()).toHaveAttribute(
      "data-read",
      "true",
    );
  });
});
