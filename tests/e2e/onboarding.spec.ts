import { expect, test } from "@playwright/test";

// Sign up → create org → invite a crew member → crew member accepts via the
// emailed link (dev outbox) → crew member can't open team management.
test("owner invites a crew member who joins with limited access", async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const ownerEmail = `owner-${stamp}@example.test`;
  const crewEmail = `crew-${stamp}@example.test`;

  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("E2E Owner");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill("e2e-test-password-1");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Company name").fill(`E2E Dealer ${stamp}`);
  await page.getByText("Manufacturer, supplier or dealer").click();
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { name: `E2E Dealer ${stamp}` })).toBeVisible();

  await page.goto("/app/team");
  await page.getByLabel("Email").fill(crewEmail);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation sent to ${crewEmail}`)).toBeVisible();

  const crew = await browser.newPage();
  await crew.goto("/dev/outbox");
  const link = await crew
    .locator("article", { hasText: crewEmail })
    .first()
    .locator("a[href*='/invite/']")
    .getAttribute("href");
  expect(link).toBeTruthy();
  await crew.goto(link!);
  await crew.getByRole("link", { name: "Create an account to accept" }).click();
  await crew.getByLabel("Your name").fill("E2E Crew");
  await crew.getByLabel("Email").fill(crewEmail);
  await crew.getByLabel("Password").fill("e2e-test-password-2");
  await crew.getByRole("button", { name: "Create account" }).click();
  await crew.getByRole("button", { name: "Accept invitation" }).click();
  await expect(crew.getByText("Crew member (free)")).toBeVisible();

  await crew.goto("/app/team");
  await expect(crew).toHaveURL(/\/app$/);
  await expect(crew.getByRole("link", { name: "Team" })).toHaveCount(0);
});
