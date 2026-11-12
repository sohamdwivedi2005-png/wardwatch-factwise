import { test, expect, Page } from "@playwright/test";

// End-to-end acceptance suite. Runs against E2E_BASE_URL (default: production).
// Each test starts from a freshly re-seeded store (localStorage cleared).

async function fresh(page: Page) {
  await page.goto("/");
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Staff sign-in")).toBeVisible();
}

async function login(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.locator('input[placeholder="1234"]').fill("1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.beforeEach(async ({ page }) => { await fresh(page); });

test("1. every role lands on its correct page", async ({ page }) => {
  await login(page, "Nurse Priya Nair");
  await expect(page).toHaveURL(/\/nurse/);
  await expect(page.getByText("Today's Rounds")).toBeVisible();

  await fresh(page);
  await login(page, "Dr. Kavya Mehta");
  await expect(page).toHaveURL(/\/doctor/);

  await fresh(page);
  await login(page, "Rahul Joshi");
  await expect(page).toHaveURL(/\/admin/);

  await fresh(page);
  await login(page, "Dr. Anil Rao");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("2. route guard redirects a nurse away from the dashboard", async ({ page }) => {
  await login(page, "Nurse Priya Nair");
  await expect(page).toHaveURL(/\/nurse/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/nurse/); // redirected back
});

test("3. invalid temperature is rejected", async ({ page }) => {
  await login(page, "Nurse Priya Nair");
  await page.getByRole("button", { name: "Record", exact: true }).first().click();
  await page.locator('input[placeholder="37.0"]').fill("45");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/between 34.0 and 43.0/)).toBeVisible();
});

test("4. critical temperature requires a second confirmation", async ({ page }) => {
  await login(page, "Nurse Priya Nair");
  await page.getByRole("button", { name: "Record", exact: true }).first().click();
  await page.locator('input[placeholder="37.0"]').fill("41.5");
  await expect(page.getByText(/critical reading/i)).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm reading", exact: true })).toBeVisible();
});

test("5. recording a normal temp makes a Demo patient eligible", async ({ page }) => {
  await login(page, "Nurse Priya Nair");
  await expect(page.getByText("Demo").first()).toBeVisible();
  await page.getByRole("button", { name: "Record", exact: true }).first().click();
  await page.locator('input[placeholder="37.0"]').fill("37.0");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/eligible/i).first()).toBeVisible();
});

test("6. doctor queue shows sections and blocks visits without a temperature", async ({ page }) => {
  await login(page, "Dr. Kavya Mehta");
  await expect(page.getByText("Visit Queue")).toBeVisible();
  await expect(page.getByText("Ready for visit")).toBeVisible();
  await expect(page.getByText("Awaiting temperature")).toBeVisible();
  await expect(page.getByRole("button", { name: "Notify nurse", exact: true }).first()).toBeVisible();
});

test("7. full discharge lifecycle frees a bed and allows a new admission", async ({ page }) => {
  // nurse makes a demo patient eligible
  await login(page, "Nurse Priya Nair");
  await page.getByRole("button", { name: "Record", exact: true }).first().click();
  await page.locator('input[placeholder="37.0"]').fill("37.0");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/eligible/i).first()).toBeVisible();

  // doctor signs off a discharge
  await fresh(page);
  await login(page, "Dr. Kavya Mehta");
  await expect(page.getByText("Discharge sign-offs")).toBeVisible();
  await page.getByRole("button", { name: "Sign off discharge", exact: true }).first().click();
  await expect(page.getByText(/signed off|cleared/i).first()).toBeVisible();

  // admin completes a discharge and sees a freed bed
  await fresh(page);
  await login(page, "Rahul Joshi");
  await page.goto("/admin/discharges");
  await page.getByRole("button", { name: "Complete discharge", exact: true }).first().click();
  await page.getByRole("button", { name: "Confirm discharge", exact: true }).click();
  await expect(page.getByText(/bed freed|Discharged/i).first()).toBeVisible();

  // admit a new patient into the freed bed
  await page.goto("/admin/admit");
  await expect(page.getByText("Admit Patient")).toBeVisible();
  await page.locator("#name").fill("Test Newpatient");
  await page.locator("#age").fill("40");
  await page.getByRole("button", { name: "Admit patient", exact: true }).click();
  await expect(page).toHaveURL(/\/patients\//);
  await expect(page.getByText("Test Newpatient")).toBeVisible();
});

test("8. head-doctor dashboard shows the mortality alert and KPIs", async ({ page }) => {
  await login(page, "Dr. Anil Rao");
  await expect(page.getByText("Quality Dashboard")).toBeVisible();
  await expect(page.getByText(/mortality above target/i)).toBeVisible();
  await expect(page.getByText("All-time mortality")).toBeVisible();
  await expect(page.getByText("Success rate")).toBeVisible();
});

test("9. admin cannot see clinical notes on a patient", async ({ page }) => {
  await login(page, "Rahul Joshi");
  await page.goto("/patients");
  await page.locator('a[href^="/patients/"]').first().click();
  await expect(page.getByText(/not visible to admin/i)).toBeVisible();
});

test("10. demo controls advance time and reset data", async ({ page }) => {
  await login(page, "Dr. Anil Rao");
  // open user menu
  await page.getByText("Dr. Anil Rao").click();
  await expect(page.getByText("Demo controls")).toBeVisible();
  await page.getByRole("button", { name: /Advance 4 hours/ }).click();
  await expect(page.getByText(/Advanced 4 hours/)).toBeVisible();
  await page.getByText("Dr. Anil Rao").click();
  await page.getByRole("button", { name: /Reset demo data/ }).click();
  await expect(page.getByText(/Demo data reset/)).toBeVisible();
});
