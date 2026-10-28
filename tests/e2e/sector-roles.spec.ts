import { expect, test, type Page } from "@playwright/test";

// Onboarding: roles depend on the industry sector; changing sector clears the role.
const ALL = [
  "Manufacturer, supplier or dealer",
  "Installation company or crew",
  "Delivery / transport company",
  "Delivery and installation provider",
];
const TUBE_INSTALLER = "Installation company or independent crew";
const EXPECTED: Record<string, string[]> = {
  "Red Iron": ALL,
  "Cold Formed Steel": ALL,
  "Tube Steel": ["Manufacturer, supplier or dealer", TUBE_INSTALLER, "Delivery and installation provider"],
  "Portable Sheds": ["Manufacturer, supplier or dealer", "Delivery / transport company"],
};

async function signUp(page: Page) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Sector Tester");
  await page.getByLabel("Email").fill(`sector-${stamp}@example.test`);
  await page.getByLabel("Password").fill("e2e-test-password-3");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  return stamp;
}

const roleGroup = (page: Page) => page.getByRole("group", { name: "What does your company do?" });

test("each sector shows only its roles, and changing sector clears the role", async ({ page }) => {
  await signUp(page);
  await expect(page.getByText("Choose your primary sector first.")).toBeVisible();
  await expect(roleGroup(page).getByRole("radio")).toHaveCount(0);

  for (const [sector, roles] of Object.entries(EXPECTED)) {
    await page.getByLabel(sector, { exact: true }).check();
    const radios = roleGroup(page).getByRole("radio");
    await expect(radios).toHaveCount(roles.length);
    for (const r of [...ALL, TUBE_INSTALLER]) {
      await expect(roleGroup(page).getByText(r, { exact: true })).toHaveCount(roles.includes(r) ? 1 : 0);
    }
  }

  // Pick a role valid in Red Iron, switch to Portable Sheds: nothing stays selected.
  await page.getByLabel("Red Iron", { exact: true }).check();
  await roleGroup(page).getByText("Installation company or crew").click();
  await expect(roleGroup(page).getByRole("radio", { checked: true })).toHaveCount(1);
  await page.getByLabel("Portable Sheds", { exact: true }).check();
  await expect(roleGroup(page).getByRole("radio", { checked: true })).toHaveCount(0);
  // Even a role that exists in both sectors is cleared on change.
  await roleGroup(page).getByText("Manufacturer, supplier or dealer").click();
  await page.getByLabel("Tube Steel", { exact: true }).check();
  await expect(roleGroup(page).getByRole("radio", { checked: true })).toHaveCount(0);
});

test("creates the organization with the chosen sector and role", async ({ page }) => {
  const stamp = await signUp(page);
  await page.getByLabel("Company name").fill(`Shed Haulers ${stamp}`);
  await page.getByLabel("Portable Sheds", { exact: true }).check();
  await expect(page.getByText("You transport, deliver and place portable sheds.")).toBeVisible();
  await roleGroup(page).getByText("Delivery / transport company").click();
  await page.getByLabel("State").fill("TX");
  await page.getByLabel("ZIP").fill("75701");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { name: `Shed Haulers ${stamp}` })).toBeVisible();
  // Saved as a provider org: the provider navigation appears.
  await expect(page.getByRole("navigation").getByRole("link", { name: "Find work" })).toBeVisible();
});
