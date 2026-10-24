// Sensor bearings in the playground (CAP-22), played as a reader would: the sample's two
// sensors drawn as cuts from BLUE ONE, only in the time window, the cut current time is at
// emphasised; each sensor in the Outline under its track. One of an ambiguous cut's two
// lines clicked on the map keeps it, one step, undone by Undo; a sensor's menu from the
// keyboard keeps port for the cuts in the window, one step named for what it did; Both
// again makes them ambiguous again. A cut's menu by right-click; a sensor coloured and
// hidden, each a step. A .dsf file read in, the reader asked which track carries a sensor
// the plot has no track for, as legacy asked. Nothing scrolls sideways down to 210 px,
// in a wide font. Painting thousands of cuts measured against its budget.
import assert from "node:assert/strict";
import { resizeTo, showPanel } from "./dock.mjs";

export async function playSensors(page, shot) {
  const mapFrame = page.frameLocator(".frame-map");
  const steps = () => page.locator("#history li").count();
  const latest = () => page.locator("#history li").first().locator(".name").textContent();
  const stepAdded = (count) => page.waitForFunction((c) => document.querySelectorAll("#history li").length > c, count, { timeout: 60000 });
  const canvas = mapFrame.locator("canvas.sensor-cuts");
  const drawn = async (what = "cuts") => Number((await canvas.getAttribute(`data-${what}`)) ?? 0);
  const row = (id) => page.locator(`#outline li[data-id="${id}"]`);
  const probes = () => mapFrame.locator("#map").evaluate(() => window.debriefCuts());
  const frameBox = async () => (await page.locator(".frame-map").boundingBox());
  const undone = () => page.locator("#history li.undone").count();
  const undo = async () => {
    const before = await undone();
    await showPanel(page, "history");
    await page.locator("#undo").click();
    await page.waitForFunction((u) => document.querySelectorAll("#history li.undone").length > u, before, { timeout: 60000 });
    await showPanel(page, "outline");
  };

  // The sample, the whole of it in the window, nothing selected.
  await page.selectOption("#plots", "serial-1");
  await page.waitForFunction(() => document.querySelector("#outline li[data-id='sensor-blue-one-towed-array']"));
  await showPanel(page, "outline");
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  await page.locator("#timebar .tc-end").focus();
  await page.keyboard.press("End");
  // Current time an hour or so before the end, with cuts heard before it.
  await page.locator("#timebar .tc-current").focus();
  await page.keyboard.press("End");
  await page.keyboard.press("PageDown"); // 50 min back, a step being 5 min
  await mapFrame.locator("#map").focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#outline li.selected"));
  await page.waitForTimeout(500);

  // In the Outline: each sensor under BLUE ONE, saying how many cuts and how many are ambiguous.
  const rows = await page.$$eval("#outline li", (all) => all.map((r) => r.dataset.id));
  const blue = rows.indexOf("track-blue-one");
  assert.deepEqual(rows.slice(blue + 1, blue + 3), ["sensor-blue-one-bow-sonar", "sensor-blue-one-towed-array"], "sensors under their host track");
  const towedDetail = await row("sensor-blue-one-towed-array").locator(".detail").innerText();
  assert.match(towedDetail, /^\d+ cuts · \d+ ambiguous/);
  assert.equal(await page.locator("#sensor-group").isVisible(), true, "the Sensor actions, for a plot with sensors");

  // On the map: every cut in the window, the current ones emphasised; the legend says what is what.
  const all = await drawn();
  assert.equal(all, 393, "every cut of the sample in the window");
  assert.ok((await drawn("lines")) > all, "an ambiguous cut is two lines");

  // One for each sensor with a cut heard by then (tests before this one may have split BLUE ONE, and with it its sensors).
  const sensorRows = await page.locator("#outline li.sensor").count();
  assert.ok((await drawn("current")) >= 2 && (await drawn("current")) <= sensorRows, "one current cut for each sensor");
  assert.equal(await mapFrame.locator(".swatch-cut-twin").evaluate((s) => s.parentElement.hidden), false, "the key has a row for a cut's other bearing");
  await page.mouse.move(2, 2);
  await shot("sensors-01-map");
  // An hour's window: only its cuts.
  await page.locator("#timebar .tc-start").focus();
  for (let i = 0; i < 2; i++) await page.keyboard.press("PageUp");
  await page.waitForTimeout(300);
  const windowed = await drawn();
  assert.ok(windowed > 0 && windowed < all, `only the cuts in the window: ${windowed} of ${all}`);
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  await page.waitForTimeout(300);

  // Pointing at a cut says its bearings and sides; clicking one of an ambiguous cut's lines keeps it: one step.
  const box = await frameBox();
  const ambiguous = (await probes()).find((p) => p.ambiguous);
  assert.ok(ambiguous, "an ambiguous cut's line to click");
  await page.mouse.move(box.x + ambiguous.x, box.y + ambiguous.y);
  const tip = mapFrame.locator(".cut-tip");
  await tip.waitFor({ state: "visible" });
  assert.match(await tip.innerText(), /cut at \d\d:\d\d:\d\dZ\nAmbiguous: \d{3}\.\d° \((port|starboard)\) or \d{3}\.\d° \((port|starboard)\)/);
  await shot("sensors-02-pointed");
  let n = await steps();
  const lines = await drawn("lines");
  await page.mouse.click(box.x + ambiguous.x, box.y + ambiguous.y);
  await stepAdded(n);
  assert.match(await latest(), /^(Port|Starboard) bearing kept on (Towed array|Bow sonar) cut at \d\d:\d\d:\d\dZ$/);
  await page.waitForFunction((l) => document.querySelector(".frame-map").contentDocument.querySelector("canvas.sensor-cuts").dataset.lines < l, lines);
  assert.equal(await drawn("lines"), lines - 1, "the other bearing no longer drawn");
  // Undo: ambiguous again, both lines drawn.
  await undo();
  await page.waitForFunction((l) => Number(document.querySelector(".frame-map").contentDocument.querySelector("canvas.sensor-cuts").dataset.lines) === l, lines);

  // From the keyboard: the Towed array's menu (Shift+F10), Keep port, the cuts in the window: one step.
  await row("sensor-blue-one-towed-array").focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.locator(".context-menu");
  await menu.waitFor();
  assert.deepEqual(await menu.locator("button").allInnerTexts(), ["Keep port bearing…", "Keep starboard bearing…", "Make ambiguous again…", "Cut at current time…"]);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".context-menu")?.getAttribute("aria-label") === "Keep port bearing: which cuts?");
  const scopes = await menu.locator("button").allInnerTexts();
  assert.match(scopes.join("|"), /^The cut at the current time \(1 cut, \d+ with two bearings\)\|Cuts in the time window \(\d+ cuts, \d+ with two bearings\)\|All cuts/);
  await shot("sensors-03-keyboard-scope");
  n = await steps();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await stepAdded(n);
  assert.match(await latest(), /^Port kept: \d+ Towed array cuts \d\d:\d\d:\d\dZ–\d\d:\d\d:\d\dZ$/);
  assert.match(await row("sensor-blue-one-towed-array").locator(".detail").innerText(), /^\d+ cuts( · \d+ ambiguous)? · \d+ resolved$/);
  await page.mouse.move(2, 2);
  await shot("sensors-04-port-kept");
  // Both again, for all the Towed array's cuts, from the Sensor actions: one step.
  await row("sensor-blue-one-towed-array").click();
  n = await steps();
  await page.locator("#keep-ambiguous").click();
  await menu.waitFor();
  await menu.getByRole("menuitem", { name: /^All cuts/ }).click();
  await stepAdded(n);
  assert.match(await latest(), /^Ambiguous again: \d+ Towed array cuts \d\d:\d\d:\d\dZ–\d\d:\d\d:\d\dZ$/);

  // A cut's menu, by right-click on its line: its two bearings to keep, or select it.
  // Once the map shows the plot after the step: every cut's two lines again.
  await page.waitForFunction((l) => Number(document.querySelector(".frame-map").contentDocument.querySelector("canvas.sensor-cuts").dataset.lines) === l, lines);
  await page.waitForTimeout(300);
  const again = (await probes()).find((p) => p.ambiguous);
  await page.mouse.click(box.x + again.x, box.y + again.y, { button: "right" });
  const asked = page.locator("dialog#ask");
  await asked.waitFor();
  assert.match(await asked.locator("#ask-text").innerText(), /cut at \d\d:\d\d:\d\dZ\. Ambiguous:/);
  const choices = await asked.locator("#ask-buttons button").allInnerTexts();
  assert.match(choices.join("|"), /^Keep \d{3}\.\d° \((port|starboard)\)\|Keep \d{3}\.\d° \((port|starboard)\)\|Select this cut\|Cancel$/);
  await shot("sensors-05-cut-menu");
  await page.keyboard.press("Escape");
  await asked.waitFor({ state: "hidden" });
  // From the keyboard, the cut the map emphasises: the Towed array's menu, Cut at current time.
  await row("sensor-blue-one-towed-array").focus();
  await page.keyboard.press("Shift+F10");
  await menu.waitFor();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await asked.waitFor();
  assert.match(await asked.locator("#ask-text").innerText(), /^Towed array cut at \d\d:\d\d:\d\dZ\. Ambiguous: /);
  await page.keyboard.press("Escape");
  await asked.waitFor({ state: "hidden" });

  // A sensor coloured and hidden: each a step; hidden, its cuts are not drawn.
  await row("sensor-blue-one-bow-sonar").click();
  n = await steps();
  await page.selectOption("#colour", { label: "Green" });
  await stepAdded(n);
  assert.equal(await latest(), "Colour of Bow sonar set to green");
  const before = await drawn();
  n = await steps();
  await page.locator("#hide").click();
  await stepAdded(n);
  await page.waitForFunction((b) => Number(document.querySelector(".frame-map").contentDocument.querySelector("canvas.sensor-cuts").dataset.cuts) < b, before);
  assert.match(await row("sensor-blue-one-bow-sonar").locator(".detail").innerText(), /^hidden on map/);
  await undo();
  await undo();

  // A .dsf file read into the plot: a sensor of a track the plot has not, its track asked for.
  const dsf = [
    ';SENSOR2: 20230615 090000.000 NELSON @A NULL 45.0 135.0 NULL NULL "Hull array" 0900',
    ';SENSOR2: 20230615 091000.000 NELSON @A NULL 50.0 130.0 NULL 3000 "Hull array" 0910',
    ';SENSOR: 20230615 092000.000 NELSON @A NULL 55.0 NULL "Hull array" 0920',
  ].join("\n");
  await showPanel(page, "import");
  n = await steps();
  await page.locator("#sensor-file").setInputFiles({ name: "nelson.dsf", mimeType: "text/plain", buffer: Buffer.from(dsf) });
  await asked.waitFor();
  assert.match(await asked.locator("#ask-text").innerText(), /^Which track carries NELSON's sensors\? Hull array on NELSON: 3 cuts, 2 ambiguous\.$/);
  await shot("sensors-06-which-track");
  await asked.getByRole("button", { name: "RED ONE", exact: true }).click();
  await stepAdded(n);
  assert.equal(await latest(), "Sensor data read from nelson.dsf");
  await page.waitForFunction(() => document.querySelector("#outline li[data-id='sensor-red-one-hull-array']"));
  const reds = await page.$$eval("#outline li", (all) => all.map((r) => r.dataset.id));
  assert.equal(reds[reds.indexOf("track-red-one") + 1], "sensor-red-one-hull-array", "under RED ONE");
  await undo();

  // The budget (guides/interaction-models/sensors.md): moving current time repaints only the
  // current cuts; moving the window repaints every cut in it, well within a frame for the sample.
  const paintMs = async () => Number(await canvas.getAttribute("data-paint-ms"));
  const moved = [];
  const windowed2 = [];
  await page.locator("#timebar .tc-current").focus();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(60);
    moved.push(await paintMs());
  }
  await page.locator("#timebar .tc-start").focus();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(i < 3 ? "ArrowRight" : "ArrowLeft");
    await page.waitForTimeout(60);
    windowed2.push(await paintMs());
  }
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log(`Sensor cuts painted (${await drawn()} cuts): current time moved ${median(moved).toFixed(1)} ms, window moved ${median(windowed2).toFixed(1)} ms (medians).`);
  assert.ok(median(moved) < 8, "moving current time repaints within budget");
  assert.ok(median(windowed2) < 50, "moving the window repaints within budget (generously, for a slow machine)");

  // Narrow, and in a wide font: the Outline's rows and the Sensor actions never scroll sideways, nor cut a label short.
  const sideways = () =>
    page.evaluate(() => [
      ...["#body-outline", "#outline", ".outline-tools"].flatMap((s) => {
        const el = document.querySelector(s);
        return el && el.scrollWidth > el.clientWidth + 1 ? [`${s} ${el.scrollWidth}/${el.clientWidth}`] : [];
      }),
      ...["#keep-port", "#keep-starboard", "#keep-ambiguous"].flatMap((s) => {
        const el = document.querySelector(s);
        return el && el.scrollWidth > el.clientWidth + 1 ? [`${s} cut short ${el.scrollWidth}/${el.clientWidth}`] : [];
      }),
    ]);
  const widths = [];
  for (const wide of [false, true]) {
    const style = wide ? await page.addStyleTag({ content: "#side *, .dv-groupview * { letter-spacing: 0.08em !important } #outline li, .outline-tools button { font-size: 15px !important }" }) : undefined;
    for (const width of [390, 280, 210]) {
      await resizeTo(page, width, 800);
      await showPanel(page, "outline");
      await page.locator("#sensor-group").scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      const over = await sideways();
      widths.push(`${wide ? "wide font, " : ""}${width} px: ${over.length ? over.join(", ") : "fits"}`);
      assert.deepEqual(over, [], `${wide ? "in a wide font, " : ""}at ${width} px nothing scrolls sideways or is cut short`);
      if (width === 280 && !wide) await shot("sensors-07-narrow-280");
    }
    await style?.evaluate((s) => s.remove());
  }
  console.log(`Sensors in the Outline (sideways scroll): ${widths.join("; ")}.`);
  await resizeTo(page, 1400, 820);
  await showPanel(page, "outline");
}
