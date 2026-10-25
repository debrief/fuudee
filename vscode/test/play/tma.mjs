// TMA in the playground (CAP-21; product owner, 24 Oct 2026), played as an analyst would on the
// sample's serial 2, where BLUE ONE zigzags astern of RED ONE to resolve range:
// - the Bow sonar's cuts in the bearing view's list, virtualised (only the rows in sight are in
//   the page), chosen by the keyboard as a period;
// - a solution made from them by the first guess's form, its defaults in the analyst's units,
//   one step; its residuals and RMS shown, after legacy's Stacked Dots;
// - dragged on the map by its end (a shear): the residuals and the RMS follow the drag, within the
//   drag budget (NFR-04), measured; one step on letting go, exact again from Python;
// - a wild cut left out of the RMS by the keyboard, one step, and counted again by Undo;
// - split into legs at a cut picked in the view, one step; the later leg dragged on its own
//   (This leg), the earlier staying where it was;
// - a second solution made by two clicks on the map, on the first cut's line and the last's;
// - the next ambiguous cut found from the keyboard, and a side kept from the view;
// - a legacy plot's TMA solution imported as a solution, its residuals shown.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { showPanel } from "./dock.mjs";

// RED ONE as the sample has it, for first guesses near the truth: where it was at a time, and the
// distance and direction between two places (on a sphere: near enough for a guess).
const SAMPLE = path.resolve("../site/docs/play/sample/serial-2/plot.geojson");
const RAD = Math.PI / 180;
function redOneAt(iso) {
  const red = JSON.parse(readFileSync(SAMPLE, "utf8")).features.find((f) => f.id === "track-red-one");
  const t = Date.parse(iso);
  const times = red.properties.times.map((x) => Date.parse(x));
  const i = Math.max(0, Math.min(times.length - 2, times.findIndex((x) => x > t) - 1));
  const f = (t - times[i]) / (times[i + 1] - times[i]);
  const [a, b] = [red.geometry.coordinates[i], red.geometry.coordinates[i + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
function between([lon1, lat1], [lon2, lat2]) {
  const [p1, p2, dl] = [lat1 * RAD, lat2 * RAD, (lon2 - lon1) * RAD];
  const metres = 6371008.8 * Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)));
  const bearing = (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD + 360) % 360;
  return { metres, bearing };
}

