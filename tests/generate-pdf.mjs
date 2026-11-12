// tests/generate-pdf.mjs — build the submission PDF from report.html.
// Usage: node tests/generate-pdf.mjs <PROD_URL>
import { chromium } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";

const URL = process.argv[2];
if (!URL) { console.error("Provide prod URL"); process.exit(1); }

const SUB = path.resolve("submission");
const SCREENS = path.join(SUB, "screens");
const OUT_PDF = path.join(SUB, "Soham Dwivedi TPM.pdf");

const CAPTIONS = [
  ["01-login.png", "Fig 1 - login screen, pick any staff member and enter PIN 1234"],
  ["02-nurse-pending.png", "Fig 2 - nurse's rounds, patients still pending for today"],
  ["03-record-sheet.png", "Fig 3 - nurse recording a temperature (normal reading)"],
  ["04-eligibility-toast.png", "Fig 4 - patient becomes eligible after a normal reading"],
  ["05-doctor-queue.png", "Fig 5 - doctor's visit queue"],
  ["06-doctor-blocked.png", "Fig 6 - doctor can't visit a patient until the temperature is recorded"],
  ["07-patient-detail.png", "Fig 7 - patient detail with the temperature graph"],
  ["08-log-visit.png", "Fig 8 - logging a doctor visit"],
  ["09-signoff.png", "Fig 9 - doctor signing off a discharge"],
  ["10-bed-board.png", "Fig 10 - admin bed board for all 74 beds"],
  ["11-discharge-queue.png", "Fig 11 - admin discharge queue"],
  ["12-admit.png", "Fig 12 - admitting a patient into a free bed"],
  ["13-dashboard.png", "Fig 13 - head doctor dashboard with the mortality alert"],
  ["14-alerts.png", "Fig 14 - alerts dropdown"],
  ["15-validation.png", "Fig 15 - an invalid temperature gets rejected"],
];

const have = CAPTIONS.filter(([f]) => fs.existsSync(path.join(SCREENS, f)));
console.log("figures present:", have.length, "/ 15");

let figs = "";
for (let i = 0; i < have.length; i += 2) {
  figs += `<div class="figpair">`;
  for (const [f, cap] of have.slice(i, i + 2)) {
    figs += `<figure><img src="screens/${f}" /><figcaption>${cap}</figcaption></figure>`;
  }
  figs += `</div>`;
}

let html = fs.readFileSync(path.join(SUB, "report.html"), "utf8");
html = html.replaceAll("{{URL}}", URL).replace("<!--FIGURES-->", figs);
if (have.length === 0) html = html.replace('<div class="screens-head"></div>', "");
const filled = path.join(SUB, ".report.filled.html");
fs.writeFileSync(filled, html);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + filled.replace(/\\/g, "/"), { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: OUT_PDF,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: false,
    margin: { top: "20mm", bottom: "20mm", left: "22mm", right: "22mm" },
  });
  await browser.close();

  // set clean metadata (Title + Author), strip generator-ish fields
  const bytes = fs.readFileSync(OUT_PDF);
  const pdf = await PDFDocument.load(bytes);
  pdf.setTitle("Soham Dwivedi TPM");
  pdf.setAuthor("Soham Dwivedi");
  pdf.setSubject("Technical Product Manager Assessment");
  pdf.setCreator("");
  pdf.setProducer("");
  const out = await pdf.save();
  fs.writeFileSync(OUT_PDF, out);
  fs.rmSync(filled, { force: true });
  console.log("PDF written:", OUT_PDF);
})();
