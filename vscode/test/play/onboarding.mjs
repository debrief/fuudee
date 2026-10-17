// Onboarding (CAP-25, NFR-09, OUT-05) and the web demo (DEP-06, DEP-07), played as a reader would.
//
// playTours: each of the four walkthroughs, start to finish, by doing what each step asks with
// the pointer and the keyboard; each step must tick itself off from what was done, never from
// its button. Each works on a fresh copy of serial 1: the sample as shipped never changes.
//
// speedRun: the onboarding trial's tasks (docs/notes/onboarding-trial.md): import a REP file,
// tidy a track, annotate, and export a figure traced back to its plot. Counts what the reader
// does (each click, key and field filled in) and the time, to show the tasks can be done and
// how much they ask; the trial itself, with analysts, is the product owner's to run.
//
// playDemo: the web demo at /demo/, full screen: every panel and the walkthroughs, the sample
// serials by default; a file of the reader's own is read in the browser only (no request
// carries it) and nothing of it is kept once the tab closes (product owner, 17 Oct 2026).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ready = (page) => page.waitForFunction(() => document.getElementById("status")?.textContent?.startsWith("Ready"), null, { timeout: 240000 });
/** The step's event was sent; if not, what the page said meanwhile, to see why. */
const done = (page, event) =>
  page.waitForFunction((e) => window.debriefTours().events.includes(e), event, { timeout: 90000 }).catch(async (error) => {
    const said = await page.evaluate(() => [document.getElementById("status")?.textContent, ...[...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent), JSON.stringify(window.debriefTours())]);
    throw new Error(`${event} was not done. The page said: ${said.join(" | ")}. ${error.message}`);
  });
const stepRow = (page, index) => page.locator("#tour .tour-step").nth(index);
/** A step's own button, in its body (open once it is the step to do next). */
const go = (page, index) => stepRow(page, index).locator(".tour-body > button");
const stepAdded = (page, count) => page.waitForFunction((c) => document.querySelectorAll("#history li").length > c, count, { timeout: 60000 });
const steps = (page) => page.locator("#history li").count();

/** The step is ticked, and says so to a screen reader. */
async function ticked(page, index, title) {
  const row = stepRow(page, index);
  await page.waitForFunction((i) => document.querySelectorAll("#tour .tour-step")[i]?.classList.contains("done"), index, { timeout: 30000 });
  assert.match(await row.locator(".tour-head").innerText(), new RegExp(`${title}`));
  assert.equal(await row.locator(".visually-hidden").innerText(), ", done");
  assert.equal(await row.locator(".tour-mark").innerText(), "✓");
}

/** The walkthroughs' panel open (the main test folds it, and the browser remembers). */
async function openTours(page) {
  const fold = page.locator("#panel-tour button.fold");
  if ((await fold.getAttribute("aria-expanded")) === "false") await fold.click();
}

/** Start a walkthrough: chosen in the panel, its first step's button makes and opens the copy. */
async function startTour(page, tour) {
  await page.locator("#panel-tour").scrollIntoViewIfNeeded();
  await page.selectOption("#tour-pick", tour);
  await go(page, 0).click();
  await done(page, `${tour}Opened`);
  assert.equal(await page.locator("#plots").inputValue(), `serial-1-${tour}`);
  await ticked(page, 0, "Open a copy of serial 1");
}

async function answerImport(page) {
  // Over the ground, for each track of the REP file, as legacy Debrief asked.
  const dialog = page.locator("dialog.track-form");
  for (let i = 0; i < 4; i++) {
    const asked = await dialog.waitFor({ timeout: 8000 }).then(() => true, () => false);
    if (!asked) break;
    await dialog.getByRole("button", { name: "Import" }).click();
    await page.waitForTimeout(150);
  }
}

