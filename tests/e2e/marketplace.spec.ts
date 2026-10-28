import { expect, test, type Browser, type Page } from "@playwright/test";

// Post → apply → award → accept, through the real UI, with email verification
// done via the dev outbox link. Exact addresses must appear only after accept.

function localDate(daysFromNow: number, hour: number) {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
}

async function signUpVerified(browser: Browser, as: "poster" | "provider", email: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`/sign-up?as=${as}`);
  await page.getByLabel("Your name").fill(as === "poster" ? "Posting Pat" : "Crew Casey");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-test-password-9");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  // Confirm the email using the link the dev outbox captured.
  await page.goto("/dev/outbox");
  const link = await page
    .locator("article", { hasText: email })
    .filter({ hasText: "Confirm your email" })
    .first()
    .locator("a")
    .getAttribute("href");
  await page.goto(link!);
  await page.goto(`/onboarding?as=${as}`);
  return page;
}

test("a route is posted, applied to, awarded and accepted", async ({ browser }) => {
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const title = `E2E red iron run ${stamp}`;

  // --- Poster: onboard, create and publish a route
  const poster = await signUpVerified(browser, "poster", `poster-${stamp}@example.test`);
  await poster.getByLabel("Company name").fill(`E2E Dealer ${stamp}`);
  await poster.getByLabel("Red Iron", { exact: true }).check();
  await poster.getByRole("button", { name: "Create organization" }).click();
  await expect(poster.getByRole("heading", { name: `E2E Dealer ${stamp}` })).toBeVisible();
  await expect(poster.getByText("Confirm your email to post")).toHaveCount(0);

  await poster.goto("/app/routes/new");
  await expect(poster.getByLabel("Building category")).toHaveValue(/.+/);
  await expect(poster.getByLabel("Building category").locator("option:checked")).toHaveText("Red-iron / rigid-frame steel buildings");
  await poster.getByLabel("Route title").fill(title);
  const pickup = poster.getByRole("group", { name: /^Pickup/ });
  await pickup.getByLabel("Street address").fill("100 Factory Rd");
  await pickup.getByLabel("City").fill("Tyler");
  await pickup.getByLabel("State").fill("TX");
  await pickup.getByLabel("ZIP").fill("75701");
  await pickup.getByLabel("Pickup window: from").fill(localDate(10, 7));
  await pickup.getByLabel("Pickup window: to").fill(localDate(10, 11));
  const stops = poster.getByRole("group", { name: /^Stops/ });
  await stops.getByLabel("Street address").fill("12 Pine Hollow Ln");
  await stops.getByLabel("City").fill("Longview");
  await stops.getByLabel("State").fill("TX");
  await stops.getByLabel("ZIP").fill("75601");
  await stops.getByLabel("Delivery window: from").fill(localDate(10, 13));
  await stops.getByLabel("Delivery window: to").fill(localDate(10, 17));
  await stops.getByLabel("Installation window: from").fill(localDate(11, 8));
  await stops.getByLabel("Installation window: to").fill(localDate(11, 17));
  await poster.getByLabel("Amount (USD)").fill("4800");
  await poster.getByRole("button", { name: "Save draft" }).click();
  await expect(poster.getByRole("heading", { name: title })).toBeVisible();
  await poster.getByRole("button", { name: "Publish" }).click();
  await expect(poster.getByText("Published.")).toBeVisible();

  // --- Provider: onboard, find the route (default filter = primary sector), apply
  const crew = await signUpVerified(browser, "provider", `crew-${stamp}@example.test`);
  await crew.getByLabel("Company name").fill(`E2E Crew ${stamp}`);
  await crew.getByLabel("Red Iron", { exact: true }).check();
  await crew.getByText("Delivery and installation provider").click();
  await crew.getByRole("button", { name: "Create organization" }).click();
  await crew.getByRole("navigation").getByRole("link", { name: "Find work" }).click();
  await expect(crew.getByText(/your primary sector/)).toBeVisible();
  await crew.getByText(title).click();
  await expect(crew.getByRole("heading", { name: title })).toBeVisible();
  await expect(crew.getByText("Tyler, TX")).toBeVisible();
  await expect(crew.getByText("Pine Hollow")).toHaveCount(0);
  await crew.getByLabel("Your availability").fill("Crew free all week");
  await crew.getByRole("button", { name: "Apply" }).click();
  await expect(crew.getByText("Application sent.")).toBeVisible();

  // --- Poster: compare and award
  await poster.reload();
  await expect(poster.getByText(`E2E Crew ${stamp}`, { exact: true })).toBeVisible();
  await poster.getByRole("button", { name: `Award to E2E Crew ${stamp}` }).click();
  await expect(poster.getByText("Award sent.")).toBeVisible();

  // --- Provider: accept; private details are released
  await crew.reload();
  await expect(crew.getByText("You've been awarded this route")).toBeVisible();
  await crew.getByRole("button", { name: "Accept assignment" }).click();
  await expect(crew.getByText("Assignment accepted.")).toBeVisible();
  await crew.reload();
  await expect(crew.getByText(/12 Pine Hollow Ln/)).toBeVisible();
  await expect(crew.getByText(/100 Factory Rd/)).toBeVisible();

  // --- Poster sees the acceptance
  await poster.reload();
  await expect(poster.getByText(`Accepted by E2E Crew ${stamp}`)).toBeVisible();
});
