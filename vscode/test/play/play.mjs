// Plays the blog's playground in Chromium as a reader would: Python starts in
// the page, tools run, undo replays, a crash mid-save is recovered, a file is
// imported. Screenshots go to $DEBRIEF_SCREENSHOTS.
// Usage: node test/play/play.mjs <built playground folder> [built site folder]
// With a built site, it also starts a demo from a blog post, as a reader would.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
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
const BASE = `http://127.0.0.1:${port}`;

// Behind an HTTPS proxy (as in some CI and sandboxes), the CDN goes through it; this server never does.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: proxy ? [`--proxy-server=https=${new URL(proxy).host}`, "--proxy-bypass-list=<-loopback>"] : [],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = async (name, on = page) => shots && (await on.waitForTimeout(800), await on.screenshot({ path: path.join(shots, `${name}.png`) }));
const text = (selector) => page.locator(selector).innerText();
const selected = () => page.$$eval("#outline li.selected .name", (rows) => rows.map((r) => r.textContent));
const history = () => text("#history");
const ready = (on = page) => on.waitForFunction(() => document.getElementById("status")?.textContent?.startsWith("Ready"), null, { timeout: 240000 });

try {
  await page.goto(`${BASE}/index.html`);
  // Before Python is ready: the map and outline work; what needs Python is off.
  assert.equal(await page.locator("#plots").isDisabled(), true);
  assert.equal(await page.locator("#plots option").first().innerText(), "Loading…");
  for (const id of ["undo", "redo", "crash", "colleague", "colleague-during", "file"]) assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
  // A selection made on the preview survives Python opening the plot.
  await page.locator(`#outline li[data-id="track-red-one"]`).click();
  await ready();
  assert.deepEqual(await selected(), ["RED ONE"]);
  assert.equal(await page.locator("#undo").isEnabled(), true);
  assert.match(await history(), /step 1/);
  await shot("play-01-ready");

  // Current time is set at the top of the side column; the map shows no control of its own.
  const timeLabel = () => text("#timebar .time-label");
  assert.equal(await page.locator("#side section").first().getAttribute("id"), "panel-time");
  assert.equal(await page.frameLocator(".frame-map").locator("#timebar").isHidden(), true);
  const timeBefore = await timeLabel();
  const markers = () => page.frameLocator(".frame-map").locator(".now").count();
  await page.locator("#timebar .forward").click();
  await page.waitForFunction((was) => document.querySelector("#timebar .time-label")?.textContent !== was, timeBefore);
  assert.ok((await markers()) > 0, "tracks show where they were at current time");

  // The map: a click on BLUE ONE's first fix, inside the exercise area, selects BLUE ONE, not the area.
  const plot = JSON.parse(readFileSync(path.join(root, "sample/serial-1/plot.geojson"), "utf8"));
  const blue = plot.features.find((f) => f.properties.name === "BLUE ONE").properties.style.colour;
  const dot = await page.frameLocator(".frame-map").locator(`path.leaflet-interactive[stroke="${blue}"][fill-opacity="0"]`).boundingBox();
  await page.mouse.click(dot.x + dot.width / 2, dot.y + dot.height / 2);
  await page.waitForFunction(() => document.querySelector("#outline li.selected .name")?.textContent === "BLUE ONE");
  assert.deepEqual(await selected(), ["BLUE ONE"]);
  // ...and a click inside the area, near its corner and away from any track, selects nothing.
  const area = await page.frameLocator(".frame-map").locator('path[fill-opacity="0.05"]').boundingBox();
  await page.mouse.click(area.x + 25, area.y + 25);
  await page.waitForFunction(() => !document.querySelector("#outline li.selected"));
  await shot("play-02-map-click");

  // The outline from the keyboard: Space selects, and Tab moves on (it is not trapped).
  const rows = page.locator("#outline li");
  assert.equal(await page.locator("#outline").getAttribute("role"), "listbox");
  await rows.nth(0).focus();
  await page.keyboard.press(" ");
  await page.waitForFunction(() => document.querySelector("#outline li")?.getAttribute("aria-selected") === "true");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.id), await rows.nth(1).getAttribute("data-id"));
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("#outline li.selected").length === 1 && document.querySelectorAll("#outline li")[1].classList.contains("selected"));

  // Select BLUE ONE and RED ONE in the outline; Closest approach is offered.
  await page.locator(`#outline li[data-id="track-blue-one"]`).click();
  await page.locator(`#outline li[data-id="track-red-one"]`).click({ modifiers: ["Control"] });
  // Offered once Python has checked the selection, which takes a moment.
  await page.waitForFunction(() => [...document.querySelectorAll("#tools button")].some((b) => b.textContent === "Closest approach" && !b.disabled));
  await page.locator("#tools button", { hasText: "Closest approach" }).click();
  const form = page.frameLocator(".frame-form");
  const started = Date.now();
  await form.getByRole("button", { name: "Run" }).click();
  await page.locator(".frame-results").waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.getElementById("history")?.textContent?.includes("Closest approach"));
  console.log(`Closest approach, from Run to its result: ${Date.now() - started} ms`);
  await shot("play-03-closest-approach");

  // Ctrl+Z on the map undoes (forwarded from its frame), and closes results that no longer apply.
  await page.frameLocator(".frame-map").locator("#map").focus();
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => document.getElementById("history")?.textContent?.includes("undone"));
  assert.equal(await page.locator("#side-frame").isHidden(), true);
  // Not while typing: Ctrl+Y in a field leaves the history alone.
  const before = await history();
  await page.locator("#plots").focus();
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(600);
  assert.equal(await history(), before);
  // Ctrl+Y in the page redoes; then Undo, the button.
  await page.locator("#selected-count").click();
  await page.keyboard.press("Control+y");
  await page.waitForFunction(() => !document.getElementById("history")?.textContent?.includes("undone"));
  await page.locator("#undo").click();
  await page.waitForFunction(() => document.getElementById("history")?.textContent?.includes("undone"));
  await shot("play-04-undone");

  // Crash part-way through a save, then reopen: the change is finished.
  await page.locator("#crash").click();
  await page.locator("#reopen").click();
  await page.locator(".toast", { hasText: "Finished saving a change that was interrupted" }).waitFor();
  assert.match(await history(), /replaced/);
  assert.match(await history(), /Note added just before a crash/);
  await shot("play-05-recovered");

  // A colleague's change while a tool runs: Debrief asks. Escape is Cancel.
  // (Closest approach changes the plot; a tool that only returns a table saves nothing to conflict with.)
  await page.locator("#colleague-during").click();
  await page.locator(`#outline li[data-id="track-blue-one"]`).click();
  await page.locator(`#outline li[data-id="track-red-one"]`).click({ modifiers: ["Control"] });
  await page.locator("#tools button", { hasText: "Closest approach" }).click();
  await page.frameLocator(".frame-form").getByRole("button", { name: "Run" }).click();
  await page.locator("#ask").waitFor({ state: "visible" });
  assert.match(await text("#ask-text"), /changed elsewhere/);
  await shot("play-06-conflict");
  await page.keyboard.press("Escape");
  await page.frameLocator(".frame-form").getByText("was not run").waitFor();
  assert.match(await history(), /Note added by a colleague/);
  // Again, and combine the changes this time.
  await page.locator("#colleague-during").click();
  await page.frameLocator(".frame-form").getByRole("button", { name: "Run" }).click();
  await page.locator("#ask").waitFor({ state: "visible" });
  await page.locator("#ask-buttons button", { hasText: "Combine the changes" }).click();
  await page.locator(".frame-results").waitFor({ timeout: 60000 });
  // The results panel has a Close button of its own.
  await page.locator("#side-frame .side-bar button", { hasText: "Close" }).click();
  assert.equal(await page.locator("#side-frame").isHidden(), true);

  // Colour and hiding are content: each is a step in the history, named, and undone by Ctrl+Z (SUB-22).
  const mapFrame = page.frameLocator(".frame-map");
  const blueLine = () => mapFrame.locator(`path.leaflet-interactive[stroke="${blue}"]`).count();
  const red = "#e01c3e";
  await page.locator(`#outline li[data-id="track-blue-one"]`).click();
  await page.selectOption("#colour", { label: "Red" });
  await page.waitForFunction(() => document.getElementById("history")?.textContent?.includes("Colour of BLUE ONE set to red"));
  assert.equal(await blueLine(), 0, "BLUE ONE is drawn red now");
  await shot("islands-01-colour-in-history");
  const ais = await page.locator(`#outline li[data-id^="track-ais-"]`).first().getAttribute("data-id");
  await page.locator(`#outline li[data-id="${ais}"]`).click();
  await page.locator("#hide").click();
  await mapFrame.locator(".hidden-control", { hasText: "1 hidden" }).waitFor();
  assert.match(await text(`#outline li[data-id="${ais}"] .detail`), /hidden on map/);
  assert.match(await history(), /hidden on the map/);
  await shot("islands-02-hidden-on-map");
  // Ctrl+Z twice: the hiding, then the colour, are undone like any change.
  await page.locator("#selected-count").click();
  await page.keyboard.press("Control+z");
  await mapFrame.locator(".hidden-control").waitFor({ state: "hidden" });
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => /Colour of BLUE ONE set to red[^]*undone/.test(document.getElementById("history")?.textContent ?? ""));
  await mapFrame.locator(`path.leaflet-interactive[stroke="${blue}"]`).first().waitFor();
  assert.notEqual(blue, red);
  await shot("islands-03-undo-restored-colour");
  // Redo both, then the map's "Show all" shows the hidden track again, as one more step.
  await page.keyboard.press("Control+y");
  await page.waitForFunction(() => (document.getElementById("history")?.textContent?.match(/undone/g) ?? []).length === 1);
  await page.keyboard.press("Control+y");
  await mapFrame.locator(".hidden-control", { hasText: "1 hidden" }).waitFor();
  await mapFrame.locator(".hidden-control button").click();
  await mapFrame.locator(".hidden-control").waitFor({ state: "hidden" });
  assert.match(await history(), /shown on the map/);

  // Import a legacy plot file.
  const dpf = path.resolve("../python/debrief-io/tests/data/shapes.dpf");
  if (existsSync(dpf)) {
    await page.locator("#file").setInputFiles(dpf);
    await page.locator(".omitted-panel li").first().waitFor({ timeout: 60000 });
    assert.equal(await page.locator("#plots").inputValue(), "shapes");
    await shot("play-07-imported");
  }
  // A REP file with no tracks is refused, quoting what it couldn't read.
  await page.locator("#file").setInputFiles({ name: "junk.rep", mimeType: "text/plain", buffer: Buffer.from("this is junk\n") });
  await page.locator(".toast", { hasText: "no tracks could be read" }).waitFor({ timeout: 60000 });
  assert.match(await text("#toasts"), /'this is' is not a date and time/);

  // Narrow: the form goes under the map, not beside it, and fits.
  await page.setViewportSize({ width: 400, height: 800 });
  await page.selectOption("#plots", "serial-1");
  await page.locator(`#outline li[data-id="track-blue-one"]`).click();
  await page.locator("#tools button", { hasText: "Range rings" }).click();
  await page.frameLocator(".frame-form").getByRole("button", { name: "Run" }).waitFor();
  // Its time field starts at current time, as the analyst reads it.
  assert.match(await page.frameLocator(".frame-form").locator("#p-at input").inputValue(), /^\d{1,2} [A-Z][a-z]{2} \d{4} \d\d:\d\d:\d\dZ$/);
  const [mapAt, formAt] = [await page.locator(".frame-map").boundingBox(), await page.locator(".frame-form").boundingBox()];
  assert.ok(formAt.y >= mapAt.y + mapAt.height - 1, "form is under the map");
  assert.ok(formAt.width <= 400, "form fits the width");
  assert.equal(await page.frameLocator(".frame-form").locator("html").evaluate((html) => html.scrollWidth <= html.clientWidth), true, "form doesn't scroll sideways");
  await page.locator(".side-frame").scrollIntoViewIfNeeded();
  await shot("play-08-narrow-form");
  await page.setViewportSize({ width: 1400, height: 820 });
  await shot("play-08b-form-current-time");

  // The geodesic demo: drag B and the two answers change; the arrow keys move a pin too.
  await page.goto(`${BASE}/geodesic.html`);
  const start = await text("#diff-range");
  const pinB = page.locator(".pin").nth(1);
  const box = await pinB.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 12, y + i * 8); // a hand's drag, not a jump
  await page.mouse.up();
  const dragged = await text("#diff-range");
  assert.notEqual(dragged, start);
  assert.match(await text("#v4-range"), /nmi/);
  await page.locator(".pin").first().focus();
  const a = await text("#a");
  await page.keyboard.press("ArrowUp");
  assert.notEqual(await text("#a"), a);
  await shot("play-09-geodesic");

  await cdnBlocked();
  if (site) await playFromThePost();
  assert.deepEqual(errors, []);
  console.log(`Playground played: map selection, keyboard, tools, undo, crash recovery, conflict, import, narrow, CDN blocked${site ? ", and from a blog post" : ""}.`);

  /** With the CDN blocked, the page says so plainly; the map still works. */
  async function cdnBlocked() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.route(/cdn\.jsdelivr\.net/, (route) => route.abort("blockedbyclient"));
    const blocked = await context.newPage();
    await blocked.goto(`${BASE}/index.html`);
    await blocked.locator("#status", { hasText: "cdn.jsdelivr.net" }).waitFor({ timeout: 60000 });
    assert.match(await blocked.locator("#status").innerText(), /Python couldn't be downloaded from cdn\.jsdelivr\.net; your network may block it\. The map still works/);
    assert.match(await blocked.locator("#tools").innerText(), /Needs Python/);
    assert.equal(await blocked.locator("#crash").isDisabled(), true);
    await blocked.locator(`#outline li[data-id="track-blue-one"]`).click();
    assert.equal(await blocked.locator("#outline li.selected .name").innerText(), "BLUE ONE");
    await shot("play-10-cdn-blocked", blocked);
    await context.close();
  }

  async function playFromThePost() {
    const siteServer = serve(site);
    const post = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
    post.on("pageerror", (e) => errors.push(String(e)));
    await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/11/nothing-lost/`);
    const demos = post.locator(".debrief-demo");
    await demos.first().getByRole("button", { name: "Start the demo" }).click();
    const frame = post.frameLocator(".debrief-demo-frame");
    await frame.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
    await demos.first().scrollIntoViewIfNeeded();
    await shot("play-11-in-the-post", post);
    // Only one demo runs at a time: starting the import demo puts the first back to its button.
    await demos.nth(1).getByRole("button", { name: "Start the demo" }).click();
    assert.equal(await post.locator(".debrief-demo-frame").count(), 1);
    await demos.first().getByRole("button", { name: "Start the demo" }).waitFor();
    assert.equal(await demos.nth(1).locator(".debrief-demo-frame").count(), 1);
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
