// tests/screens.mjs — capture the 15 production screenshots.
// Usage: node tests/screens.mjs <PROD_URL>
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const URL = process.argv[2];
if (!URL) { console.error("Provide prod URL"); process.exit(1); }
const OUT = path.resolve("submission/screens");
fs.mkdirSync(OUT, { recursive: true });

const DESK = { width: 1440, height: 900 };
const MOB = { width: 390, height: 844 };
const results = [];

async function shot(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, name) });
  results.push(name);
  console.log("captured", name);
}

async function login(page, cardText) {
  await page.goto(URL + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(`button:has-text("${cardText}")`, { timeout: 15000 });
  await page.click(`button:has-text("${cardText}")`);
  const pin = page.locator('input[placeholder="1234"]');
  await pin.fill("1234");
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: DESK, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  try {
    // clean slate
    await page.goto(URL + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // 1 login (desktop)
    await shot(page, "01-login.png");

    // ---- NURSE (mobile) ----
    await login(page, "Nurse Priya Nair");
    await page.setViewportSize(MOB);
    await page.goto(URL + "/nurse", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "02-nurse-pending.png");

    const recordBtn = () => page.getByRole("button", { name: "Record", exact: true }).first();

    // 15 validation error (do before consuming a demo patient): open a Record, type 45
    try {
      await recordBtn().click({ timeout: 8000 });
      const inp = page.locator('input[placeholder="37.0"]');
      await inp.fill("45", { timeout: 8000 });
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.waitForTimeout(600);
      await shot(page, "15-validation.png");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.waitForTimeout(400);
    } catch (e) { console.log("15 fail", e.message); }

    // 3 record sheet with normal value
    try {
      await recordBtn().click({ timeout: 8000 });
      const inp2 = page.locator('input[placeholder="37.0"]');
      await inp2.fill("37.0", { timeout: 8000 });
      await page.waitForTimeout(500);
      await shot(page, "03-record-sheet.png");

      // 4 eligibility toast — save and catch the toast
      await page.getByRole("button", { name: "Save", exact: true }).click();
      try { await page.waitForSelector("text=eligible", { timeout: 4000 }); } catch {}
      await page.screenshot({ path: path.join(OUT, "04-eligibility-toast.png") });
      results.push("04-eligibility-toast.png");
      console.log("captured 04-eligibility-toast.png");
    } catch (e) { console.log("03/04 fail", e.message); }

    // ---- DOCTOR (desktop) ----
    await page.setViewportSize(DESK);
    await login(page, "Dr. Kavya Mehta");
    await page.goto(URL + "/doctor", { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await shot(page, "05-doctor-queue.png");

    // 6 doctor blocked (awaiting temperature section) — scroll to it
    try {
      const awaiting = page.locator('text=Awaiting temperature').first();
      await awaiting.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await shot(page, "06-doctor-blocked.png");
    } catch (e) { console.log("06 fail", e.message); }

    // 8 log visit dialog (scroll back to Ready for visit, click Log visit)
    try {
      await page.locator('text=Ready for visit').first().scrollIntoViewIfNeeded();
      await page.click('button:has-text("Log visit")', { timeout: 6000 });
      await page.waitForTimeout(500);
      await shot(page, "08-log-visit.png");
      await page.click('button:has-text("Cancel")');
    } catch (e) { console.log("08 fail", e.message); }

    // 9 discharge sign-off section
    try {
      await page.locator('text=Discharge sign-offs').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await shot(page, "09-signoff.png");
    } catch (e) { console.log("09 fail", e.message); }

    // 7 patient detail with chart — open first patient from queue
    try {
      await page.goto(URL + "/patients", { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      await page.click('a[href^="/patients/"]');
      await page.waitForSelector('text=Temperature — last 14 days', { timeout: 8000 });
      await page.waitForTimeout(900);
      await shot(page, "07-patient-detail.png");
    } catch (e) { console.log("07 fail", e.message); }

    // ---- ADMIN (desktop) ----
    await login(page, "Rahul Joshi");
    await page.goto(URL + "/admin", { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await shot(page, "10-bed-board.png");

    await page.goto(URL + "/admin/discharges", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "11-discharge-queue.png");

    await page.goto(URL + "/admin/admit", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "12-admit.png");

    // ---- HEAD DOCTOR (desktop) ----
    await login(page, "Dr. Anil Rao");
    await page.goto(URL + "/dashboard", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await shot(page, "13-dashboard.png");

    // 14 alerts dropdown
    try {
      await page.click('button[aria-label="Alerts"]');
      await page.waitForTimeout(600);
      await shot(page, "14-alerts.png");
    } catch (e) { console.log("14 fail", e.message); }

  } catch (e) {
    console.error("FATAL", e);
  } finally {
    await browser.close();
    console.log("DONE", results.length, "shots:", results.join(","));
  }
})();