export async function playTours(page, shot, root) {
  const mapFrame = page.frameLocator(".frame-map");
  const sample = readFileSync(path.join(root, "sample", "serial-1", "plot.geojson"), "utf8");
  const pristine = () => page.evaluate(() => fetch("sample/serial-1/plot.geojson").then((r) => r.text()));

  // The walkthroughs are the first panel, above the time controller; the first is open at its first step.
  await openTours(page);
  assert.equal(await page.locator("#side > section:not([hidden])").first().getAttribute("id"), "panel-tour");
  assert.equal(await page.locator("#side > section:not([hidden])").nth(1).getAttribute("id"), "panel-time");
  assert.equal(await stepRow(page, 0).locator(".tour-head").getAttribute("aria-expanded"), "true");
  await stepRow(page, 0).locator(".tour-media svg").waitFor({ timeout: 15000 }); // the same picture as VS Code's
  assert.equal(await stepRow(page, 0).locator(".tour-media").getAttribute("role"), "img");

  // --- Open and explore a serial -----------------------------------------------------
  await startTour(page, "explore");
  await shot("tour-01-explore-open");
  // Its button only takes the reader there: pressing it ticks nothing.
  await go(page, 1).click();
  assert.equal(await page.evaluate(() => document.activeElement?.closest("section")?.id), "panel-time");
  assert.equal(await stepRow(page, 1).getAttribute("class"), "tour-step next");
  await page.locator("#timebar .tc-current").focus();
  await page.keyboard.press("ArrowRight");
  await done(page, "timeMoved");
  await ticked(page, 1, "Move current time");
  // Select from the keyboard, as the step says: Enter, then Ctrl+Enter adds.
  await page.locator('#outline li[data-id="track-blue-one"]').focus();
  await page.keyboard.press("Enter");
  await page.locator('#outline li[data-id="track-red-one"]').focus();
  await page.keyboard.press("Control+Enter");
  await done(page, "selected");
  await ticked(page, 2, "Select tracks in the Outline");
  // The Tote, from the Outline's menu: Shift+F10.
  for (const [id, item] of [["track-blue-one", "Set as Tote primary"], ["track-red-one", "Add to Tote"]]) {
    await page.locator(`#outline li[data-id="${id}"]`).focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menuitem", { name: item }).click();
  }
  await done(page, "toteChosen");
  await ticked(page, 3, "Compare tracks in the Tote");
  await page.locator('#timeline .tl-row[data-kind="narrative"]').nth(3).click();
  await done(page, "timelineChosen");
  await ticked(page, 4, "Read the narrative in the Timeline");
  assert.match(await page.locator("#tour .tour-said").innerText(), /That is the whole of Open and explore a serial/);
  await page.locator("#panel-tour").scrollIntoViewIfNeeded();
  await shot("tour-02-explore-done");

  // --- Import and collate ------------------------------------------------------------
  await startTour(page, "collate");
  await go(page, 1).click(); // the navigation log that came with the copy: nothing of the reader's
  await answerImport(page);
  await done(page, "imported");
  const log = page.locator("#items > li", { has: page.locator(".item-title", { hasText: "blue-one-nav-log" }) });
  await log.locator(".item-mark").waitFor({ timeout: 60000 });
  assert.equal(await page.locator("#plots").inputValue(), "serial-1-collate", "the copy stays open: the log is new data for it");
  await page.locator(".side-bar button", { hasText: "Close" }).click();
  await go(page, 2).click();
  await done(page, "coverageShown");
  const coverage = page.locator("#coverage");
  let n = await steps(page);
  await coverage.locator(".cov-take").first().focus();
  await page.keyboard.press("Enter");
  await done(page, "newDataTaken");
  await stepAdded(page, n);
  const blue = coverage.locator('.cov-platform[data-track="track-blue-one"]');
  const choice = blue.locator("select", { has: page.locator("option", { hasText: "blue-one-nav-log" }) }).first();
  await choice.focus();
  const picked = () => choice.evaluate((s) => s.options[s.selectedIndex].text);
  for (let i = 0; i < 6 && !(await picked()).includes("blue-one-nav-log"); i++) await page.keyboard.press("ArrowDown");
  n = await steps(page);
  await page.keyboard.press("Enter");
  await done(page, "sourceChosen");
  await stepAdded(page, n);
  await ticked(page, 4, "Choose a source for a period");
  await page.locator("#panel-tour").scrollIntoViewIfNeeded();
  await shot("tour-03-collate-done");

  // --- Tidy a track ------------------------------------------------------------------
  await startTour(page, "tidy");
  assert.match(await page.locator("#history li .name").first().innerText(), /^GPS glitches put into RED ONE$/);
  const dialog = page.locator("dialog.track-form");
  const side = page.locator("#side-frame");
  await go(page, 1).click(); // selects RED ONE and opens Jumps…
  await dialog.getByRole("button", { name: "Find" }).click();
  await side.getByRole("button", { name: "Remove 3 jumps" }).click();
  await done(page, "jumpsRemoved");
  await go(page, 2).click();
  await dialog.getByRole("button", { name: "Preview" }).click();
  await side.getByRole("button", { name: "Apply" }).click();
  await done(page, "smoothed");
  await go(page, 3).click();
  await side.locator(".fix-list li").nth(60).click();
  await side.getByRole("button", { name: "Label…" }).click();
  await page.locator("#track-form-text").fill("Turned away");
  await dialog.getByRole("button", { name: "Save" }).click();
  await done(page, "fixMarked");
  await side.getByRole("button", { name: "Close" }).click();
  await go(page, 4).click();
  await page.locator("#track-form-course").fill("200");
  await page.locator("#track-form-speed").fill("6");
  await dialog.getByRole("button", { name: "Shear" }).click();
  await done(page, "sheared");
  await ticked(page, 4, "Shear a leg, as in TMA");
  await page.locator("#panel-tour").scrollIntoViewIfNeeded();
  await shot("tour-04-tidy-done");

  // --- Annotate and export a figure --------------------------------------------------
  await startTour(page, "annotate");
  await mapFrame.getByRole("toolbar", { name: "Draw an annotation" }).getByRole("button", { name: "Area", exact: true }).click();
  const box = await page.locator(".frame-map").boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  for (const [fx, fy] of [[0.45, 0.35], [0.6, 0.35], [0.6, 0.55]]) await page.mouse.click(...at(fx, fy));
  await page.mouse.dblclick(...at(0.45, 0.55));
  const form = page.frameLocator(".frame-annotation");
  await form.locator("#field-name input").fill("Search area");
  await form.getByRole("button", { name: "Add" }).click();
  await done(page, "annotationAdded");
  await go(page, 2).click(); // selects BLUE ONE and RED ONE and opens Frequencies…
  await page.locator("#freq-label_interval").selectOption({ label: "Every 10 min" });
  await dialog.getByRole("button", { name: "Apply" }).click();
  await done(page, "frequenciesSet");
  await go(page, 3).click();
  await page.selectOption("#export-preset", "slide");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.locator("#export-image").click()]);
  assert.match(download.suggestedFilename(), /^Serial 1 Annotate and export a figure .*\.png$|\.png$/);
  await done(page, "imageExported");
  const short = (await page.locator("#export-said").innerText()).match(/Its ID, (DBF-[0-9A-Z-]+),/)[1];
  // The plot changes; then the image is traced by the ID in its corner, typed.
  await page.locator("#north-arrow").click();
  await page.waitForFunction(() => document.getElementById("north-arrow")?.getAttribute("aria-pressed") === "true");
  await go(page, 4).click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "find-id");
  await page.keyboard.type(short);
  await page.keyboard.press("Enter");
  await done(page, "imageTraced");
  await mapFrame.locator(".revision-banner").waitFor({ state: "visible", timeout: 60000 });
  await ticked(page, 4, "Find the image's source");
  await page.locator("#panel-tour").scrollIntoViewIfNeeded();
  await shot("tour-05-annotate-done");
  await mapFrame.locator(".revision-banner button", { hasText: "Go to latest" }).click();

  // The sample as shipped is unchanged, whatever was done to the copies; its serial 1 too.
  assert.equal(await pristine(), sample);
  assert.ok((await page.locator("#plots option").allInnerTexts()).includes("Serial 1"));

  // The panel at a phone's and a blog's widths, in a wider font: nothing scrolls sideways.
  const widths = [];
  for (const wide of [false, true]) {
    const style = wide ? await page.addStyleTag({ content: "#side * { letter-spacing: 0.1em !important; font-size: 15px !important }" }) : undefined;
    for (const width of [390, 280, 210]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(300);
      const over = await page.evaluate(() =>
        ["#body-tour", "#tour", ".tour-steps", ".tour-pick", ...[...document.querySelectorAll(".tour-body")].map((_, i) => `.tour-step:nth-child(${i + 1}) .tour-body`)].flatMap((s) => {
          const el = document.querySelector(s);
          return el && el.offsetParent && el.scrollWidth > el.clientWidth + 1 ? [`${s} ${el.scrollWidth}/${el.clientWidth}`] : [];
        }),
      );
      widths.push(`${wide ? "wide font, " : ""}${width} px: ${over.length ? over.join(", ") : "fits"}`);
      assert.deepEqual(over, [], `${wide ? "in a wide font, " : ""}at ${width} px the walkthroughs never scroll sideways`);
      if (width === 280 && !wide) {
        await page.locator("#panel-tour").scrollIntoViewIfNeeded();
        await shot("tour-06-narrow");
      }
    }
    await style?.evaluate((s) => s.remove());
  }
  await page.setViewportSize({ width: 1400, height: 820 });
  console.log(`Walkthroughs played, every step ticked by what was done: ${await page.evaluate(() => window.debriefTours().events.length)} of 20. Panel sideways scroll: ${widths.join("; ")}.`);
}

