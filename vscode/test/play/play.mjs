// Plays the blog's playground in Chromium as a reader would: Python starts in
// the page, tools run, undo replays, a crash mid-save is recovered, a file is
// imported. Screenshots go to $DEBRIEF_SCREENSHOTS.
// Usage: node test/play/play.mjs <built playground folder> [built site folder]
// With a built site, it also starts a demo from a blog post, as a reader would.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = path.resolve(process.argv[2] ?? "../site/docs/play");
const site = process.argv[3] ? path.resolve(process.argv[3]) : undefined;
const shots = process.env.DEBRIEF_SCREENSHOTS;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".py": "text/plain", ".whl": "application/octet-stream", ".geojson": "application/json" };
function serve(folder) {
  return createServer(async (req, res) => {
    let file = path.join(folder, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (file.endsWith(path.sep) || file.endsWith("/")) file = path.join(file, "index.html");
    if (!file.startsWith(folder) || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
  }).listen(0);
}
const server = serve(root);
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
  // (Closest approach changes the plot; a tool that only returns a table saves nothing to conflict with.)
  await page.locator("#colleague-during").click();
  await page.locator("#outline li", { hasText: "BLUE ONE" }).click();
  await page.locator("#outline li", { hasText: "RED ONE" }).click({ modifiers: ["Control"] });
  await page.locator("#tools button", { hasText: "Closest approach" }).click();
  await page.frameLocator(".frame-form").getByRole("button", { name: "Run" }).click();
  await page.locator("#ask").waitFor({ state: "visible" });
  assert.match(await text("#ask-text"), /changed elsewhere/);
  await shot("play-05-conflict");
  await page.locator("#ask-buttons button", { hasText: "Combine the changes" }).click();
  await page.waitForFunction(() => document.getElementById("history")?.textContent?.includes("a colleague"));

  // Import a legacy plot file.
  const dpf = path.resolve("../python/debrief-io/tests/data/shapes.dpf");
  if (existsSync(dpf)) {
    await page.locator("#file").setInputFiles(dpf);
    await page.locator(".omitted-panel li").first().waitFor({ timeout: 60000 });
    assert.equal(await page.locator("#plots").inputValue(), "shapes");
    await shot("play-06-imported");
  }
  // The geodesic demo: drag B and the two answers change.
  await page.goto(`http://127.0.0.1:${port}/geodesic.html`);
  const before = await text("#diff-range");
  const pinB = page.locator(".pin").nth(1);
  const box = await pinB.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 12, y + i * 8); // a hand's drag, not a jump
  await page.mouse.up();
  assert.notEqual(await text("#diff-range"), before);
  assert.match(await text("#v4-range"), /nmi/);
  await shot("play-08-geodesic");

  if (site) await playFromThePost();
  assert.deepEqual(errors, []);
  console.log(`Playground played: tools, undo, crash recovery, conflict, import${site ? ", and from a blog post" : ""}.`);
  async function playFromThePost() {
    const siteServer = serve(site);
    const post = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
    post.on("pageerror", (e) => errors.push(String(e)));
    await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/11/nothing-lost/`);
    const demo = post.locator(".debrief-demo").first();
    await demo.getByRole("button", { name: "Start the demo" }).click();
    const frame = post.frameLocator(".debrief-demo-frame");
    await frame.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
    await demo.scrollIntoViewIfNeeded();
    if (shots) await post.waitForTimeout(800), await post.screenshot({ path: path.join(shots, "play-07-in-the-post.png") });
    siteServer.close();
  }
} catch (error) {
  if (shots) await page.screenshot({ path: path.join(shots, "play-failed.png") });
  const status = await page.locator("#status").innerText({ timeout: 1000 }).catch(() => "-");
  console.error("status:", status, "| page:", page.url());
  throw error;
} finally {
  await browser.close();
  server.close();
}
