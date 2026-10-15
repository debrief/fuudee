// Plays the blog's playground in Chromium as a reader would: Python starts in
// the page, tools run, undo replays, a crash mid-save is recovered, a file is
// imported. Screenshots go to $DEBRIEF_SCREENSHOTS.
// Usage: node test/play/play.mjs <built playground folder> [built site folder]
// With a built site, it also starts a demo from a blog post, as a reader would.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { playAnnotations } from "./annotations.mjs";
import { playDrawing } from "./drawing.mjs";
import { playShear } from "./shear.mjs";
import { playTracks } from "./tracks.mjs";
import { playCleaning } from "./cleaning.mjs";
import { playFixDrag } from "./fixdrag.mjs";
import { playTote, stickyHeadings } from "./tote.mjs";
import { playNarrative, playNarrativeAtScale, vscodeTimelineView } from "./narrative.mjs";
import { playWordNarrative } from "./narrativeword.mjs";

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

  // The time controller is at the top of the side column; the map has no control of its own.
  const timeLabel = () => text("#timebar .time-label");
  assert.equal(await page.locator("#side section").first().getAttribute("id"), "panel-time");
  assert.equal(await page.frameLocator(".frame-map").locator(".tc-window, .tc-current").count(), 0);
  const timeBefore = await timeLabel();
  const markers = () => page.frameLocator(".frame-map").locator(".now").count();
  await page.locator("#timebar .forward").click();
  await page.waitForFunction((was) => document.querySelector("#timebar .time-label")?.textContent !== was, timeBefore);
  assert.ok((await markers()) > 0, "tracks show where they were at current time");
  await playTheTimeController();
  // The Tote: primary and secondaries chosen by pointer, keyboard, the outline's menu and touch;
  // values follow current time as it steps and plays; latency reported (CAP-06, NFR-04).
  await playTote(page, shot);

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

  // The window first ends at 09:00, before the closest approach of BLUE ONE and RED ONE (09:21).
  const tc = (selector) => page.locator(`#timebar ${selector}`);
  const at = (hhmm) => Date.parse(`2023-06-15T${hhmm}:00.000Z`);
  const end = async () => Number(await tc(".tc-end").getAttribute("aria-valuenow"));
  await tc(".tc-start").focus();
  await page.keyboard.press("Home");
  await tc(".tc-end").focus();
  await page.keyboard.press("End");
  for (const key of ["PageDown", "PageDown", "PageDown", ...Array(6).fill("ArrowLeft")]) await page.keyboard.press(key); // 5 min steps
  assert.equal(await end(), at("09:00"));
  await page.waitForTimeout(500);
  const cue = () => text("#timebar .tc-cue-text");
  assert.equal(await cue(), "");

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

  // Its moment is outside the saved window: the window shown widens to take it in, never saved,
  // the widened part hatched, and a note with Keep and Revert stays until the reader chooses (CAP-28).
  await page.locator(".toast", { hasText: "(outside your saved window)" }).waitFor();
  await page.waitForFunction(() => document.querySelector("#timebar .tc-cue-text")?.textContent === "Showing beyond saved window");
  assert.equal(await tc(".tc-cue").getAttribute("aria-live"), "polite");
  assert.ok((await tc(".tc-cue").boundingBox()).height <= 26, "the note is one line, Keep and Revert inline");
  assert.equal(await tc(".tc-cue-text").getAttribute("title"), "Showing beyond saved window");
  assert.equal(await page.locator("#timebar .tc-beyond:visible").count(), 1);
  assert.ok((await end()) > at("09:21") && (await end()) <= at("09:22"), "widened by the least amount");
  const mapView = page.frameLocator(".frame-map");
  const cpaLabel = mapView.locator(".annotation-label", { hasText: "Closest approach" });
  await cpaLabel.first().waitFor(); // the map shows the widened window: the closest approach is drawn
  await page.locator("#side").evaluate((side) => (side.scrollTop = 0));
  await shot("time-06-beyond-saved-window");
  // Stepping current time inside the window shown neither saves it nor clears the note.
  await tc(".back").click();
  assert.equal(await cue(), "Showing beyond saved window");
  // Revert: the saved window again, current time at its nearest edge.
  await tc(".tc-revert").click();
  await page.waitForFunction(() => document.querySelector("#timebar .tc-cue-text")?.textContent === "");
  assert.equal(await end(), at("09:00"));
  assert.equal(Number(await tc(".tc-current").inputValue()), at("09:00"));
  await cpaLabel.first().waitFor({ state: "detached" });

  // A window of ten minutes: the moment is too far for widening (more than twice), so the window moves.
  await tc(".tc-end").focus();
  await page.keyboard.press("Home"); // a second after the start
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  const savedEnd = await end();
  await page.locator("#tools button", { hasText: "Closest approach" }).click();
  await form.getByRole("button", { name: "Run" }).click();
  await page.waitForFunction(() => document.querySelector("#timebar .tc-cue-text")?.textContent === "Showing a different period from the saved window", null, { timeout: 60000 });
  assert.ok((await end()) > at("09:21"), "moved to take the moment in");
  await page.locator("#side").evaluate((side) => (side.scrollTop = 0));
  await shot("time-07-different-period");
  // Keep: saved through the normal path, as letting go is; no step in the history.
  const stepsBeforeKeep = await history();
  await tc(".tc-keep").click();
  await page.waitForFunction(() => document.querySelector("#timebar .tc-cue-text")?.textContent === "");
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".toast.warning").count(), 0, "kept, with no conflict");
  assert.equal(await history(), stepsBeforeKeep);
  assert.notEqual(await end(), savedEnd);
  // Back to the whole plot.
  await tc(".tc-start").focus();
  await page.keyboard.press("Home");
  await tc(".tc-end").focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(500);

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

  // Crash part-way through a save, then reopen: the plot is whole, as it was before that save,
  // and only the change in progress is lost (NFR-10, NFR-11).
  const beforeCrash = await history();
  await page.locator("#crash").click();
  await page.locator("#reopen").click();
  await page.locator(".toast", { hasText: "A save was interrupted before it finished" }).waitFor();
  assert.equal(await history(), beforeCrash);
  assert.doesNotMatch(await history(), /Note added just before a crash/);
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

  // Annotations through their form: a circle added, restyled, undone; an ellipse, an
  // area and a label; the north arrow; the Timeline moving current time (CAP-03 to CAP-05).
  await playAnnotations(page, shot);
  // Drawing and editing them on the map: by pointer and by keyboard, each finished
  // annotation and each release one step; a colleague's change during a drag (CAP-03, NFR-13).
  await playDrawing(page, shot);
  // Moving, rotating, splitting and merging tracks: by pointer, keyboard and form, each one step (CAP-01, CAP-02).
  await playTracks(page, shot);
  // Shearing and stretching a TMA-like leg: by pointer, keyboard and form, each one step (CAP-21).
  await playShear(page, shot);
  // Cleaning tracks: jumps found, shown and removed; smoothing previewed and applied; a fix
  // coloured, labelled and commented on, each one step (CAP-01, EXT-14).
  await playCleaning(page, shot);
  // A single fix moved: by pointer, touch, keyboard and form, each one step; and dead reckoning (CAP-01, NFR-13).
  await playFixDrag(page, shot);
  // The narrative in the Timeline: followed while playing, chosen, filtered, searched,
  // added, changed and deleted, from the keyboard too, on a phone (CAP-05, CAP-20).
  await playNarrative(page, shot);
  // Narrative from Word, the reader asked what legacy Debrief asked; and the Timeline's
  // extras: highlights, choosing without moving time, text size, wrapping, columns (CAP-19, CAP-05).
  await playWordNarrative(page, shot);

  // Import a legacy plot file.
  const dpf = path.resolve("../python/debrief-io/tests/data/shapes.dpf");
  if (existsSync(dpf)) {
    await page.locator("#file").setInputFiles(dpf);
    await page.locator(".omitted-panel li").first().waitFor({ timeout: 60000 });
    assert.equal(await page.locator("#plots").inputValue(), "shapes");
    await shot("play-07-imported");
    // Fixes' own colours, labels and comments are imported, so not listed as left out (EXT-14).
    assert.doesNotMatch(await text(".omitted-panel"), /fix comment|a v4 track has one colour/);
    // Its circles and ellipses are circles and ellipses, drawn as legacy Debrief drew them.
    assert.ok(!(await text(".omitted-panel")).includes("polygons of 72 sides"));
    await page.locator(".side-bar button", { hasText: "Close" }).click();
    await mapFrame.locator('path[stroke-dasharray="1 4"]').first().waitFor(); // the dotted circle
    // Closer, on the legacy plot's styled circles.
    const filled = await mapFrame.locator('path[fill-opacity="0.63"]').first().boundingBox();
    await page.mouse.move(filled.x + filled.width / 2, filled.y + filled.height / 2);
    await page.mouse.wheel(0, -150); // about two and a half zoom levels
    await page.waitForTimeout(800);
    await page.mouse.move(2, 2);
    // A label whose place the plot chose (legacy LabelLocation="Left") is shown on a small
    // circle, where one Debrief placed would wait for more room.
    await mapFrame.locator(".annotation-label", { hasText: "solid hairwidth solid fill" }).waitFor({ state: "visible" });
    await shot("annot-05-imported-dpf");
    // Its fixes' own colours, labels and comments came in as marked fixes (EXT-14).
    await page.locator(`#outline li[data-id="track-nel-style"]`).click();
    await mapFrame.getByRole("button", { name: "Zoom to the selection" }).click();
    await page.locator(`#outline li[data-id="track-nel-style"]`).click({ modifiers: ["Control"] }); // the selection's outline off the picture
    await mapFrame.locator(".fix-label", { hasText: "Override label 1" }).last().waitFor({ state: "visible" });
    assert.ok((await mapFrame.locator("path.fix-mark").count()) >= 4, "the fixes in their own colours");
    // Closer, on the labelled fixes at the track's start: drag them to the middle, then zoom in there.
    const labelled = await mapFrame.locator(".fix-label", { hasText: "Override label 2" }).last().boundingBox();
    const mapBox = await page.locator(".frame-map").boundingBox();
    const middle = { x: mapBox.x + mapBox.width / 2, y: mapBox.y + mapBox.height / 2 };
    await page.mouse.move(labelled.x, labelled.y + 120);
    await page.mouse.down();
    await page.mouse.move(middle.x, middle.y + 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(800);
    await page.mouse.move(2, 2);
    await shot("clean-04-imported-dpf-marks");
  }
  // A Debrief plot file, as a colleague would send it: one file, its history included.
  const sent = path.resolve(root, "sample", "serial-1", "plot.geojson");
  await page.locator("#file").setInputFiles(sent);
  await page.locator(".toast", { hasText: "with its history" }).waitFor({ timeout: 60000 });
  assert.equal(await page.locator("#plots").inputValue(), "serial-1-2");
  assert.match(await history(), /Added from the plot file plot\.geojson/);
  assert.match(await history(), /step 1/);
  await shot("play-07b-plot-file-added");
  // Back to the plot open before, so what follows starts as it did.
  if (existsSync(dpf)) await page.selectOption("#plots", "shapes");
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

  await contextOnDark();
  await vscodeTimeView();
  await vscodeToteView();
  {
    const files = serve(path.join(path.resolve(import.meta.dirname, "..", ".."), "dist", "webview")); // built by vscodeTimeView
    await vscodeTimelineView(browser, files, errors, shot, JSON.parse(readFileSync(path.join(root, "sample/serial-1/plot.geojson"), "utf8")));
    files.close();
  }
  await cdnBlocked();
  if (site) await playFromThePost();
  // Last, as it fills a plot with sixty thousand entries: the Timeline at scale (NFR-06).
  await page.goto(`${BASE}/index.html`);
  await ready();
  await playNarrativeAtScale(page, shot);
  assert.deepEqual(errors, []);
  console.log(`Playground played: map selection, keyboard, the Tote, tools, undo, crash recovery, conflict, annotations, drawing, tracks, shear and stretch, cleaning, single fixes, the narrative in the Timeline (and at 60,000 entries), narrative from Word and the Timeline's extras, import, narrow, CDN blocked${site ? ", and from a blog post" : ""}.`);

  /**
   * The time controller (CAP-28): drag the window and the map shows only it, at
   * once; it is saved when let go, and is no step in the history. The keys move
   * the handles; Space plays; a colleague's window is shown and said.
   */
  async function playTheTimeController() {
    const tc = (selector) => page.locator(`#timebar ${selector}`);
    const mapFrame = page.frameLocator(".frame-map");
    // Leaflet fades a label out over 200 ms, so a redrawn one can briefly have company.
    const label = (name) => mapFrame.locator(".track-label", { hasText: name }).first();
    // Tug 01's last fix is at 10:35; the whole plot runs 08:00 to 12:00.
    await label("Tug 01").waitFor();
    assert.equal(await tc(".tc-start").getAttribute("role"), "slider");
    assert.match(await tc(".tc-start").getAttribute("aria-valuetext"), /08:00:00Z/);
    const stepsBefore = await history();
    const startBefore = await text("#timebar .tc-window-start");
    await shot("time-01-controller");

    // Drag the window's start most of the way along. The map follows before it is let go.
    const rail = await tc(".tc-window").boundingBox();
    const handle = await tc(".tc-start").boundingBox();
    const [x, y] = [handle.x + handle.width / 2, handle.y + handle.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * rail.width * 0.07, y); // a hand's drag
    await page.waitForFunction(async () => true); // let the frame draw
    for (let i = 0; i < 50 && (await mapFrame.locator(".track-label", { hasText: "Tug 01" }).count()); i++) await page.waitForTimeout(100);
    assert.equal(await mapFrame.locator(".track-label", { hasText: "Tug 01" }).count(), 0, "Tug 01 ended before the window");
    await page.mouse.up();
    assert.notEqual(await text("#timebar .tc-window-start"), startBefore);
    assert.match(await text("#timebar .tc-window-start"), /15 Jun 2023 1[01]:\d\d:\d\dZ/);
    // Current time is kept inside the window; the whole tracks stay, thin and visible (CAP-29).
    const [start, current] = [Number(await tc(".tc-start").getAttribute("aria-valuenow")), Number(await tc(".tc-current").inputValue())];
    assert.ok(current >= start, "current time is inside the window");
    const contextLines = (opacity) => mapFrame.locator(`path[stroke-width="1.5"][stroke-opacity="${opacity}"]`).count();
    assert.ok((await contextLines("0.6")) + (await contextLines("0.3")) >= 10, "every track's whole line, visible (or dimmed for the selection)");
    // View state: saved in the plot, never a step in its history.
    await page.waitForTimeout(500);
    assert.equal(await history(), stepsBefore);
    await shot("time-02-window-narrowed");

    // Context tracks: visible, faint or hidden, for the plot; view state, so no step in its history.
    await mapFrame.locator("#map").focus();
    await page.keyboard.press("Escape"); // nothing selected: nothing dimmed
    await page.waitForFunction(() => !document.querySelector("#outline li.selected"));
    assert.equal(await tc(".tc-context").inputValue(), "visible");
    await page.waitForFunction(async () => true);
    for (let i = 0; i < 30 && (await contextLines("0.6")) < 10; i++) await page.waitForTimeout(100);
    assert.ok((await contextLines("0.6")) >= 10, "visible: opacity 0.6, at least 3:1 against the map");
    await shot("context-01-visible-light");
    await tc(".tc-context").selectOption("faint");
    for (let i = 0; i < 50 && (await contextLines("0.35")) < 10; i++) await page.waitForTimeout(100);
    assert.ok((await contextLines("0.35")) >= 10, "faint");
    await tc(".tc-context").selectOption("hidden");
    for (let i = 0; i < 50 && (await contextLines("0.35")) > 0; i++) await page.waitForTimeout(100);
    assert.equal((await contextLines("0.35")) + (await contextLines("0.6")), 0, "hidden: no context lines");
    await tc(".tc-context").selectOption("visible");
    for (let i = 0; i < 50 && (await contextLines("0.6")) < 10; i++) await page.waitForTimeout(100);
    assert.ok((await contextLines("0.6")) >= 10, "visible again");
    await page.waitForTimeout(500);
    assert.equal(await history(), stepsBefore, "context tracks are view state: no step");
    assert.equal(await page.locator(".toast.warning").count(), 0);

    // Keys: an arrow moves a handle by a step (the plot's four hours: 5 min); End puts it back.
    await tc(".tc-end").focus();
    const end = Number(await tc(".tc-end").getAttribute("aria-valuenow"));
    await page.keyboard.press("ArrowLeft");
    assert.equal(Number(await tc(".tc-end").getAttribute("aria-valuenow")), end - 300000);
    await page.keyboard.press("End");
    assert.equal(Number(await tc(".tc-end").getAttribute("aria-valuenow")), end);
    // With the end handle focused, drag the start handle: the other handle losing focus never stops the drag.
    const startNow = Number(await tc(".tc-start").getAttribute("aria-valuenow"));
    const grip = await tc(".tc-start").boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) await page.mouse.move(grip.x + grip.width / 2 - i * 4, grip.y + grip.height / 2);
    await page.mouse.up();
    assert.ok(Number(await tc(".tc-start").getAttribute("aria-valuenow")) < startNow, "the start handle followed the pointer");

    // Space plays from a slider, at the chosen speed; playing stops at the window's end.
    await tc(".tc-current").focus();
    await page.keyboard.press("Home");
    const from = await timeLabel();
    await page.keyboard.press("Space");
    assert.equal(await tc(".tc-play").getAttribute("aria-label"), "Pause");
    await page.waitForFunction((was) => document.querySelector("#timebar .time-label")?.textContent !== was, from);
    await shot("time-03-playing");
    await tc(".tc-speed").selectOption("3600");
    await page.waitForFunction(() => document.querySelector("#timebar .tc-play")?.getAttribute("aria-label") === "Play", null, { timeout: 15000 });
    assert.equal(await tc(".tc-current").inputValue(), await tc(".tc-end").getAttribute("aria-valuenow"));

    // A window of one second (Home on the end handle: a second after the start; the handles never cross)
    // is too short to play at 3600×: Play is off and says why. At 1× it plays.
    const endWas = Number(await tc(".tc-end").getAttribute("aria-valuenow"));
    await tc(".tc-end").focus();
    await page.keyboard.press("Home");
    assert.equal(Number(await tc(".tc-end").getAttribute("aria-valuenow")) - Number(await tc(".tc-start").getAttribute("aria-valuenow")), 1000);
    assert.equal(await tc(".tc-play").getAttribute("aria-disabled"), "true");
    assert.equal(await tc(".tc-play").getAttribute("title"), "Window too short to play at 3600×: widen it or slow down");
    assert.equal(await tc(".tc-play").getAttribute("aria-description"), "Window too short to play at 3600×: widen it or slow down");
    await tc(".tc-current").focus();
    await page.keyboard.press("Space");
    assert.equal(await tc(".tc-play").getAttribute("aria-label"), "Play", "not playing");
    await tc(".tc-play").hover();
    await shot("time-05-play-off-too-short");
    await tc(".tc-speed").selectOption("1");
    assert.equal(await tc(".tc-play").getAttribute("aria-disabled"), "false");
    await tc(".tc-speed").selectOption("60");
    await tc(".tc-end").focus();
    await page.keyboard.press("End");
    assert.ok(Number(await tc(".tc-end").getAttribute("aria-valuenow")) >= endWas);
    await page.waitForTimeout(500);

    // A colleague changes the window: Debrief shows theirs and says so; still no step.
    const ours = await text("#timebar .tc-window-start");
    await page.locator("#colleague-window").click();
    await page.locator(".toast", { hasText: "time window of Serial 1 was changed elsewhere" }).waitFor();
    assert.notEqual(await text("#timebar .tc-window-start"), ours);
    assert.equal(await history(), stepsBefore);
    await page.locator("#side").evaluate((side) => (side.scrollTop = 0)); // the controller in the picture
    await shot("time-04-colleague-window");

    // Home on the start handle: the whole plot again, saved over the colleague's (read since).
    await tc(".tc-start").focus();
    await page.keyboard.press("Home");
    await label("Tug 01").waitFor();
    assert.equal(await text("#timebar .tc-window-start"), startBefore);
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".toast.warning").count(), 0, "saved, with no conflict");
  }

  /** Context tracks on a dark theme: visible, as the map draws them before Python starts. */
  async function contextOnDark() {
    const dark = await browser.newPage({ viewport: { width: 1400, height: 820 }, colorScheme: "dark" });
    dark.on("pageerror", (e) => errors.push(String(e)));
    await dark.goto(`${BASE}/index.html`);
    const map = dark.frameLocator(".frame-map");
    await map.locator(".track-label").first().waitFor({ timeout: 60000 });
    await dark.locator("#timebar .tc-start").focus();
    for (const key of ["PageUp", "PageUp", "PageUp"]) await dark.keyboard.press(key); // shown, not saved before Python
    const visible = () => map.locator('path[stroke-width="1.5"][stroke-opacity="0.6"]').count();
    for (let i = 0; i < 30 && (await visible()) < 10; i++) await dark.waitForTimeout(100);
    assert.ok((await visible()) >= 10, "visible context tracks on a dark theme");
    await shot("context-02-visible-dark", dark);
    await dark.close();
  }

  /**
   * VS Code's Time view page (dist/webview/time.js), at the size VS Code first gives the
   * view at 1440×900 with the other Debrief views open (measured in the integration test's
   * screenshots: about 297 × 136 px; a little less here). Everything shows without scrolling,
   * the note and its Keep and Revert included, and the context choice is not in the view
   * (it is in the view's title menu).
   */
  async function vscodeTimeView() {
    const extension = path.resolve(import.meta.dirname, "..", "..");
    const webview = path.join(extension, "dist", "webview");
    execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: extension, stdio: "inherit" }); // the page as it is now
    const files = serve(webview);
    const view = await browser.newPage({ viewport: { width: 290, height: 132 }, colorScheme: "dark" });
    view.on("pageerror", (e) => errors.push(String(e)));
    const posted = [];
    await view.exposeFunction("tellTest", (message) => posted.push(message));
    await view.route("**/time-view.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body:
          `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><link rel="stylesheet" href="time.css">` +
          // VS Code's own fonts and sizes, and the theme tokens the page uses for its colours.
          `<style>:root { --vscode-font-family: system-ui, Ubuntu, "Droid Sans", sans-serif; --vscode-font-size: 13px; --vscode-editor-font-family: "Droid Sans Mono", monospace; --vscode-foreground: #ccc; --vscode-descriptionForeground: #9d9d9d; --vscode-sideBar-background: #181818; --vscode-focusBorder: #0078d4; --vscode-button-background: #0078d4; --vscode-button-foreground: #fff; --vscode-button-secondaryBackground: #313131; --vscode-button-secondaryForeground: #ccc; --vscode-dropdown-background: #313131; --vscode-input-background: #313131; --vscode-inputValidation-warningBorder: #b89500; --vscode-inputValidation-warningBackground: #352a05; }</style>` +
          `</head><body><div id="root"></div><script>window.acquireVsCodeApi = () => ({ postMessage: (m) => window.tellTest(m) });</script>` +
          `<script src="time.js"></script></body></html>`,
      }),
    );
    await view.goto(`http://127.0.0.1:${files.address().port}/time-view.html`);
    await view.waitForFunction(() => document.getElementById("timebar"));
    for (let i = 0; i < 50 && !posted.some((m) => m.kind === "ready"); i++) await view.waitForTimeout(100);
    const period = { start: "2023-06-15T08:00:00.000Z", end: "2023-06-15T12:00:00.000Z" };
    const showTime = (range, saved) =>
      view.evaluate(([range, saved]) => window.postMessage({ kind: "show_time", time: { current: "2023-06-15T09:21:17.000Z", range }, time_range: { start: "2023-06-15T08:00:00.000Z", end: "2023-06-15T12:00:00.000Z" }, saved_window: saved, context_tracks: "faint" }, "*"), [range, saved]);
    const allShown = async (state) => {
      const box = await view.evaluate(() => {
        const bottom = (selector) => document.querySelector(selector).getBoundingClientRect().bottom;
        return {
          scroll: document.documentElement.scrollHeight - innerHeight,
          height: innerHeight,
          bottoms: [".tc-play", ".tc-speed", ".time-label", ".tc-current", ".tc-step-label", ".tc-cue", ".tc-window-length"].map(bottom),
        };
      });
      assert.ok(box.scroll <= 0, `${state}: the Time view scrolls by ${box.scroll}px`);
      for (const b of box.bottoms) assert.ok(b <= box.height, `${state}: something ends at ${b}px, below the view's ${box.height}px`);
    };
    // A window as saved: no note.
    const early = { start: period.start, end: "2023-06-15T09:00:00.000Z" };
    await showTime(early, early);
    await view.locator(".time-label", { hasText: "09:00:00Z" }).waitFor();
    assert.equal(await view.locator(".tc-cue-text").innerText(), "");
    await allShown("no note");
    assert.equal(await view.locator(".tc-context").count(), 0, "the context choice is in the view's title menu, not the view");
    await shot("vscode-time-view-saved", view);
    // A tool showed a wider window: the note, on one line, the whole text on hover and to screen readers.
    const widened = { start: period.start, end: "2023-06-15T09:22:00.000Z" };
    await showTime(widened, early);
    await view.locator(".tc-cue-text", { hasText: "Showing beyond saved window" }).waitFor();
    await allShown("with the note");
    assert.equal(await view.locator(".tc-cue").getAttribute("aria-live"), "polite");
    assert.equal(await view.locator(".tc-cue-text").getAttribute("title"), "Showing beyond saved window");
    const [cue, keep, revert] = await Promise.all([".tc-cue", ".tc-keep", ".tc-revert"].map((s) => view.locator(s).boundingBox()));
    assert.ok(cue.height <= 26, "the note is one line");
    assert.ok(keep.y >= cue.y && revert.y >= cue.y && revert.x + revert.width <= cue.x + cue.width + 1, "Keep and Revert inline in the note");
    // Play, the steps and speed share a row with current time.
    const row = await Promise.all([".back", ".tc-play", ".forward", ".tc-speed", ".time-label"].map((s) => view.locator(s).boundingBox()));
    for (const box of row) assert.ok(Math.abs(box.y + box.height / 2 - (row[1].y + row[1].height / 2)) <= 3, "one row");
    await shot("vscode-time-view-note", view);
    // Keep, from the keyboard: the window is sent to be saved.
    await view.locator(".tc-keep").focus();
    await view.keyboard.press("Enter");
    for (let i = 0; i < 20 && !posted.some((m) => m.kind === "window_changed"); i++) await view.waitForTimeout(50);
    assert.deepEqual(posted.find((m) => m.kind === "window_changed")?.time_range, widened);
    await view.close();
    files.close();
  }

  /**
   * VS Code's Tote view page (dist/webview/tote.js), at a sidebar's usual width: the values
   * of a show_tote message in legacy Debrief's table, a row a measure and a column a track;
   * the page never scrolls sideways, the tracks scroll inside the table under row headings
   * that stay put; Delete on a secondary's × asks the host to remove it.
   */
  async function vscodeToteView() {
    const extension = path.resolve(import.meta.dirname, "..", "..");
    const files = serve(path.join(extension, "dist", "webview")); // built by vscodeTimeView
    const view = await browser.newPage({ viewport: { width: 290, height: 300 }, colorScheme: "dark" });
    view.on("pageerror", (e) => errors.push(String(e)));
    const posted = [];
    await view.exposeFunction("tellTest", (message) => posted.push(message));
    await view.route("**/tote-view.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body:
          `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><link rel="stylesheet" href="tote.css">` +
          `<style>:root { --vscode-font-family: system-ui, Ubuntu, "Droid Sans", sans-serif; --vscode-font-size: 13px; --vscode-editor-font-family: "Droid Sans Mono", monospace; --vscode-foreground: #ccc; --vscode-descriptionForeground: #9d9d9d; --vscode-sideBar-background: #181818; --vscode-focusBorder: #0078d4; --vscode-dropdown-background: #313131; --vscode-widget-border: #313131; --vscode-list-hoverBackground: #2a2d2e; }</style>` +
          `</head><body><div id="root"></div><script>window.acquireVsCodeApi = () => ({ postMessage: (m) => window.tellTest(m) });</script>` +
          `<script src="tote.js"></script></body></html>`,
      }),
    );
    await view.goto(`http://127.0.0.1:${files.address().port}/tote-view.html`);
    for (let i = 0; i < 50 && !posted.some((m) => m.kind === "ready"); i++) await view.waitForTimeout(100);
    const fixture = JSON.parse(readFileSync(path.resolve(extension, "..", "schemas/fixtures/webview_message/valid/show-tote.json"), "utf8"));
    await view.evaluate((message) => window.postMessage(message, "*"), fixture);
    await view.locator('#tote td[data-track="track-red-one"]').first().waitFor();
    assert.equal(await view.locator(".empty").isHidden(), true);
    // A row a measure, its unit in its heading; a column a track, the primary first.
    assert.deepEqual(await view.locator('#tote tbody th[scope="row"]').allInnerTexts(), ["Range nmi", "Brg °T", "Rel °", "AOB °", "Brg rate °/min", "Crse °T", "Spd kn", "Depth m"]);
    assert.deepEqual(await view.locator('#tote thead th[scope="col"] .tote-name').allInnerTexts(), ["BLUE ONE", "RED ONE", "Tug 01", "track-gone"]);
    assert.equal(await view.locator("#tote .tote-table").getAttribute("aria-label"), "Tote");
    // Figures only; a close range keeps its yards.
    assert.deepEqual(await view.locator('#tote td[data-track="track-red-one"]').allInnerTexts(), ["1350 yd", "200.5", "R024.5", "G135.0", "-0.8", "230.0", "6.0", "20.0"]);
    assert.deepEqual(await view.locator('#tote td[data-track="track-blue-one"]').allInnerTexts(), ["", "", "", "", "", "225.0", "12.0", "—"]);
    // No data: a column of dashes, and why under the table.
    assert.deepEqual([...new Set(await view.locator('#tote td[data-track="track-tug-01"]').allInnerTexts())], ["—"]);
    assert.equal(await view.locator("#tote .tote-why").first().innerText(), "Ended 10:35:00Z");
    assert.equal(await view.locator("#tote .tote-whys li").nth(1).innerText(), "track-gone No longer in the plot");
    // The × in each secondary's heading, named for screen readers.
    assert.deepEqual(await view.locator("#tote thead button.tote-remove").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label"))), [
      "Remove RED ONE from the Tote",
      "Remove Tug 01 from the Tote",
      "Remove track-gone from the Tote",
    ]);
    // Never the page sideways; the table inside itself, its row headings staying put.
    const pageSideways = () => view.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const scroll = view.locator("#tote .tote-scroll");
    assert.equal(await pageSideways(), false, "at 290 px, the page does not scroll sideways");
    await stickyHeadings(scroll, "at 290 px");
    await shot("tote-vscode-view", view);
    // Narrower still, as the side column of a demo in a blog post.
    await view.setViewportSize({ width: 210, height: 300 });
    await view.waitForTimeout(100);
    assert.equal(await pageSideways(), false, "at 210 px, the page does not scroll sideways");
    await stickyHeadings(scroll, "at 210 px");
    // Wide: every track in view, nothing to scroll.
    await view.setViewportSize({ width: 680, height: 300 });
    await view.waitForTimeout(100);
    assert.equal(await pageSideways(), false, "at 680 px, the page does not scroll sideways");
    assert.ok(await scroll.evaluate((s) => s.scrollWidth <= s.clientWidth), "at 680 px, the table fits");
    await view.setViewportSize({ width: 290, height: 300 });
    // Delete on RED ONE's ×: the host is asked to save the Tote without it.
    await view.locator('#tote button.tote-remove[data-track="track-red-one"]').focus();
    await view.keyboard.press("Delete");
    for (let i = 0; i < 20 && !posted.some((m) => m.kind === "tote_changed"); i++) await view.waitForTimeout(50);
    assert.deepEqual(posted.find((m) => m.kind === "tote_changed")?.tote_view, { primary: "track-blue-one", secondaries: ["track-tug-01", "track-gone"] });
    // The map's lines off, from the keyboard: saved with the choice.
    await view.locator("#tote .tote-lines").focus();
    await view.keyboard.press("Space");
    for (let i = 0; i < 20 && posted.filter((m) => m.kind === "tote_changed").length < 2; i++) await view.waitForTimeout(50);
    assert.deepEqual(posted.filter((m) => m.kind === "tote_changed")[1]?.tote_view, { primary: "track-blue-one", secondaries: ["track-tug-01", "track-gone"], map_lines: false });
    // No plot: it says how to start.
    await view.evaluate(() => window.postMessage({ kind: "show_tote" }, "*"));
    await view.locator(".empty", { hasText: "Open a plot" }).waitFor();
    await view.close();
    files.close();
  }

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
    // The annotations post's demo: the Timeline and History beside the map, and the form works.
    await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/13/annotations/`);
    await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
    const annotated = post.frameLocator(".debrief-demo-frame");
    await annotated.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
    await annotated.locator("#timeline .tl-row[data-id]").first().waitFor();
    assert.ok((await annotated.locator("#timeline .tl-row[data-id]").count()) > 3, "the Timeline lists the sample's narrative");
    assert.equal(await annotated.locator("#panel-tools").isHidden(), true);
    await annotated.locator("#add-annotation").click();
    await annotated.frameLocator(".frame-annotation").getByRole("button", { name: "Add" }).waitFor();
    await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
    await shot("annot-06-in-the-post", post);
    // The drawing post's demo: the map's toolbar draws, and the form opens to name it.
    await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/13/drawing-on-the-map/`);
    await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
    const drawn = post.frameLocator(".debrief-demo-frame");
    await drawn.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
    const demoMap = drawn.frameLocator(".frame-map");
    await demoMap.getByRole("toolbar", { name: "Draw an annotation" }).getByRole("button", { name: "Circle", exact: true }).click();
    await demoMap.locator("#map.drawing-mode").waitFor();
    const mapBox = await demoMap.locator("#map").boundingBox();
    await post.mouse.click(mapBox.x + mapBox.width * 0.5, mapBox.y + mapBox.height * 0.5);
    await post.mouse.click(mapBox.x + mapBox.width * 0.6, mapBox.y + mapBox.height * 0.5);
    const named = drawn.frameLocator(".frame-annotation").locator("#field-radius input");
    await named.waitFor();
    assert.notEqual(await named.inputValue(), "");
    await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
    await shot("draw-07-in-the-post", post);
    // The tracks post's demo: select a track, and its move and rotate handles appear.
    await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/14/moving-and-splitting-tracks/`);
    await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
    const moving = post.frameLocator(".debrief-demo-frame");
    await moving.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
    await moving.locator(`#outline li[data-id="track-blue-one"]`).click();
    await moving.frameLocator(".frame-map").locator(".track-handle-rotate").waitFor();
    await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
    await shot("tracks-09-in-the-post", post);
    // The shear post's demo: select a track, and its ends appear, to shear.
    await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/14/shear-and-stretch/`);
    await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
    const shearing = post.frameLocator(".debrief-demo-frame");
    await shearing.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
    await shearing.locator(`#outline li[data-id="track-red-one"]`).click();
    await shearing.frameLocator(".frame-map").locator(".track-handle-end").waitFor();
    await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
    await shot("shear-07-in-the-post", post);
    // The cleaning post's demo: glitches put into RED ONE, and Jumps… finds and rings them.
    await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/14/cleaning-tracks/`);
    await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
    const cleaning = post.frameLocator(".debrief-demo-frame");
    await cleaning.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
    await cleaning.locator(`#outline li[data-id="track-red-one"]`).click();
    await cleaning.locator("#glitches").click();
    await cleaning.locator("#history li", { hasText: "GPS glitches put into RED ONE" }).waitFor();
    await cleaning.locator("#find-jumps").click();
    await cleaning.getByRole("button", { name: "Find" }).click();
    await cleaning.frameLocator(".frame-map").locator("path.fix-check").nth(2).waitFor();
    await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
    await shot("clean-05-in-the-post", post);
    // The single-fix post's demo: select a track, and its handles appear; the fix list offers Move….
    await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/15/dragging-a-fix/`);
    await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
    const fixing = post.frameLocator(".debrief-demo-frame");
    await fixing.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
    await fixing.locator(`#outline li[data-id="track-red-one"]`).click();
    await fixing.frameLocator(".frame-map").locator(".track-handle-end").waitFor();
    await fixing.locator("#fix-list").click();
    await fixing.locator("#move-fix").waitFor();
    await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
    await shot("fixdrag-06-in-the-post", post);
    // The Tote post's demo: the Tote under the time controller; a primary and a secondary give values.
    await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/16/the-tote/`);
    await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
    const toting = post.frameLocator(".debrief-demo-frame");
    await toting.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
    assert.equal(await toting.locator("#panel-tote").isVisible(), true);
    await toting.locator("#tote .tote-primary").selectOption({ label: "BLUE ONE" });
    await toting.locator("#tote .tote-add").selectOption({ label: "RED ONE" });
    await toting.locator('#tote td[data-track="track-red-one"][data-measure="range"]', { hasText: /^(\d+\.\d\d|\d+ yd)$/ }).waitFor();
    // The demo's side column is narrow: the demo's page never scrolls sideways; where the
    // tracks need more room, they scroll inside the table under row headings that stay put.
    assert.ok(await toting.locator("html").evaluate((e) => e.scrollWidth <= e.clientWidth), "the demo's page does not scroll sideways");
    assert.ok(await toting.locator("#panel-tote").evaluate((e) => e.scrollWidth <= e.clientWidth), "the Tote does not widen the demo's side column");
    const scroll = toting.locator("#tote .tote-scroll");
    if (await scroll.evaluate((e) => e.scrollWidth > e.clientWidth)) await stickyHeadings(scroll, "in the post's demo");
    await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
    await shot("tote-06-in-the-post", post);
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
