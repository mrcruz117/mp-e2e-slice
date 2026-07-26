import { expect, test } from "@playwright/test";

test("a reader with no Feeds configured sees an empty Item list, not an error", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failures.push(`${String(response.status())} ${response.url()}`);
    }
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Feed Reader" }),
  ).toBeVisible();
  // An empty list has no height, so it is attached rather than visible.
  await expect(page.getByTestId("item-list")).toBeAttached();
  await expect(page.getByTestId("item")).toHaveCount(0);
  await expect(page.getByText("Nothing to read yet.")).toBeVisible();

  expect(failures).toEqual([]);
});
