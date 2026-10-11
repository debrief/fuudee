// Plays the blog's playground in Chromium as a reader would: Python starts in
// the page, tools run, undo replays, a crash mid-save is recovered, a file is
// imported. Screenshots go to $DEBRIEF_SCREENSHOTS.
// Usage: node test/play/play.mjs <built playground folder>
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = path.resolve(process.argv[2] ?? "../site/docs/play");
const shots = process.env.DEBRIEF_SCREENSHOTS;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".py": "text/plain", ".whl": "application/octet-stream", ".geojson": "application/json" };
const server = createServer(async (req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(root) || !existsSync(file)) return res.writeHead(404).end();
  const target = file.endsWith("/") ? path.join(file, "index.html") : file;
  res.writeHead(200, { "content-type": TYPES[path.extname(target)] ?? "application/octet-stream" }).end(await readFile(target));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = async (name) => shots && (await page.waitForTimeout(800), await page.screenshot({ path: path.join(shots, `${name}.png`) }));
const text = (selector) => page.locator(selector).innerText();

try {
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => document.getElementById("status")?.textContent?.startsWith("Ready"), null, { timeout: 240000 });
  assert.match(await text("#history"), /step 1/);
  await shot("play-01-ready");

  // Select BLUE ONE and RED ONE in the outline; Closest approach is offered.
  await page.locator("#outline li", { hasText: "BLUE ONE" }).click();
  await page.locator("#outline li", { hasText: "RED ONE" }).click({ modifiers: ["Control"] });
  await page.locator("#tools button", { hasText: "Closest approach" }).waitFor({ state: "visible" });
  assert.equal(await page.locator("#tools button", { hasText: "Closest approach" }).isEnabled(), true);
  await page.locator("#tools button", { hasText: "Closest approach" }).click();
  const form = page.frameLocator(".frame-form");
  await form.getByRole("button", { name: "Run" }).click();
  await page.locator(".frame-results").waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.getElementById("history")?.textContent?.includes("Closest approach"));
  await shot("play-02-closest-approach");

  // Undo: replay to the step before; the step stays, marked undone.
  await page.locator("#undo").click();
  await page.waitForFunction(() => document.getElementById("history")?.textContent?.includes("undone"));
  await shot("play-03-undone");

  // Crash part-way through a save, then reopen: the change is finished.
  await page.locator("#crash").click();
  await page.locator("#reopen").click();
  await page.locator(".toast", { hasText: "Finished saving a change that was interrupted" }).waitFor();
  assert.match(await text("#history"), /replaced/);
  await shot("play-04-recovered");

  // A colleague's change while a tool runs: Debrief asks.
  await page.locator("#colleague-during").click();
  await page.locator("#outline li", { hasText: "BLUE ONE" }).click();
  await page.locator("#tools button", { hasText: "Track summary" }).click();
  await page.frameLocator(".frame-form").getByRole("button", { name: "Run" }).click();
  await page.locator("#ask").waitFor({ state: "visible" });
  assert.match(await text("#ask-text"), /changed elsewhere/);
  await shot("play-05-conflict");
  await page.locator("#ask-buttons button", { hasText: "Cancel" }).click();

  // Import a legacy plot file.
  const dpf = path.resolve("../python/debrief-io/tests/data/shapes.dpf");
  if (existsSync(dpf)) {
    await page.locator("#file").setInputFiles(dpf);
    await page.locator("#omitted").waitFor({ state: "visible", timeout: 60000 });
    await shot("play-06-imported");
  }
  assert.deepEqual(errors, []);
  console.log("Playground played: tools, undo, crash recovery, conflict, import.");
} finally {
  await browser.close();
  server.close();
}