/**
 * The onboarding trial's tasks, done as quickly as the playground allows, counting each thing
 * the reader does. Not the trial: it shows the tasks can be done in the time, and what they ask.
 */
export async function speedRun(page, root) {
  let actions = 0;
  const act = async (what, n = 1) => {
    actions += n;
    return what;
  };
  const started = Date.now();
  const tasks = [];
  const lap = (name, from, count) => tasks.push(`${name}: ${actions - count} actions, ${((Date.now() - from) / 1000).toFixed(1)} s`);
  const dialog = page.locator("dialog.track-form");
  const side = page.locator("#side-frame");
  const mapFrame = page.frameLocator(".frame-map");
  const go = (index) => stepRow(page, index).locator(".tour-body > button");

  await openTours(page);
  // 1. Import a REP file: serial 2's RED ONE, plotted over the ground.
  let t = Date.now();
  let c = actions;
  await act(page.locator("#file").setInputFiles(path.join(root, "sample", "serial-2", "sources", "red-one.rep")));
  await dialog.waitFor({ timeout: 60000 });
  await act(dialog.getByRole("button", { name: "Import" }).click());
  await page.locator(".omitted-panel h2", { hasText: "red-one.rep: imported 1 track" }).waitFor({ timeout: 60000 });
  await act(page.locator(".side-bar button", { hasText: "Close" }).click());
  lap("Import", t, c);

  // 2. Tidy RED ONE: the walkthrough's copy, its jumps removed, smoothed.
  t = Date.now();
  c = actions;
  await page.locator("#panel-tour").scrollIntoViewIfNeeded();
  await act(page.selectOption("#tour-pick", "tidy"));
  await act(go(0).click());
  await page.waitForFunction(() => document.getElementById("plots")?.value === "serial-1-tidy", null, { timeout: 60000 });
  let n = await steps(page);
  await act(go(1).click());
  await act(dialog.getByRole("button", { name: "Find" }).click());
  await act(side.getByRole("button", { name: "Remove 3 jumps" }).click());
  await stepAdded(page, n);
  n = await steps(page);
  await act(go(2).click());
  await act(dialog.getByRole("button", { name: "Preview" }).click());
  await act(side.getByRole("button", { name: "Apply" }).click());
  await stepAdded(page, n);
  lap("Tidy", t, c);

  // 3. Annotate: an area drawn and named; both tracks labelled every 10 minutes.
  t = Date.now();
  c = actions;
  await act(mapFrame.getByRole("toolbar", { name: "Draw an annotation" }).getByRole("button", { name: "Area", exact: true }).click());
  const box = await page.locator(".frame-map").boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  for (const [fx, fy] of [[0.45, 0.35], [0.6, 0.35], [0.6, 0.55]]) await act(page.mouse.click(...at(fx, fy)));
  await act(page.mouse.dblclick(...at(0.45, 0.55)));
  const form = page.frameLocator(".frame-annotation");
  await act(form.locator("#field-name input").fill("Search area"));
  n = await steps(page);
  await act(form.getByRole("button", { name: "Add" }).click());
  await stepAdded(page, n);
  await act(page.locator('#outline li[data-id="track-blue-one"]').click());
  await act(page.locator('#outline li[data-id="track-red-one"]').click({ modifiers: ["Control"] }));
  await act(page.locator("#track-frequencies").click());
  await act(page.locator("#freq-label_interval").selectOption({ label: "Every 10 min" }));
  n = await steps(page);
  await act(dialog.getByRole("button", { name: "Apply" }).click());
  await stepAdded(page, n);
  lap("Annotate", t, c);

  // 4. Export a traceable figure: a slide PNG with its ID, then found again by the ID.
  t = Date.now();
  c = actions;
  await page.locator("#panel-export").scrollIntoViewIfNeeded();
  await act(page.selectOption("#export-preset", "slide"));
  await act(Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.locator("#export-image").click()]));
  await page.waitForFunction(() => document.getElementById("export-said")?.textContent?.startsWith("Exported"), null, { timeout: 60000 });
  const short = (await page.locator("#export-said").innerText()).match(/Its ID, (DBF-[0-9A-Z-]+),/)[1];
  await act(page.locator("#find-id").fill(short));
  await act(page.locator("#find-id").press("Enter"));
  await mapFrame.locator(".revision-banner").waitFor({ state: "visible", timeout: 60000 });
  await act(mapFrame.locator(".revision-banner button").press("Enter")); // Edit the plot: it has not changed since
  await mapFrame.locator(".revision-banner").waitFor({ state: "hidden" });
  lap("Export a traceable figure", t, c);

  const seconds = (Date.now() - started) / 1000;
  console.log(`Onboarding speed run (the trial's tasks, done by the test as fast as the playground answers): ${actions} actions in ${seconds.toFixed(1)} s. ${tasks.join("; ")}.`);
  return { actions, seconds, tasks };
}