export async function playTma(page, shot) {
  const mapFrame = page.frameLocator(".frame-map");
  // Pictures without the notes that come and go over the panels.
  const picture = async (name) => {
    await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));
    await shot(name);
  };
  const zoomToSelection = async () => {
    await mapFrame.getByRole("button", { name: "Zoom to the selection", exact: true }).click();
    await page.waitForTimeout(400);
    // One step out, so the ends' handles are clear of the map's edges.
    await mapFrame.locator(".leaflet-control-zoom-out").click();
    await page.waitForTimeout(400);
  };
  const view = page.locator("#bearings");
  const steps = () => page.locator("#history li").count();
  const latest = () => page.locator("#history li").first().locator(".name").textContent();
  const stepAdded = (count) => page.waitForFunction((c) => document.querySelectorAll("#history li").length > c, count, { timeout: 60000 });
  const handle = (role) => mapFrame.locator(`.track-handle[data-role="${role}"]`);
  const centreOf = async (locator) => {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const rms = () => view.locator(".tma-rms").innerText();
  const residuals = () => page.evaluate(() => window.debriefTma.residuals);
  const list = view.locator(".tma-list");
  const rowsInPage = () => view.locator(".tma-row").count();
  const undo = async () => {
    const before = await page.locator("#history li.undone").count();
    await showPanel(page, "history");
    await page.locator("#undo").click();
    await page.waitForFunction((u) => document.querySelectorAll("#history li.undone").length > u, before, { timeout: 60000 });
    await showPanel(page, "bearings");
  };
  /** Room for the view under the map: the strip made taller by its sash, as a reader would drag it. */
  const tallerStrip = async () => {
    const strip = await page.locator("#panel-bearings").boundingBox();
    if (!strip || strip.height > 300) return;
    const sash = await page.evaluate(() => {
      const groups = [...document.querySelectorAll(".dv-groupview")].map((g) => g.getBoundingClientRect());
      const strip = document.getElementById("panel-bearings").getBoundingClientRect();
      const sashes = [...document.querySelectorAll(".dv-sash")].map((s) => s.getBoundingClientRect()).filter((r) => r.width > r.height && Math.abs(r.top + r.height / 2 - strip.top) < 40 && r.left < strip.right && r.right > strip.left);
      void groups;
      const s = sashes[0];
      return s ? { x: s.left + s.width / 2, y: s.top + s.height / 2 } : undefined;
    });
    if (!sash) return;
    await page.mouse.move(sash.x, sash.y);
    await page.mouse.down();
    await page.mouse.move(sash.x, sash.y - 170, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };

  // Serial 2, the whole of it in the window; the bearing view under the map, given room.
  await page.selectOption("#plots", "serial-2");
  await page.waitForFunction(() => document.getElementById("plot-title")?.textContent === "Serial 2", null, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("#outline li[data-id='sensor-blue-one-bow-sonar']"));
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  await page.locator("#timebar .tc-end").focus();
  await page.keyboard.press("End");
  await showPanel(page, "bearings");
  await tallerStrip();
  await page.locator(`#outline li[data-id="sensor-blue-one-bow-sonar"]`).click();
  await page.waitForFunction(() => window.debriefTma.shown?.plot_id === "serial-2" && window.debriefTma.shown.sensor_id === "sensor-blue-one-bow-sonar", null, { timeout: 60000 });
  await view.locator(".tma-row").first().waitFor({ timeout: 60000 });

  // The list: every cut of the Bow sonar, only the rows in sight in the page (virtualised), of one
  // height whatever the font, so it scrolls by them.
  assert.match(await view.locator(".tma-sensor option:checked").innerText(), /^Bow sonar on BLUE ONE \(\d+ cuts\)$/);
  const total = Number(await list.getAttribute("aria-rowcount"));
  assert.ok(total > 300, `the Bow sonar's cuts listed: ${total}`);
  assert.ok((await rowsInPage()) < 60, `only the rows in sight are in the page: ${await rowsInPage()} of ${total}`);
  const spacer = await view.locator(".tma-spacer").evaluate((s) => s.offsetHeight);
  assert.equal(spacer, total * 22, "the list is as tall as all its rows");
  // The period offered: the cuts in the time window (the whole plot here), until the reader chooses.
  assert.match(await view.locator(".tma-period").innerText(), new RegExp(`^${total} cuts `));

  // Chosen from the keyboard: the first 60 cuts (Shift and the arrow keys), each read aloud as an option.
  await list.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 59; i++) await page.keyboard.press("Shift+ArrowDown");
  const period = await view.locator(".tma-period").innerText();
  assert.match(period, /^60 cuts 12:\d\d:\d\dZ–1\d:\d\d:\d\dZ$/);
  const active = view.locator(".tma-row.tma-active");
  assert.equal(await active.getAttribute("aria-posinset"), "60");
  assert.equal(await active.getAttribute("aria-selected"), "true");
  assert.match(await active.getAttribute("aria-label"), /^1\d:\d\d:\d\dZ, Bow sonar, \d{3}\.\d°$/);
  assert.equal(await list.getAttribute("aria-activedescendant"), await active.getAttribute("id"));
  // Scrolled with it: the rows near the 60th are in the page, the first are not.
  assert.equal(await view.locator('.tma-row[aria-posinset="1"]').count(), 0, "rows scrolled out of sight leave the page");
  await picture("tma-01-cut-list");

  // The first guess by form: 10,000 yd on the first cut's bearing, across it, 8 kn, in the analyst's units.
  await view.getByRole("button", { name: "Make solution…" }).click();
  const field = (name) => view.locator(`.tma-form input[name="${name}"]`);
  assert.equal(await field("range").inputValue(), "4.94 nmi");
  assert.equal(await field("speed").inputValue(), "8.0 kn");
  assert.match(await field("course").inputValue(), /^\d{3}\.\d$/);
  assert.equal(await field("contact").inputValue(), "Contact 1");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("name")), "range", "the keyboard goes to the range");
  // What each field means, said beneath it; a mistake said before anything is sent.
  await field("speed").fill("fast");
  assert.match(await view.locator("#tma-speed-means").innerText(), /^Type a speed/);
  await field("range").fill("5 nmi");
  assert.equal(await view.locator("#tma-range-means").innerText(), "Means 5.00 nmi.");
  // The analyst's guess, near where RED ONE was: its range on the first cut, its course and speed over the period.
  const [first, last] = await page.evaluate(() => {
    const rows = window.debriefTma.chosenCuts();
    return [rows[0], rows[rows.length - 1]];
  });
  const [red0, red1] = [redOneAt(first.time), redOneAt(last.time)];
  const run = between(red0, red1);
  const hours = (Date.parse(last.time) - Date.parse(first.time)) / 3600000;
  await field("range").fill(`${(between(first.origin, red0).metres / 1852).toFixed(2)} nmi`);
  await field("course").fill(run.bearing.toFixed(1));
  await field("speed").fill(`${(run.metres / 1852 / hours).toFixed(1)} kn`);
  await picture("tma-02-first-guess");
  let before = await steps();
  await view.getByRole("button", { name: "Make solution", exact: true }).click();
  await stepAdded(before);
  assert.match(await latest(), /^Contact 1 solution made: 60 Bow sonar cuts 12:\d\d:\d\dZ–1\d:\d\d:\d\dZ$/);
  await view.locator(".tma-rms").waitFor();
  assert.match(await rms(), /^RMS \d+\.\d° over 60 cuts$/);
  const made = await residuals();
  assert.equal(made.rows.length, 60);
  assert.equal(await view.locator(".tma-form").isHidden(), true, "the form closes once the solution is made");
  // Selected, in the Outline with its TMA tag, and the view's list now its cuts with their residuals.
  assert.deepEqual(await page.$$eval("#outline li.selected .name", (r) => r.map((e) => e.textContent)), ["Contact 1 solution"]);
  assert.equal(await page.locator('#outline li.selected .tag').innerText(), "TMA");
  assert.match(await view.locator(".tma-row").first().getAttribute("aria-label"), /residual [+−]\d+\.\d°/);
  assert.equal(await view.locator(".tma-canvas").isVisible(), true);
  assert.match(await view.locator(".tma-canvas").getAttribute("aria-label"), /^Bearings and residuals of Contact 1 solution over time: RMS/);

  // Near the truth: the bearings lie close to the calculated line.
  assert.ok(made.rms < 5, `a guess near RED ONE fits its bearings: RMS ${made.rms}°`);
  // Dragged on the map by its end (a shear, its start held): the residuals and RMS follow the drag.
  await zoomToSelection();
  await handle("end").waitFor();
  const rmsBefore = await rms();
  const timingsBefore = await page.evaluate(() => window.debriefTma.timings.length);
  const at = await centreOf(handle("end"));
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 30, at.y - 60, { steps: 12 });
  await page.waitForFunction(() => document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 10000 });
  const during = await rms();
  assert.notEqual(during.replace(" (while dragging)", ""), rmsBefore, "the RMS follows the drag");
  await picture("tma-03-drag");
  before = await steps();
  await page.mouse.up();
  await stepAdded(before);
  assert.match(await latest(), /^Contact 1 solution \(DR\) sheared: \d{3}\.\d°T \d+\.\d kn$/);
  await page.waitForFunction(() => !document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 30000 });
  // Measured, against the drag budget (NFR-04): each live recompute of 60 cuts within a frame.
  const live = await page.evaluate((from) => window.debriefTma.timings.slice(from), timingsBefore);
  assert.ok(live.length >= 3, `the residuals were worked out again as the drag went: ${live.length} times`);
  const median = [...live].sort((a, b) => a - b)[Math.floor(live.length / 2)];
  console.log(`TMA drag: ${live.length} live recomputes of 60 cuts, median ${median.toFixed(2)} ms, worst ${Math.max(...live).toFixed(2)} ms`);
  assert.ok(median < 16, `within a frame: ${median} ms`);
  // Exact from Python once saved: the view's residuals are Python's again.
  const after = await residuals();
  assert.notDeepEqual(after.rms, made.rms);

  // A wild cut left out of the RMS from the keyboard (Space), one step; Undo counts it again.
  await list.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  before = await steps();
  await page.keyboard.press(" ");
  await stepAdded(before);
  assert.match(await latest(), /^Contact 1 solution: cut at 12:\d\d:\d\dZ left out of the RMS$/);
  await page.waitForFunction(() => window.debriefTma.residuals?.excluded === 1);
  assert.match(await rms(), /^RMS \d+\.\d° over 59 cuts; 1 cut left out$/);
  assert.match(await view.locator('.tma-row[aria-posinset="2"]').getAttribute("aria-label"), /left out of the RMS/);
  await picture("tma-06-excluded");
  await undo();
  await page.waitForFunction(() => window.debriefTma.residuals?.excluded === 0);
  assert.match(await rms(), /over 60 cuts$/);

  // Split into legs at a cut picked in the view (the 30th, from the keyboard): one step, still one track.
  await list.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 29; i++) await page.keyboard.press("ArrowDown");
  const split = view.locator(".tma-split");
  const splitAt = (await split.innerText()).replace("Split into legs at ", "");
  before = await steps();
  await split.click();
  await stepAdded(before);
  assert.equal(await latest(), `Contact 1 solution split into legs at ${splitAt}`);
  await page.waitForFunction(() => window.debriefTma.residuals?.rows.some((r) => r.leg === 2));
  // This leg, on the map, with current time in the second leg: only it moves, the first stays.
  await page.waitForTimeout(500);
  const legButton = mapFrame.getByRole("button", { name: "This leg", exact: true });
  await legButton.waitFor();
  const rows = (await residuals()).rows;
  const inLeg2 = rows.find((r) => r.leg === 2);
  await view.locator(`.tma-row[data-cut="${inLeg2.id}"]`).waitFor().catch(() => {});
  // Current time into leg 2: a cut of it chosen, Enter.
  await list.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await legButton.click();
  await zoomToSelection();
  assert.match(await handle("end").getAttribute("aria-label"), /^Contact 1 solution, leg 2 of 2: shear from the end/);
  const leg1Before = rows.filter((r) => r.leg === 1).map((r) => r.calculated);
  const end2 = await centreOf(handle("end"));
  await page.mouse.move(end2.x, end2.y);
  await page.mouse.down();
  await page.mouse.move(end2.x - 40, end2.y + 30, { steps: 10 });
  await page.waitForFunction(() => document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 10000 });
  await picture("tma-05-two-legs");
  before = await steps();
  await page.mouse.up();
  await stepAdded(before);
  assert.match(await latest(), /^Contact 1 solution \(DR\) part sheared: /);
  await page.waitForFunction(() => !document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 30000 });
  const legsAfter = (await residuals()).rows;
  const leg1After = legsAfter.filter((r) => r.leg === 1).map((r) => r.calculated);
  leg1After.forEach((c, i) => assert.ok(Math.abs(c - leg1Before[i]) < 1e-6, "the first leg stays where it was"));
  assert.ok(legsAfter.filter((r) => r.leg === 2).some((r, i) => Math.abs(r.calculated - rows.filter((q) => q.leg === 2)[i].calculated) > 0.01), "the second leg moved");

  // A second solution by two clicks on the map: on the first cut's line, then on the last's.
  await view.locator(".tma-solution").selectOption("");
  await page.waitForFunction(() => !window.debriefTma.shown?.solution_id && window.debriefTma.shown?.cuts?.length > 0);
  await view.locator(".tma-row").first().waitFor();
  await list.focus();
  await page.keyboard.press("End");
  for (let i = 0; i < 30; i++) await page.keyboard.press("Shift+ArrowUp");
  await view.getByRole("button", { name: "Make solution…" }).click();
  await view.getByRole("button", { name: "Two clicks on the map instead" }).click();
  await page.waitForFunction(() => document.querySelector(".frame-map").contentDocument.querySelector(".tma-guessing"));
  const chosen = await page.evaluate(() => {
    const rows = window.debriefTma.chosenCuts();
    return [rows[0], rows[rows.length - 1]];
  });
  const frame = await page.locator(".frame-map").boundingBox();
  const clickOn = async (cut, metres) => {
    const [lon, lat] = cut.origin;
    // A point along its bearing, as the map draws its line.
    const point = await mapFrame.locator("#map").evaluate((_, args) => {
      const [lon0, lat0, bearing, d] = args;
      const R = 6371000;
      const b = (bearing * Math.PI) / 180;
      const lat1 = (lat0 * Math.PI) / 180;
      const lon1 = (lon0 * Math.PI) / 180;
      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d / R) + Math.cos(lat1) * Math.sin(d / R) * Math.cos(b));
      const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d / R) * Math.cos(lat1), Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2));
      return window.debriefPoint((lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI);
    }, [lon, lat, cut.resolved === "ambiguous_bearing" ? cut.ambiguous_bearing : cut.bearing, metres]);
    await page.mouse.click(frame.x + point.x, frame.y + point.y);
  };
  // On each line where RED ONE was then: a guess near the truth.
  const reach = (cut) => between(cut.origin, redOneAt(cut.time)).metres;
  await clickOn(chosen[0], reach(chosen[0]));
  await mapFrame.locator(".tma-guess-point").first().waitFor();
  await picture("tma-04-two-clicks");
  before = await steps();
  await clickOn(chosen[1], reach(chosen[1]));
  await stepAdded(before);
  assert.match(await latest(), /^Contact 2 solution made: 31 Bow sonar cuts /);
  await view.locator(".tma-rms").waitFor();
  assert.match(await rms(), /^RMS \d+\.\d° over 31 cuts$/);
  assert.ok((await residuals()).rms < 10, "two clicks where RED ONE was fit its bearings, roughly");

  // The towed array's ambiguous cuts: the next one found from the keyboard (Alt+Down), a side kept from the view.
  await view.locator(".tma-solution").selectOption("");
  await page.waitForFunction(() => !window.debriefTma.shown?.solution_id && window.debriefTma.shown?.cuts?.length > 0);
  await view.locator(".tma-sensor").selectOption("sensor-blue-one-towed-array");
  await page.waitForFunction(() => window.debriefTma.shown?.sensor_id === "sensor-blue-one-towed-array" && window.debriefTma.shown.cuts?.length > 0);
  await list.focus();
  await page.keyboard.press("Alt+ArrowDown");
  const keepFirst = view.locator(".tma-first");
  await keepFirst.waitFor();
  assert.match(await keepFirst.innerText(), /^Keep \d{3}\.\d° \((port|starboard)\)$/);
  before = await steps();
  await keepFirst.click();
  await stepAdded(before);
  assert.match(await latest(), /kept on Towed array cut at /);

  // A legacy plot's TMA solution imported as a solution, its residuals shown.
  // tma.dpf: made up, unclassified (python/debrief-io/tests/data/README.md): a relative leg and an absolute one.
  await page.locator("#file").setInputFiles(path.resolve("../python/debrief-io/tests/data/tma.dpf"));
  await page.locator(".omitted-panel h2", { hasText: "tma.dpf: imported" }).waitFor({ timeout: 60000 });
  const panelText = await page.locator(".omitted-panel").first().innerText();
  assert.match(panelText, /TMA_0900/, "the import says what became of the legacy solution");
  await page.locator(".side-bar button", { hasText: "Close" }).click();
  await page.locator('#outline li[data-id] .name', { hasText: "TMA_0900" }).first().click();
  await showPanel(page, "bearings");
  await view.locator(".tma-rms").waitFor({ timeout: 60000 });
  assert.match(await rms(), /^RMS \d+\.\d° over 10 cuts$/);
  assert.ok((await residuals()).rms < 0.5, "the imported solution lies on its cuts");
  assert.equal(await page.locator("#outline li.selected .tag").innerText(), "TMA");
  await mapFrame.getByRole("button", { name: "Zoom to the selection", exact: true }).click();
  await picture("tma-07-imported");
}
