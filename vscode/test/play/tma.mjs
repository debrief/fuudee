// TMA in the playground (CAP-21; product owner, 24 Oct 2026), played as an analyst would on the
// sample's serial 2, where BLUE ONE zigzags astern of RED ONE to resolve range:
// - the Bow sonar's cuts in the bearing view's list, virtualised (only the rows in sight are in
//   the page), chosen by the keyboard as a period;
// - a solution made from them by the first guess's form, its defaults in the analyst's units,
//   one step; its residuals and RMS shown, after legacy's Stacked Dots;
// - dragged on the map by its end (a shear): the residuals and the RMS follow the drag, within the
//   drag budget (NFR-04), measured; one step on letting go, exact again from Python;
// - a wild cut left out of the RMS by the keyboard, one step, and counted again by Undo;
// - split into legs at a cut picked in the view, one step; each leg picked by clicking it on the
//   map (This leg) and dragged on its own, the other leg staying where it was, either way;
// - a second solution made by two clicks on the map, on the first cut's line and the last's;
// - the next ambiguous cut found from the keyboard, and a side kept from the view; a solution of
//   the towed array's cuts, each unresolved cut's other bearing drawn faint and not counted;
// - a legacy plot's TMA solution imported as a solution, its residuals shown.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mapPlaced, resizeTo, showPanel } from "./dock.mjs";

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
  // The map at rest: the end handle where it was a tenth of a second ago (polled, not a fixed wait).
  const settled = async () => {
    let last;
    for (let i = 0; i < 60; i++) {
      const b = await handle("end").boundingBox().catch(() => null);
      const now = b ? `${Math.round(b.x)},${Math.round(b.y)}` : undefined;
      if (now && now === last) return;
      last = now;
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  // Frames of a drag: at least three since n, then one more after a nudge, so the last is drawn
  // where the pointer stopped (frames come with the map's previews, not one per mouse step).
  const dragFrames = async (n, x, y) => {
    await page.waitForFunction((k) => window.debriefTma.errorAxes.length >= k + 3, n, { timeout: 10000 });
    const k = await page.evaluate(() => window.debriefTma.errorAxes.length);
    await page.mouse.move(x + 1, y, { steps: 2 });
    await page.waitForFunction((m) => window.debriefTma.errorAxes.length > m, k, { timeout: 10000 });
    return page.evaluate((m) => window.debriefTma.errorAxes.slice(m), n);
  };
  const zoomToSelection = async () => {
    await mapFrame.getByRole("button", { name: "Zoom to the selection", exact: true }).click();
    await settled();
    // One step out, so the ends' handles are clear of the map's edges.
    await mapFrame.locator(".leaflet-control-zoom-out").click();
    await settled();
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
  // The default layout (product owner, 25 Oct 2026): the right-hand column split, the Bearings view
  // on top with most of the height, the walkthroughs beneath it, both in sight.
  // The playground's earlier steps leave every panel on the left; put back so at the end.
  const rearranged = (await page.evaluate(() => window.debriefLayout().groups)).every((g) => g.place === "left" || g.panels.includes("map"));
  if (await page.locator("#reset-layout").isVisible()) {
    await page.locator("#reset-layout").click();
    await mapPlaced(page);
  }
  const groups = (await page.evaluate(() => window.debriefLayout().groups));
  assert.deepEqual(groups.filter((g) => g.place === "right").map((g) => [g.panels, g.active]), [[["panel-bearings"], "panel-bearings"], [["panel-tour"], "panel-tour"]], "Bearings and the walkthroughs, each in front of its own group");
  assert.ok(!groups.some((g) => g.place === "centre" && g.panels.includes("panel-bearings")), "no longer under the map");
  const placed = await page.evaluate(() => {
    const box = (e) => e.getBoundingClientRect();
    const group = (id) => box(document.querySelector(`.dv-tab[data-panel="${id}"]`).closest(".dv-groupview"));
    const map = box(document.getElementById("main"));
    const [bearings, tour] = [group("panel-bearings"), group("panel-tour")];
    const strip = group("panel-timeline");
    return { map: { right: map.right, top: map.top }, bearings: { x: bearings.x, right: bearings.right, top: bearings.top, height: bearings.height }, tour: { top: tour.top, bottom: tour.bottom, height: tour.height }, stripBottom: strip.bottom, width: innerWidth };
  });
  assert.ok(placed.bearings.x >= placed.map.right - 1, `right of the map: ${JSON.stringify(placed)}`);
  assert.ok(Math.abs(placed.bearings.right - placed.width) <= 1, "at the window's right edge");
  assert.ok(placed.bearings.top <= placed.map.top + 1 && placed.tour.bottom >= placed.stripBottom - 1, `the column beside the map and the strip under it: ${JSON.stringify(placed)}`);
  assert.ok(placed.tour.top >= placed.bearings.top + placed.bearings.height - 1 && placed.bearings.height > placed.tour.height, `Bearings on top with most of the height: ${JSON.stringify(placed)}`);
  // Serial 2, the whole of it in the window.
  await page.selectOption("#plots", "serial-2");
  await page.waitForFunction(() => document.getElementById("plot-title")?.textContent === "Serial 2", null, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("#outline li[data-id='sensor-blue-one-bow-sonar']"));
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  await page.locator("#timebar .tc-end").focus();
  await page.keyboard.press("End");
  await showPanel(page, "bearings");
  await page.locator(`#outline li[data-id="sensor-blue-one-bow-sonar"]`).click();
  await page.waitForFunction(() => window.debriefTma.shown?.plot_id === "serial-2" && window.debriefTma.shown.sensor_id === "sensor-blue-one-bow-sonar", null, { timeout: 60000 });
  await view.locator(".tma-row").first().waitFor({ timeout: 60000 });

  // The list: every cut of the Bow sonar, only the rows in sight in the page (virtualised), of one
  // height whatever the font, so it scrolls by them.
  assert.match(await view.locator(".tma-sensor option:checked").innerText(), /^Bow sonar on BLUE ONE \(\d+ cuts\)$/);
  // Each option says its place and the list's size (aria-posinset, aria-setsize); the listbox no rowcount.
  assert.equal(await list.getAttribute("aria-rowcount"), null);
  const total = Number(await view.locator(".tma-row").first().getAttribute("aria-setsize"));
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
  // One sensor listed: the sensor is not said on every row.
  assert.match(await active.getAttribute("aria-label"), /^1\d:\d\d:\d\dZ, \d{3}\.\d°$/);
  assert.equal(await list.getAttribute("aria-activedescendant"), await active.getAttribute("id"));
  // Scrolled with it: the rows near the 60th are in the page, the first are not.
  assert.equal(await view.locator('.tma-row[aria-posinset="1"]').count(), 0, "rows scrolled out of sight leave the page");
  await picture("tma-01-cut-list");
  // Scrolled away from the cut chosen, it stays in the page, so the active descendant is still there.
  await list.evaluate((l) => (l.scrollTop = l.scrollHeight));
  await page.waitForFunction(() => document.querySelector(`#bearings .tma-row[aria-posinset="${document.querySelector("#bearings .tma-row:last-child")?.getAttribute("aria-setsize")}"]`));
  const descendant = await list.getAttribute("aria-activedescendant");
  assert.equal(await view.locator(`#${descendant}`).getAttribute("aria-posinset"), "60", "the active descendant is in the page");
  await list.evaluate((l) => (l.scrollTop = 0));

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
  // The analyst's guess as legacy's tutorial starts a leg: its start pinned on the first bearing,
  // where RED ONE was; its course 30° out and its speed right, so the errors ramp away with time.
  const [first, last] = await page.evaluate(() => {
    const rows = window.debriefTma.chosenCuts();
    return [rows[0], rows[rows.length - 1]];
  });
  const [red0, red1] = [redOneAt(first.time), redOneAt(last.time)];
  const run = between(red0, red1);
  const hours = (Date.parse(last.time) - Date.parse(first.time)) / 3600000;
  await field("range").fill(`${(between(first.origin, red0).metres / 1852).toFixed(2)} nmi`);
  await field("course").fill(((run.bearing + 30) % 360).toFixed(1));
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
  const canvas = view.locator(".tma-canvas");
  assert.equal(await canvas.isVisible(), true);
  assert.match(await canvas.getAttribute("aria-label"), /^Bearings and residuals of Contact 1 solution, time upward from .* panes Bearing, Error: RMS/);
  // Compact (product owner, 25 Oct 2026): the solution, the panes, Hold scale, Reset zoom and ⋯ in
  // one row; the cue and the RMS one line; the cut list closed, so the plot takes the height.
  const cutsToggle = view.locator(".tma-cuts-toggle");
  await page.waitForFunction(() => window.debriefLayout().groups.length && document.querySelector("#bearings .tma-cuts-toggle")?.getAttribute("aria-expanded") === "false");
  assert.match(await cutsToggle.innerText(), /^▸ Cuts \(60\) and their residuals$/);
  assert.equal(await list.isVisible(), false, "the cut list closed");
  const row = await view.locator(".tma-tools").evaluate((t) => [...t.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => { const b = c.getBoundingClientRect(); return Math.round(b.top + b.height / 2); }));
  const statusLine = await view.locator(".tma-statusline").evaluate((l) => [...l.children].filter((c) => c.getBoundingClientRect().height > 0).map((c) => { const b = c.getBoundingClientRect(); return Math.round(b.top + b.height / 2); }));
  // The column right of the map widened while the solution is open: two panes of 160 px or more.
  await page.waitForFunction(() => Object.values(window.debriefTma.plotState.boxes ?? {}).every((b) => b.w >= 160) && Object.keys(window.debriefTma.plotState.boxes).length === 2, null, { timeout: 10000 });
  const widened = await page.evaluate(() => ({ column: document.getElementById("panel-bearings").getBoundingClientRect().width, map: document.getElementById("main").getBoundingClientRect().width, window: innerWidth }));
  assert.ok(widened.column >= widened.window * 0.36, `the column widened: ${JSON.stringify(widened)}`);
  const canvasBox = await canvas.boundingBox();
  const panelBox = await page.locator("#panel-bearings").boundingBox();
  assert.ok(canvasBox.height >= 300, `the plot takes the panel's height: ${canvasBox.height}`);
  console.log(`Stacked Dots at ${widened.window} × ${page.viewportSize().height}: the plot ${Math.round(canvasBox.height)} px tall, panes ${Object.values((await page.evaluate(() => window.debriefTma.plotState.boxes))).map((b) => Math.round(b.w)).join(" and ")} px wide; the column ${Math.round(widened.column)} px, the map ${Math.round(widened.map)} px; toolbar centres at ${row.join(", ")}; status line at ${statusLine.join(", ")}`);
  const spread = (centres) => Math.max(...centres) - Math.min(...centres);
  assert.ok(spread(row) < 12, `the toolbar one row: centres at ${row}`);
  assert.ok(spread(statusLine) < 12, `the cue and the RMS one line: centres at ${statusLine}`);
  // Making the solution brought Bearings forward without hiding the walkthroughs beneath it (product owner, 25 Oct 2026).
  assert.equal(await page.locator('.dv-tab[data-panel="panel-tour"]').getAttribute("aria-selected"), "true", "the walkthroughs still in front of their group");
  await page.waitForFunction(() => {
    const overlay = document.getElementById("panel-tour")?.closest(".dv-render-overlay");
    return !!overlay && getComputedStyle(overlay).visibility !== "hidden" && overlay.getBoundingClientRect().height > 100;
  });
  assert.ok(canvasBox.y + canvasBox.height <= panelBox.y + panelBox.height + 1, "the plot is not clipped");

  // As legacy laid it out: time up the left, the latest at the top; Bearing and Error side by side.
  const plot = () => page.evaluate(() => window.debriefTma.plotState);
  const pointOf = (id, pane = "error", time) => page.evaluate(([i, p, t]) => window.debriefTma.pointOf(i, p, t), [id, pane, time]);
  let state = await plot();
  assert.deepEqual(state.panes, { bearing: true, error: true, course: false }, "Bearing and Error by default");
  const firstDot = await pointOf(made.rows[0].id);
  const lastDot = await pointOf(made.rows[59].id);
  assert.ok(lastDot.y < firstDot.y, "time runs upward: the last cut above the first");
  const bearingDot = await pointOf(made.rows[0].id, "bearing");
  assert.ok(bearingDot.x < firstDot.x, "the Bearing pane left of the Error pane");
  assert.ok(Math.abs(bearingDot.y - firstDot.y) < 0.5, "the panes share the time axis");
  // The time span is the sensor's whole coverage shown, not only the solution's period.
  assert.ok(state.coverage > 100, `the Bow sonar's other cuts plotted: ${state.coverage}`);
  assert.ok(state.whole[1] > Date.parse(last.time) + 3600000, "the span runs on past the solution's period");
  // Early in the fit: the errors ramp away from the pinned start, and the pane is pink.
  const early = made.rows.slice(0, 2).map((r) => Math.abs(r.residual));
  const late = made.rows.slice(-5).map((r) => Math.abs(r.residual));
  assert.ok(Math.min(...late) > Math.max(...early) + 3, `a ramp: ${early.map((e) => e.toFixed(1))} to ${late.map((e) => e.toFixed(1))}`);
  assert.equal(state.cue.state, "beyond");
  assert.equal(await view.locator(".tma-cue").getAttribute("data-state"), "beyond");
  assert.match(await view.locator(".tma-cue").innerText(), /^✗ \d+ of 60 beyond 3\.0°, the largest \d+\.\d°$/);
  assert.equal(state.cue.counted, 60);
  assert.equal(state.cue.beyond, made.rows.filter((r) => Math.abs(r.residual) > 3).length, "the count beyond: every counted error past 3°");
  // Zoomed to the leg (a box over its errors, the Error pane's width), the ramp as legacy's tutorial shows it.
  const ramp = { top: await pointOf(made.rows[59].id), bottom: await pointOf(made.rows[0].id), pane: state.boxes.error, at: await canvas.boundingBox() };
  await page.mouse.move(ramp.at.x + ramp.pane.x + 1, ramp.at.y + ramp.top.y - 8);
  await page.mouse.down();
  await page.mouse.move(ramp.at.x + ramp.pane.x + ramp.pane.w - 1, ramp.at.y + ramp.bottom.y + 8, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => window.debriefTma.plotState.zoomed);
  await page.mouse.move(2, 2);
  await picture("stacked-dots-01-ramp-pink");
  await view.getByRole("button", { name: "Reset zoom" }).click();
  await page.waitForFunction(() => !window.debriefTma.plotState.zoomed);

  // The tutorial's next move: drag the leg's end (a shear, its start held) until the errors flatten.
  // Here, to where RED ONE was at the last cut. The Error axis fits the errors every frame, as
  // legacy's auto-resize did, so they fill the pane as they shrink; no dot is ever drawn at an edge.
  await zoomToSelection();
  await handle("end").waitFor();
  const rmsBefore = await rms();
  const timingsBefore = await page.evaluate(() => window.debriefTma.timings.length);
  const axesBefore = await page.evaluate(() => window.debriefTma.errorAxes.length);
  const at = await centreOf(handle("end"));
  const mapBox = await page.locator(".frame-map").boundingBox();
  // The handle sits a little beyond the leg's last fix: the fix, not the handle, to where RED ONE was.
  const [truth, endFix] = await mapFrame.locator("#map").evaluate((_, [lon, lat, id]) => {
    const fixes = window.debriefFixes(id);
    const last = fixes[fixes.length - 1];
    return [window.debriefPoint(lon, lat), window.debriefPoint(last[0], last[1])];
  }, [...red1, await page.evaluate(() => window.debriefTma.shown.solution_id)]);
  const to = { x: at.x + (truth.x - endFix.x), y: at.y + (truth.y - endFix.y) };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move((at.x + to.x) / 2, (at.y + to.y) / 2, { steps: 10 });
  await page.waitForFunction(() => document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 10000 });
  const during = await rms();
  assert.notEqual(during.replace(" (while dragging)", ""), rmsBefore, "the RMS follows the drag");
  await picture("tma-03-drag");
  await page.mouse.move(to.x, to.y, { steps: 20 });
  const fitted = await dragFrames(axesBefore, to.x, to.y);
  assert.deepEqual(fitted.filter((a) => a.outside), [], "no error outside the axis in any frame: none drawn at an edge");
  const widthOf = (a) => a.hi - a.lo;
  assert.ok(widthOf(fitted[fitted.length - 1]) < widthOf(fitted[0]) / 2, `the axis re-fitted as the errors shrank: ${widthOf(fitted[0]).toFixed(1)}° to ${widthOf(fitted[fitted.length - 1]).toFixed(1)}°`);
  assert.ok(new Set(fitted.map((a) => `${a.lo.toFixed(4)},${a.hi.toFixed(4)}`)).size > fitted.length / 2, "a new fit most frames");
  before = await steps();
  await page.mouse.up();
  await stepAdded(before);
  assert.match(await latest(), /^Contact 1 solution \(DR\) sheared: \d{3}\.\d°T \d+\.\d kn$/);
  await page.waitForFunction(() => !document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 30000 });
  // Measured, against the drag budget (NFR-04): each whole frame (residuals, list, plots) of 60 cuts within a frame.
  const live = await page.evaluate((from) => window.debriefTma.timings.slice(from), timingsBefore);
  assert.ok(live.length >= 3, `the residuals were worked out again as the drag went: ${live.length} times`);
  const median = [...live].sort((a, b) => a - b)[Math.floor(live.length / 2)];
  console.log(`TMA drag: ${live.length} frames of 60 cuts, median ${median.toFixed(2)} ms, worst ${Math.max(...live).toFixed(2)} ms`);
  assert.ok(median < 16, `within a frame: ${median} ms`);
  // Exact from Python once saved: the errors flat, about the sonar's noise (1.5° a cut).
  const after = await residuals();
  assert.notDeepEqual(after.rms, made.rms);
  console.log(`TMA fitted by the end's drag: RMS ${after.rms.toFixed(2)}°, largest ${Math.max(...after.rows.map((r) => Math.abs(r.residual ?? 0))).toFixed(2)}°`);
  assert.ok(after.rms < 2.5, `fitted: RMS ${after.rms}°`);
  // Fitted, at legacy's 3°: how many of the 60 are beyond it, if any, and the largest.
  const fittedCue = await view.locator(".tma-cue").innerText();
  const beyond3 = after.rows.filter((r) => Math.abs(r.residual) > 3).length;
  assert.equal(fittedCue, beyond3 ? `✗ ${beyond3} of 60 beyond 3.0°, the largest ${Math.max(...after.rows.map((r) => Math.abs(r.residual))).toFixed(1)}°` : "✓ Every error within 3.0°");
  console.log(`Fitted at 3°: ${fittedCue}`);
  await page.mouse.move(2, 2);
  await picture("stacked-dots-08-fitted-beyond");
  // The analyst's cut-off for a 1.5° sonar, 5° (three of its deviations; legacy's default is 3°),
  // set in the view and kept with their settings: the Error pane green, said in words too.
  // Under ⋯, with the sensor and the key.
  const more = view.getByRole("button", { name: "More: the sensor, the cut-off and the key" });
  await more.click();
  assert.equal(await more.getAttribute("aria-expanded"), "true");
  const cutOff = view.locator(".tma-cutoff-input");
  assert.equal(await cutOff.inputValue(), "3");
  assert.equal(await cutOff.getAttribute("min"), "0.01", "the cut-off's limits the configuration's: 0.01° to 180°");
  await cutOff.fill("5");
  // Escape, from the field, closes ⋯ and the keyboard goes back to it; the cut-off set as the field is left.
  await page.keyboard.press("Escape");
  assert.equal(await view.locator(".tma-more").isVisible(), false);
  assert.equal(await more.getAttribute("aria-expanded"), "false");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("tma-more-button")), true, "the keyboard back on ⋯");
  await page.waitForFunction(() => window.debriefTma.plotState.cue?.state === "within", null, { timeout: 10000 });
  assert.match(await view.locator(".tma-cue").innerText(), /^✓ Every error within 5\.0°$/);
  state = await plot();
  assert.ok(state.axes.error[1] - state.axes.error[0] < 15, `auto-fitted to the small errors: ${state.axes.error}`);
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.move(2, 2);
  await picture("stacked-dots-02-fitted-green");
  await zoomToSelection();
  await page.mouse.move(2, 2);
  await picture("stacked-dots-05-layout");
  // At a laptop's sizes, the solution open: the plot's height and its panes' widths, measured.
  for (const [w, h, name] of [[1366, 768], [1280, 720, "stacked-dots-07-1280x720"]]) {
    await resizeTo(page, w, h);
    await page.waitForFunction(() => Object.values(window.debriefTma.plotState.boxes ?? {}).length === 2);
    const at = await page.evaluate(() => ({ plot: document.querySelector("#bearings .tma-canvas").getBoundingClientRect().height, panes: Object.values(window.debriefTma.plotState.boxes).map((b) => b.w), column: document.getElementById("panel-bearings").getBoundingClientRect().width, map: document.getElementById("main").getBoundingClientRect().width, tour: document.getElementById("panel-tour").closest(".dock-panel").getBoundingClientRect().height }));
    console.log(`Stacked Dots at ${w} × ${h}: the plot ${Math.round(at.plot)} px tall, panes ${at.panes.map(Math.round).join(" and ")} px wide; the column ${Math.round(at.column)} px, the map ${Math.round(at.map)} px; the walkthroughs ${Math.round(at.tour)} px tall`);
    assert.ok(at.plot >= 270 && at.panes.every((p) => p >= 160) && at.tour >= 150, `at ${w} × ${h}: ${JSON.stringify(at)}`);
    if (name) {
      await page.mouse.move(2, 2);
      await picture(name);
    }
  }
  await resizeTo(page, 1400, 820);

  // Hold scale: the Error axis stays as it is, and widens, never clamps, when an error falls outside.
  await view.getByRole("button", { name: "Hold scale" }).click();
  assert.equal(await view.getByRole("button", { name: "Hold scale" }).getAttribute("aria-pressed"), "true");
  const held = (await plot()).axes.error;
  const heldFrom = await page.evaluate(() => window.debriefTma.errorAxes.length);
  await settled();
  const end = await centreOf(handle("end"));
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(end.x + 6, end.y - 4, { steps: 3 });
  await page.waitForFunction(() => document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 10000 });
  await page.mouse.move(end.x + 70, end.y - 50, { steps: 20 });
  const holding = await dragFrames(heldFrom, end.x + 70, end.y - 50);
  assert.deepEqual(holding.filter((a) => a.outside), [], "held, still no error outside the axis");
  assert.ok(holding.every((a, i) => i === 0 || (a.lo <= holding[i - 1].lo && a.hi >= holding[i - 1].hi)), "held: the axis only ever widens");
  const widest = holding[holding.length - 1];
  assert.ok(widest.lo <= held[0] && widest.hi >= held[1] && (widest.lo < held[0] || widest.hi > held[1]), `widened past the held ${held} to ${widest.lo},${widest.hi}`);
  // Put back (Escape): nothing saved; the held scale stays held until let go.
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 30000 });
  await view.getByRole("button", { name: "Hold scale" }).click();
  assert.equal(await view.getByRole("button", { name: "Hold scale" }).getAttribute("aria-pressed"), "false");

  // Box zoom: a box dragged in the Error pane zooms time to its height and errors to its width;
  // kept while the solution is dragged; Reset zoom, a double-click, or 0 undoes it.
  const canvasAt = await canvas.boundingBox();
  const box = await page.evaluate(() => {
    const t = window.debriefTma;
    const rows = t.residuals.rows;
    const a = t.pointOf(rows[10].id);
    const b = t.pointOf(rows[40].id);
    return { a, b };
  });
  assert.ok(box.a && box.b, "the dots to box are drawn");
  const left = Math.min(box.a.x, box.b.x) - 30;
  const right = Math.max(box.a.x, box.b.x) + 30;
  await page.mouse.move(canvasAt.x + left, canvasAt.y + box.b.y - 4);
  await page.mouse.down();
  await page.mouse.move(canvasAt.x + right, canvasAt.y + box.a.y + 4, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => window.debriefTma.plotState.zoomed);
  state = await plot();
  assert.ok(state.span[1] - state.span[0] < (state.whole[1] - state.whole[0]) / 3, "time zoomed to the box");
  assert.ok(state.zoom.values.error, "the Error pane's values zoomed to the box");
  assert.equal(await view.getByRole("button", { name: "Reset zoom" }).isEnabled(), true);
  await picture("stacked-dots-03-box-zoom");
  // Kept while the solution is dragged.
  const zoomedSpan = state.span;
  await settled();
  const again = await centreOf(handle("end"));
  await page.mouse.move(again.x, again.y);
  await page.mouse.down();
  await page.mouse.move(again.x + 15, again.y - 10, { steps: 5 });
  await page.waitForFunction(() => document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 10000 });
  assert.deepEqual((await plot()).span, zoomedSpan, "the zoom stays while dragging");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 30000 });
  await view.getByRole("button", { name: "Reset zoom" }).click();
  await page.waitForFunction(() => !window.debriefTma.plotState.zoomed);
  // From the keyboard: + zooms time about the cut chosen, 0 resets; a double-click resets too.
  await canvas.focus();
  await page.keyboard.press("+");
  await page.waitForFunction(() => window.debriefTma.plotState.zoomed);
  await page.keyboard.press("0");
  await page.waitForFunction(() => !window.debriefTma.plotState.zoomed);
  await page.keyboard.press("]");
  await page.waitForFunction(() => !!window.debriefTma.plotState.zoom.values.error);
  await canvas.dblclick({ position: { x: 4, y: 4 } });
  await page.waitForFunction(() => !window.debriefTma.plotState.zoomed);

  // A dot clicked selects its cut, in the Outline and on the map, and moves current time to it;
  // the solution stays shown, the list's row chosen.
  const shownSolution = await page.evaluate(() => window.debriefTma.shown.solution_id);
  // A cut whose dot has room beside it: 5 px to one side, no other dot as near.
  const allRows = (await residuals()).rows;
  const dots = await page.evaluate((ids) => ids.map((id) => window.debriefTma.pointOf(id, "error")), allRows.map((r) => r.id));
  const roomy = (i, dx) => dots[i] && dots.every((d, j) => j === i || !d || Math.hypot(d.x - dots[i].x - dx, d.y - dots[i].y) > 6);
  let pick = -1;
  let aside = 0;
  for (let i = 15; i < 45 && pick < 0; i++) {
    for (const dx of [5, -5]) if (pick < 0 && roomy(i, dx)) [pick, aside] = [i, dx];
  }
  assert.ok(pick >= 0, "a dot with room beside it");
  const target = allRows[pick];
  const dot = dots[pick];
  const canvasNow = await canvas.boundingBox();
  await page.mouse.move(canvasNow.x + dot.x, canvasNow.y + dot.y);
  assert.match(await view.locator(".tma-readout").innerText(), /^\d\d:\d\d:\d\dZ · Error [+−]\d+\.\d°$/, "the readout says the time and value at the pointer");
  // Clicked a little beside it, as a hand does: within the dot's reach (7 px), still its cut.
  await page.mouse.click(canvasNow.x + dot.x + aside, canvasNow.y + dot.y);
  await page.waitForFunction((id) => window.debriefSelection().selection.join() === id, target.id);
  assert.equal(Date.parse((await page.evaluate(() => window.debriefSelection())).current), Date.parse(target.time), "current time to the cut");
  assert.equal(await page.evaluate(() => window.debriefTma.shown.solution_id), shownSolution, "still the solution shown");
  assert.equal(await view.locator(".tma-row.tma-active").getAttribute("aria-posinset"), String(pick + 1), "its row chosen in the list");
  await page.locator("#sensor-group").waitFor(); // a cut selected: the Outline's sensor actions shown
  // A cut of the sensor's outside the solution, hidden on the map: not drawn in the plot either.
  const coverageBefore = (await plot()).coverage;
  const outside = await page.evaluate(() => window.debriefTma.coverage.rows.at(-1).id);
  const outsideDot = await pointOf(outside, "bearing");
  assert.ok(outsideDot, "a cut outside the solution drawn");
  await page.mouse.click(canvasNow.x + outsideDot.x, canvasNow.y + outsideDot.y);
  await page.waitForFunction((id) => window.debriefSelection().selection.join() === id, outside);
  before = await steps();
  await page.evaluate(() => document.getElementById("hide").click());
  await stepAdded(before);
  await page.waitForFunction((n) => window.debriefTma.plotState.coverage === n - 1, coverageBefore, { timeout: 10000 });
  assert.equal(await pointOf(outside, "bearing"), undefined, "hidden: not drawn");
  await undo();
  await page.waitForFunction((n) => window.debriefTma.plotState.coverage === n, coverageBefore, { timeout: 10000 });

  // The panes: Course/Speed shown (ownship's course, the solution's course and speed), remembered
  // in this browser; one pane at least always.
  const paneButton = (name) => view.locator(".tma-pane", { hasText: name });
  await paneButton("Course/Speed").click();
  await page.waitForFunction(() => window.debriefTma.plotState.panes.course);
  assert.equal(await paneButton("Course/Speed").getAttribute("aria-pressed"), "true");
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("debrief.play.bearings"))).panes, { bearing: true, error: true, course: true });
  state = await plot();
  assert.ok(state.axes.course && state.speed, "a course axis, and speed on its own");
  assert.ok((await page.evaluate(() => window.debriefTma.shown.ownship?.[0]?.name)) === "BLUE ONE", "ownship's courses");
  await page.mouse.move(2, 2);
  await picture("stacked-dots-04-three-panes");
  // A click on the solution's course selects the solution's fix: the solution, current time to the fix.
  const solutionNow = shownSolution;
  const fixTime = (await page.evaluate(() => window.debriefTma.shown.solutions.find((s) => s.id === window.debriefTma.shown.solution_id).times))[45];
  const fix = await pointOf(solutionNow, "course", fixTime);
  const canvas3 = await canvas.boundingBox();
  await page.mouse.click(canvas3.x + fix.x, canvas3.y + fix.y);
  await page.waitForFunction(([id, t]) => window.debriefSelection().selection.join() === id && Date.parse(window.debriefSelection().current) === Date.parse(t), [solutionNow, fixTime]);
  // Bearing and Error off: Course/Speed alone, which then stays.
  await paneButton("Bearing").click();
  await paneButton("Error").click();
  await page.waitForFunction(() => JSON.stringify(window.debriefTma.plotState.panes) === JSON.stringify({ bearing: false, error: false, course: true }));
  await paneButton("Course/Speed").click();
  assert.deepEqual((await plot()).panes, { bearing: false, error: false, course: true }, "the last pane stays shown");
  await paneButton("Bearing").click();
  await paneButton("Error").click();
  await paneButton("Course/Speed").click();
  await page.waitForFunction(() => JSON.stringify(window.debriefTma.plotState.panes) === JSON.stringify({ bearing: true, error: true, course: false }));

  // The keyboard in the plot, said in the live region as well as drawn in the readout (the panel's M4).
  const said = () => view.locator(".tma-status").innerText();
  await canvas.focus();
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(() => /Bearing \d{3}\.\d°/.test(document.querySelector("#bearings .tma-status").textContent));
  const sayFirst = await said();
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction((was) => document.querySelector("#bearings .tma-status").textContent !== was, sayFirst);
  assert.match(await said(), /Bearing \d{3}\.\d°, Error [+−]\d+\.\d°/, "the cut chosen said");
  await page.keyboard.press("+");
  await page.waitForFunction(() => document.querySelector("#bearings .tma-status").textContent.startsWith("Zoomed: "));
  await page.keyboard.press("0");
  await page.waitForFunction(() => document.querySelector("#bearings .tma-status").textContent.startsWith("Zoom reset"));
  // The list closed, the cut chosen's buttons still in sight (the panel's M3); and keys for them in the plot.
  assert.equal(await list.isVisible(), false);
  assert.equal(await view.locator(".tma-exclude").isVisible(), true, "Leave out in sight with the list closed");
  assert.equal(await view.locator(".tma-split").isVisible(), true, "Split in sight with the list closed");
  await canvas.focus();
  before = await steps();
  await page.keyboard.press("Delete");
  await stepAdded(before);
  assert.match(await latest(), /^Contact 1 solution: cut at 12:\d\d:\d\dZ left out of the RMS$/);
  await page.waitForFunction(() => window.debriefTma.residuals?.excluded === 1);
  await undo();
  await page.waitForFunction(() => window.debriefTma.residuals?.excluded === 0);
  await canvas.focus();
  before = await steps();
  await page.keyboard.press("s");
  await stepAdded(before);
  assert.match(await latest(), /^Contact 1 solution split into legs at 12:\d\d:\d\dZ$/);
  await undo();
  await page.waitForFunction(() => !window.debriefTma.residuals?.rows.some((r) => r.leg === 2));

  // The cut list opened, beneath the plot, remembered in this browser; the keyboard in it.
  await cutsToggle.click();
  assert.equal(await cutsToggle.getAttribute("aria-expanded"), "true");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("tma-list")), true, "the keyboard in the list");
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("debrief.play.bearings"))).cuts, true);
  // The plot's box shrinks as the list opens; its canvas is drawn to the new size in the next frame
  // (a ResizeObserver's), so until then it still reaches over the list, clipped: polled, not read the instant.
  const boxes = () =>
    page.evaluate(() => {
      const box = (s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
      };
      return { plot: box("#bearings .tma-plot"), canvas: box("#bearings .tma-canvas"), list: box("#bearings .tma-list") };
    });
  await page
    .waitForFunction(() => {
      const [p, c, l] = [".tma-plot", ".tma-canvas", ".tma-list"].map((s) => document.querySelector(`#bearings ${s}`).getBoundingClientRect());
      return Math.abs(c.bottom - p.bottom) <= 1 && l.height > 0 && l.top >= p.bottom - 1;
    }, null, { timeout: 10000 })
    .catch(() => undefined);
  const opened = await boxes();
  assert.ok(Math.abs(opened.canvas.bottom - opened.plot.bottom) <= 1 && opened.list.top >= opened.plot.bottom - 1, `the cut list beneath the plot, the plot drawn to its box: ${JSON.stringify(opened)}`);

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
  // The split offered only where Python allows it: not two cuts from the start.
  await list.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  assert.equal(await view.locator(".tma-split").isHidden(), true, "no split where a leg would have one fix");
  // This leg, on the map: the leg clicked is the one dragged; the other stays where it was.
  const legButton = mapFrame.getByRole("button", { name: "This leg", exact: true });
  await legButton.waitFor();
  await legButton.click();
  await zoomToSelection();
  const solutionId = await page.evaluate(() => window.debriefTma.shown.solution_id);
  const legOf = (n) => async () => (await residuals()).rows.filter((r) => r.leg === n).map((r) => r.calculated);
  const frameBox = await page.locator(".frame-map").boundingBox();
  /** A click on the solution's line, between two of its fixes: picks that fix's leg. */
  const clickLeg = async (index) => {
    const point = await mapFrame.locator("#map").evaluate((_, [id, i]) => {
      const fixes = window.debriefFixes(id);
      const [a, b] = [fixes[i], fixes[i + 1]];
      return window.debriefPoint((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }, [solutionId, index]);
    await page.mouse.click(frameBox.x + point.x, frameBox.y + point.y);
  };
  const dragEnd = async (dx, dy, name) => {
    await settled();
    const at = await centreOf(handle("end"));
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + dx, at.y + dy, { steps: 10 });
    await page.waitForFunction(() => document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 10000 });
    if (name) await picture(name);
    const count = await steps();
    await page.mouse.up();
    await stepAdded(count);
    await page.waitForFunction(() => !document.querySelector("#bearings .tma-rms")?.textContent?.includes("while dragging"), null, { timeout: 30000 });
  };
  const same = (a, b) => a.length === b.length && a.every((c, i) => Math.abs(c - b[i]) < 1e-6);
  // Leg 2, clicked: only it moves; leg 1 stays where it was.
  const rows = (await residuals()).rows;
  const leg1Index = rows.filter((r) => r.leg === 1).length;
  await clickLeg(leg1Index + 5);
  await page.waitForFunction(() => document.querySelector(".frame-map").contentDocument.querySelector('.track-handle[data-role="end"]')?.getAttribute("aria-label")?.includes("leg 2 of 2"));
  const leg1Before = await legOf(1)();
  const leg2Before = await legOf(2)();
  await dragEnd(-40, 30, "tma-05-two-legs");
  assert.match(await latest(), /^Contact 1 solution \(DR\) part sheared: /);
  assert.ok(same(await legOf(1)(), leg1Before), "the first leg stays where it was");
  assert.ok(!same(await legOf(2)(), leg2Before), "the second leg moved");
  // Leg 1, clicked: only it moves; leg 2, already fitted, stays where it is (product owner, 25 Oct 2026).
  await clickLeg(5);
  await page.waitForFunction(() => document.querySelector(".frame-map").contentDocument.querySelector('.track-handle[data-role="end"]')?.getAttribute("aria-label")?.includes("leg 1 of 2"));
  const leg2Fitted = await legOf(2)();
  const leg1Was = await legOf(1)();
  await dragEnd(25, -25);
  assert.ok(same(await legOf(2)(), leg2Fitted), "the later leg stays where it was");
  assert.ok(!same(await legOf(1)(), leg1Was), "the first leg moved");

  // A second solution by two clicks on the map: on the first cut's line, then on the last's.
  await view.locator(".tma-solution").selectOption("");
  // No solution open: the column back to its usual width, the map as wide as before.
  await page.waitForFunction(() => document.getElementById("panel-bearings").getBoundingClientRect().width < innerWidth * 0.25, null, { timeout: 10000 });
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
  // Chosen from the view's Solution list: none, the same solution again, the other, and back (the panel's H2).
  const solutionNamed = async (name, cuts) => {
    const id = await page.evaluate((n) => window.debriefTma.shown.solutions.find((s) => s.name.startsWith(n)).id, name);
    await view.locator(".tma-solution").selectOption(id);
    await page.waitForFunction(([i, c]) => window.debriefTma.shown?.solution_id === i && window.debriefTma.residuals?.rows.length === c, [id, cuts], { timeout: 30000 });
    assert.match(await rms(), new RegExp(`over ${cuts} cuts`));
  };
  await view.locator(".tma-solution").selectOption("");
  await page.waitForFunction(() => !window.debriefTma.shown?.solution_id);
  await solutionNamed("Contact 2 solution", 31);
  await solutionNamed("Contact 1 solution", 60);
  await solutionNamed("Contact 2 solution", 31);
  // The window resized while a solution is open: the column at its share of the new width, not the
  // pixels it had; no solution, the column back to its usual width and the map half the window or more (M1).
  const widths = () => page.evaluate(() => ({ column: document.querySelector('.dv-tab[data-panel="panel-bearings"]').closest(".dv-groupview").getBoundingClientRect().width, map: document.getElementById("main").getBoundingClientRect().width, window: innerWidth }));
  await resizeTo(page, 1700, 820);
  await page.waitForFunction(() => document.querySelector('.dv-tab[data-panel="panel-bearings"]').closest(".dv-groupview").getBoundingClientRect().width >= innerWidth * 0.38, null, { timeout: 10000 }).catch(() => undefined);
  let w = await widths();
  assert.ok(w.column >= w.window * 0.38 && w.map >= w.window * 0.4 - 3, `widened, resized: about 40% of the window still, the map 40% or more: ${JSON.stringify(w)}`);
  await resizeTo(page, 1366, 768);
  await view.locator(".tma-solution").selectOption("");
  await page.waitForFunction(() => document.querySelector('.dv-tab[data-panel="panel-bearings"]').closest(".dv-groupview").getBoundingClientRect().width < innerWidth * 0.25, null, { timeout: 10000 }).catch(() => undefined);
  w = await widths();
  assert.ok(w.column < w.window * 0.25 && w.map >= w.window * 0.5 - 3, `no solution, resized: the column back, the map half the window: ${JSON.stringify(w)}`);
  // A column the reader sized by its sash is theirs: dragged narrower while widened, it stays when the
  // solution closes (M9b); dragged before a solution opens, it is not widened (M9).
  const dragSash = async (dx) => {
    const sash = await page.evaluate(() => {
      const left = document.querySelector('.dv-tab[data-panel="panel-bearings"]').closest(".dv-groupview").getBoundingClientRect().left;
      const s = [...document.querySelectorAll(".dv-sash")].map((e) => e.getBoundingClientRect()).find((b) => b.height > 200 && Math.abs(b.left + b.width / 2 - left) < 6);
      return s && { x: s.left + s.width / 2, y: s.top + s.height / 2 };
    });
    assert.ok(sash, "the right-hand column's sash");
    await page.mouse.move(sash.x, sash.y);
    await page.mouse.down();
    await page.mouse.move(sash.x + dx / 2, sash.y, { steps: 4 });
    await page.mouse.move(sash.x + dx, sash.y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(100);
  };
  await solutionNamed("Contact 2 solution", 31);
  await page.waitForFunction(() => document.querySelector('.dv-tab[data-panel="panel-bearings"]').closest(".dv-groupview").getBoundingClientRect().width > innerWidth * 0.36, null, { timeout: 10000 });
  await dragSash(60);
  const sized = (await widths()).column;
  await view.locator(".tma-solution").selectOption("");
  await page.waitForFunction(() => !window.debriefTma.shown?.solution_id);
  await page.waitForTimeout(300);
  assert.ok(Math.abs((await widths()).column - sized) <= 3, `sized by the reader while widened, kept when the solution closed: ${sized} and ${(await widths()).column}`);
  await page.evaluate(() => document.getElementById("reset-layout").click());
  await mapPlaced(page);
  await page.waitForFunction(() => document.querySelector('.dv-tab[data-panel="panel-bearings"]').closest(".dv-groupview").getBoundingClientRect().width < innerWidth * 0.25, null, { timeout: 10000 });
  await dragSash(-40);
  const before9 = (await widths()).column;
  await solutionNamed("Contact 2 solution", 31);
  await page.waitForTimeout(300);
  assert.ok(Math.abs((await widths()).column - before9) <= 3, `sized by the reader before, not widened for the solution: ${before9} and ${(await widths()).column}`);
  await view.locator(".tma-solution").selectOption("");
  await page.evaluate(() => document.getElementById("reset-layout").click());
  await mapPlaced(page);
  await resizeTo(page, 1400, 820);
  await showPanel(page, "bearings");

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
  // A solution of the towed array's cuts: each unresolved cut's other bearing drawn faint, its
  // residual too, never counted (product owner, 25 Oct 2026).
  await page.waitForFunction(() => window.debriefTma.shown?.cuts?.length > 0);
  await list.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 40; i++) await page.keyboard.press("Shift+ArrowDown");
  await view.getByRole("button", { name: "Make solution…" }).click();
  before = await steps();
  await view.getByRole("button", { name: "Make solution", exact: true }).click();
  await stepAdded(before);
  await page.waitForFunction(() => window.debriefTma.residuals?.rows.some((r) => r.other_residual !== undefined));
  const towed = await residuals();
  const faint = towed.rows.filter((r) => r.nearer_side && r.other_residual !== undefined);
  assert.ok(faint.length > 0, "unresolved cuts give their other bearing's residual");
  const countedRows = towed.rows.filter((r) => r.residual !== undefined && !r.excluded && !r.hidden);
  const expectedRms = Math.sqrt(countedRows.reduce((sum, r) => sum + r.residual * r.residual, 0) / countedRows.length);
  assert.ok(Math.abs(towed.rms - expectedRms) < 1e-9, "the other bearings are not counted");
  assert.ok((await page.evaluate(() => window.debriefTma.faintDrawn)) > 0, "the other bearings are drawn faint");
  assert.match(await view.locator(".tma-canvas").getAttribute("aria-label"), /drawn faint, not counted/);
  await picture("tma-08-faint-other-bearing");
  // The Error axis fitted to the errors counted only; the other bearings beyond it said, not drawn at an edge.
  const axis = (await plot()).axes.error;
  const counted = towed.rows.filter((r) => r.residual !== undefined && r.residual !== null && !r.excluded && !r.hidden).map((r) => r.residual);
  assert.ok(axis[0] <= Math.min(...counted) && axis[1] >= Math.max(...counted), "every counted error on the axis");
  const offOthers = towed.rows.filter((r) => r.other_residual !== undefined && r.other_residual !== null && (r.other_residual < axis[0] || r.other_residual > axis[1])).length;
  assert.ok(offOthers > 0, "some other bearings off the axis fitted to the counted errors");
  assert.equal(await view.locator(".tma-offscale").innerText(), `${offOthers} other ${offOthers === 1 ? "bearing" : "bearings"} off scale`);
  assert.match(await view.locator(".tma-canvas").getAttribute("aria-label"), new RegExp(`${offOthers} other bearings? off scale\\.`));
  // Pictured with the cut list closed, the plot the panel's height; then open again, as it was.
  await cutsToggle.click();
  await page.waitForFunction(() => document.querySelector("#bearings .tma-cuts-toggle")?.getAttribute("aria-expanded") === "false");
  await page.mouse.move(2, 2);
  await picture("stacked-dots-09-other-side-off-scale");
  await cutsToggle.click();

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

  // The drag budget at scale (NFR-04): a solution of 600, 1,000 and 2,000 cuts dragged sixty
  // frames, all three panes shown, the sensor's coverage half as many cuts again before the
  // solution and ownship's course 2,000 fixes; each whole frame (residuals worked out, the list's
  // cells, the plot, the course and speed of the dragged fixes) timed. The median within a frame
  // (16.7 ms); the worst said, as a shared machine's pauses vary.
  await showPanel(page, "bearings");
  await view.locator(".tma-pane", { hasText: "Course/Speed" }).click();
  await page.waitForFunction(() => window.debriefTma.plotState.panes.course);
  for (const n of [600, 1000, 2000]) {
    const result = await page.evaluate(async (n) => {
      const R = 6371008.8;
      const rad = Math.PI / 180;
      const travel = ([lon, lat], bearing, d) => {
        const b = bearing * rad, p1 = lat * rad, l1 = lon * rad, dr = d / R;
        const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(b));
        const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
        return [l2 / rad, p2 / rad];
      };
      const coordinates = [[-3.9, 50.05]];
      for (let i = 1; i < n; i++) coordinates.push(travel(coordinates[i - 1], 200, 150));
      const t0 = Date.parse("2026-10-11T09:00:00.000Z");
      const times = Array.from({ length: n }, (_, i) => new Date(t0 + i * 30000).toISOString());
      const origin = [-4, 50];
      const rows = times.map((time, i) => ({ id: `c${i}`, sensor_id: "x", sensor: "Towed", colour: "#8a3ffc", time, bearing: 30 + i * 0.01, ...(i % 3 ? {} : { ambiguous_bearing: 150 }), origin, residual: 0, calculated: 30, measured: 30, leg: 1 }));
      const view = {
        plot_id: "p",
        sensors: [{ id: "x", name: "Towed", cuts: n, ambiguous: 0 }],
        sensor_id: "x",
        solutions: [{ id: "s", name: "Contact 9 solution", contact: "Contact 9", colour: "#e8710a", period: { start: times[0], end: times[n - 1] }, times, cuts: n, courses: times.map(() => 200), speeds: times.map(() => 5) }],
        solution_id: "s",
        residuals: { solution_id: "s", rows, counted: n, excluded: 0, without: 0 },
        coverage: Array.from({ length: n / 2 }, (_, i) => ({ id: `b${i}`, sensor_id: "x", sensor: "Towed", colour: "#8a3ffc", time: new Date(t0 - (n / 2 - i) * 30000).toISOString(), bearing: 25 + i * 0.01, ...(i % 3 ? {} : { ambiguous_bearing: 150 }) })),
        ownship: [{ id: "o", name: "OWN", times: Array.from({ length: 2000 }, (_, i) => new Date(t0 - (n / 2) * 30000 + i * ((n * 1.5) / 2000) * 30000).toISOString()), courses: Array.from({ length: 2000 }, (_, i) => (i * 3) % 360) }],
      };
      const control = window.debriefTma;
      control.show(view);
      const from = control.timings.length;
      for (let k = 0; k < 60; k++) {
        control.preview("s", coordinates.map(([lon, lat]) => [lon + k * 2e-5, lat]));
        await new Promise((r) => requestAnimationFrame(() => r()));
        await new Promise((r) => setTimeout(r, 0));
      }
      control.preview("s", undefined);
      const t = control.timings.slice(from).sort((a, b) => a - b);
      return { frames: t.length, median: t[Math.floor(t.length / 2)], p95: t[Math.floor(t.length * 0.95)], worst: t[t.length - 1] };
    }, n);
    console.log(`TMA drag at scale, ${n} cuts, three panes: ${result.frames} whole frames, median ${result.median.toFixed(2)} ms, p95 ${result.p95.toFixed(2)} ms, worst ${result.worst.toFixed(2)} ms`);
    assert.ok(result.frames >= 30, `frames drawn: ${result.frames}`);
    assert.ok(result.median < 16.7, `${n} cuts: a frame's median ${result.median} ms`);
  }
  await view.locator(".tma-pane", { hasText: "Course/Speed" }).click();
  await page.waitForFunction(() => !window.debriefTma.plotState.panes.course);
  // Shown again as it was: the imported solution (another track chosen first, so the view asks again).
  await page.locator('#outline li[data-id] .name', { hasText: "MAYO" }).first().click();
  await page.locator('#outline li[data-id] .name', { hasText: "TMA_0900" }).first().click();
  await page.waitForFunction(() => window.debriefTma.shown?.residuals?.rows.length === 10);

  // At 768 px wide the panels are one column, the view about 200 px wide: each bearing and
  // residual still read whole, not cut short.
  const wide = page.viewportSize();
  await page.setViewportSize({ width: 768, height: 900 });
  await page.waitForFunction(() => document.getElementById("dock")?.hidden !== false || !document.body.classList.contains("docked"));
  await page.locator("#bearings .tma-row").first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const row = document.querySelector("#bearings .tma-row");
    return row && row.getBoundingClientRect().width > 0 && row.getBoundingClientRect().width < 320;
  });
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll("#bearings .tma-row .tma-c-brg, #bearings .tma-row .tma-c-res, #bearings .tma-row .tma-c-time")].filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent),
  );
  assert.deepEqual(cut, [], `at 768 px every bearing, residual and time reads whole: ${cut.join(", ")}`);
  // On a phone (390 px), the panels one column: the plot whole across it, tall enough to read,
  // its panes side by side, the page never scrolling sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const c = document.querySelector("#bearings .tma-canvas")?.getBoundingClientRect();
    return c && c.width > 0 && c.width <= 390 && c.height >= 250;
  });
  const phone = await page.evaluate(() => {
    const c = document.querySelector("#bearings .tma-canvas").getBoundingClientRect();
    return { left: c.left, right: c.right, height: c.height, sideways: document.scrollingElement.scrollWidth > innerWidth + 1, panes: window.debriefTma.plotState.panes, drawn: Object.keys(window.debriefTma.plotState.axes) };
  });
  assert.ok(phone.left >= 0 && phone.right <= 390 + 1, `the plot within the phone's width: ${JSON.stringify(phone)}`);
  assert.equal(phone.sideways, false, "the page does not scroll sideways");
  assert.deepEqual(phone.drawn, ["bearing", "error"], "Bearing and Error side by side");
  await page.mouse.move(2, 2);
  await picture("stacked-dots-06-phone");
  await page.setViewportSize(wide);
  if (rearranged) {
    // As the playground's earlier steps left it, every panel on the left, for the steps after.
    await mapPlaced(page);
    const moveByMenu = async (id, item) => {
      await page.locator(`.dv-tab[data-panel="${id}"]`).focus();
      await page.keyboard.press("Shift+F10");
      await page.getByRole("menuitem", { name: item, exact: true }).click();
      await page.waitForFunction((tab) => document.activeElement?.dataset?.panel === tab, id);
    };
    await moveByMenu("panel-tools", "Move to a group of its own");
    await moveByMenu("panel-history", "Move to a group of its own");
    await moveByMenu("panel-tour", "Move to left: Tools");
    await moveByMenu("panel-timeline", "Move to left: Tools, Walkthroughs");
    await moveByMenu("panel-coverage", "Move to left: Tote");
    await moveByMenu("panel-bearings", "Move to left: Tote, Coverage");
    for (const id of ["tools", "outline", "tote"]) await showPanel(page, id);
    assert.ok((await page.evaluate(() => window.debriefLayout().groups)).every((g) => g.place === "left" || g.panels.includes("map")), "every panel on the left again");
    await mapPlaced(page);
  }
}