/** The web demo, at /demo/ on the built site. */
export async function playDemo(browser, siteUrl, shot) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 820 } });
  const requests = [];
  context.on("request", (request) => requests.push({ url: request.url(), method: request.method(), body: request.postDataBuffer() }));
  const errors = [];
  let page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));

  // The home page leads to it.
  await page.goto(`${siteUrl}/`);
  const link = page.locator('a[href$="demo/"]').first();
  assert.equal(await link.count(), 1, "the home page links to the web demo");
  await Promise.all([page.waitForURL(/\/demo\/$/), link.click()]);
  await ready(page);
  assert.equal(await page.title(), "Debrief web demo");
  // Full screen, every panel, the walkthroughs first; the sample serials by default.
  const shown = await page.$$eval("#side > section", (all) => all.filter((s) => !s.hidden).map((s) => s.id));
  assert.deepEqual(shown, ["panel-tour", "panel-time", "panel-tote", "panel-plot", "panel-outline", "panel-timeline", "panel-catalogue", "panel-coverage", "panel-tools", "panel-history", "panel-export", "panel-try", "panel-import"]);
  assert.equal(await page.locator("#plots").inputValue(), "serial-1");
  assert.deepEqual(await page.locator("#plots option").allInnerTexts(), ["Serial 1", "Serial 2", "Serial 3"]);
  for (const frame of [".frame-map"]) assert.ok(await page.locator(frame).isVisible());
  assert.ok((await page.locator("#tools button").count()) > 3);
  assert.ok(await page.frameLocator(".frame-map").locator(".leaflet-interactive").count());
  await shot("demo-01-full-screen", page);

  // A file of the reader's own: read in the browser, never sent anywhere.
  const marker = `LOCALONLY${Date.now().toString(36).toUpperCase()}`;
  const rep = [`;; ${marker}: a file of the reader's own`, ...Array.from({ length: 12 }, (_, i) => `230615 0${8 + Math.floor(i / 6)}${String((i % 6) * 10).padStart(2, "0")}00.000 ${marker} @A 37 00 00.00 N 075 ${String(30 + i).padStart(2, "0")} 00.00 W 090.0 10.0 0`)].join("\n") + "\n";
  const before = requests.length;
  await page.locator("#file").setInputFiles({ name: `${marker.toLowerCase()}.rep`, mimeType: "text/plain", buffer: Buffer.from(rep) });
  await page.locator("dialog.track-form").getByRole("button", { name: "Import" }).click();
  await page.locator(".omitted-panel h2", { hasText: "imported 1 track" }).waitFor({ timeout: 60000 });
  assert.match(await page.locator("#outline").innerText(), new RegExp(marker));
  const sent = requests.slice(before);
  // Python's worker's requests are watched too (its wheels and Pyodide come through it).
  assert.ok(requests.some((r) => r.url.includes("/play/wheels/")) && requests.some((r) => r.url.includes("pyodide")), "the worker's requests are seen");
  const carrying = requests.filter((r) => r.url.toUpperCase().includes(marker) || (r.body && r.body.toString("latin1").includes(marker)));
  assert.deepEqual(carrying, [], "no request carries the file, in its address or its body");
  assert.deepEqual(requests.filter((r) => r.body?.length || !["GET", "HEAD"].includes(r.method)), [], "the demo sends nothing anywhere: every request only fetches");
  // Nothing of it is kept: no browser storage holds it, and none of IndexedDB or the Cache API is used.
  const kept = async (on) =>
    on.evaluate(async (m) => {
      const values = (storage) => Array.from({ length: storage.length }, (_, i) => `${storage.key(i)}=${storage.getItem(storage.key(i))}`);
      return {
        local: values(localStorage).filter((v) => v.toUpperCase().includes(m)),
        session: values(sessionStorage).filter((v) => v.toUpperCase().includes(m)),
        indexedDB: (await indexedDB.databases()).map((d) => d.name),
        caches: await caches.keys(),
      };
    }, marker);
  assert.deepEqual(await kept(page), { local: [], session: [], indexedDB: [], caches: [] });
  // Closed and opened again: the sample serials only.
  await page.close();
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${siteUrl}/demo/`);
  await ready(page);
  assert.deepEqual(await page.locator("#plots option").allInnerTexts(), ["Serial 1", "Serial 2", "Serial 3"]);
  assert.doesNotMatch(await page.locator("#outline").innerText(), new RegExp(marker));
  assert.deepEqual(await kept(page), { local: [], session: [], indexedDB: [], caches: [] });
  // A walkthrough runs here as in the playground.
  await page.selectOption("#tour-pick", "explore");
  await go(page, 0).click();
  await done(page, "exploreOpened");
  await page.locator("#panel-tour").scrollIntoViewIfNeeded();
  await shot("demo-02-walkthrough", page);
  console.log(`Web demo: every panel and the walkthroughs; a file of the reader's own read in the browser, ${sent.length} requests while importing it, none carrying it or sending anything; nothing kept after the tab closed.`);
  assert.deepEqual(errors, []);
  await context.close();
}
