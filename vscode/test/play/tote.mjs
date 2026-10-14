// The Tote in the playground (CAP-06, CAP-07, NFR-04, NFR-13), played as a reader would:
// choose BLUE ONE as the primary and add secondaries by mouse, keyboard and the outline's
// menu (right-click, Shift+F10, and press and hold on a touch screen); step and play
// current time and see the values change; a track with no data says when it has;
// remove secondaries by the × button and the Delete key; the choice is view state in
// the plot's island, never a step; and the latency while playing, reported.
import assert from "node:assert/strict";

const BUDGET_MS = 100;

export async function playTote(page, shot) {
  const tote = (selector) => page.locator(`#tote ${selector}`);
  const panel = page.locator("#panel-tote");
  const steps = () => page.locator("#history li").count();
  const timeLabel = () => page.locator("#timebar .time-label").innerText();
  const line = (name) => tote(`tbody:has(.tote-name:text-is("${name}"))`);
  const cell = (name, measure) => line(name).locator(`[data-measure="${measure}"]`);
  const secondaries = () => page.$$eval("#tote tbody[data-track][tabindex] .tote-name", (names) => names.map((n) => n.textContent));
  const valuesOf = (name) => line(name).locator("[data-measure]").allInnerTexts();
  const primaryValues = () => tote(".tote-primary-own [data-measure]").allInnerTexts();
  const showsValues = (name) =>
    page.waitForFunction(
      (n) => [...document.querySelectorAll("#tote tbody[data-track]")].some((r) => r.querySelector(".tote-name")?.textContent === n && / (nmi|yd)$/.test(r.querySelector('td[data-measure="range"]')?.textContent ?? "")),
      name,
      { timeout: 30000 },
    );

  // The whole plot in the window, current time at its start (08:00).
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  await page.locator("#timebar .tc-end").focus();
  await page.keyboard.press("End");
  await page.locator("#timebar .tc-current").focus();
  await page.keyboard.press("Home");
  await page.waitForTimeout(500);

  // A panel of its own that folds away, open at first; nothing chosen yet, and it says how.
  const fold = panel.locator("h2 button.fold");
  assert.equal(await fold.getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator("#body-tote").isVisible(), true);
  await tote(".tote-hint").waitFor();
  assert.match(await tote(".tote-hint").innerText(), /Choose a primary track/);
  const before = await steps();

  // The primary, from its list (a pointer's choice).
  await tote(".tote-primary").selectOption({ label: "BLUE ONE" });
  // Shown on its own under the list, not as a line of the table: its own measures, each labelled.
  await page.waitForFunction(() => document.querySelector("#tote .tote-primary-own")?.getAttribute("aria-label")?.startsWith("BLUE ONE"));
  assert.equal(await line("BLUE ONE").count(), 0);
  // A secondary, from the keyboard: Tab to the list to add from, and choose with the arrow keys.
  await tote(".tote-add").focus();
  await page.keyboard.press("ArrowDown"); // "Add a secondary…" → RED ONE, the first not chosen
  await showsValues("RED ONE");
  assert.deepEqual(await secondaries(), ["RED ONE"]);
  // Choosing tracks is view state in the plot's island: never a step in the history.
  assert.equal(await steps(), before, "choosing Tote tracks is no step");

  // The values: range, bearing true, relative bearing red or green, angle on the bow red or
  // green, bearing rate, course, speed, depth.
  const red = await valuesOf("RED ONE");
  assert.equal(red.length, 8);
  // Range in nautical miles, or under 1 nmi in whole yards (decision, 14 Oct 2026).
  assert.match(red[0], /^(\d+\.\d\d nmi|\d+ yd)$/);
  assert.match(red[1], /^\d{3}\.\d°T$/);
  assert.match(red[2], /^([RG]\d{3}\.\d|000\.0|180\.0)°$/);
  assert.match(red[3], /^([RG]\d{3}\.\d|000\.0|180\.0)°$/, "angle on the bow");
  assert.match(red[4], /^-?\d+\.\d°\/min$/, "bearing rate");
  assert.match(red[5], /^\d{3}\.\d°T$/);
  assert.match(red[6], /^\d+\.\d kn$/);
  assert.match(red[7], /^\d+\.\d m$/, "RED ONE has depths");
  // The primary shows only its own measures: course, speed and depth, each with its label.
  const blue = await primaryValues();
  assert.equal(blue.length, 3);
  assert.match(blue[0], /°T$/);
  assert.match(blue[1], / kn$/);
  assert.match(blue[2], /^\d+\.\d m$/, "BLUE ONE's recorded depths (0 m, a surface ship)");
  assert.deepEqual(await tote(".tote-primary-own .tote-label").allInnerTexts(), ["Crse", "Spd", "Depth"]);
  // One row of headings, each over values of one measure; the remove buttons in a column of their own.
  assert.deepEqual(await tote("thead th:not(.tote-act)").allInnerTexts(), ["Range", "Brg", "Rel"]);
  assert.equal(await tote("thead tr").count(), 1);
  assert.ok(await line("RED ONE").locator("td.tote-act button.tote-remove").isVisible());
  assert.deepEqual(await line("RED ONE").locator(".tote-own .tote-label").allInnerTexts(), ["AOB", "Brg rate", "Crse", "Spd", "Depth"]);
  // On the map, a thin line from BLUE ONE to RED ONE; off and on again from the Tote, never a step.
  const mapLines = () => page.frameLocator(".frame-map").locator("path.tote-map-line").count();
  await page.waitForFunction(() => document.querySelector(".frame-map")?.contentDocument?.querySelectorAll("path.tote-map-line").length === 1);
  const toggle = tote(".tote-lines");
  assert.equal(await toggle.isChecked(), true);
  await toggle.focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelector(".frame-map")?.contentDocument?.querySelectorAll("path.tote-map-line").length === 0);
  await toggle.click();
  await page.waitForFunction(() => document.querySelector(".frame-map")?.contentDocument?.querySelectorAll("path.tote-map-line").length === 1);
  assert.equal(await steps(), before, "the map's lines are view state too");

  // From the outline's menu: right-click Cargo 01 and add it.
  await page.locator(`#outline li[data-id="track-ais-cargo-01"]`).click({ button: "right" });
  const menu = page.locator(".context-menu");
  await menu.waitFor();
  assert.deepEqual(await menu.locator("button").allInnerTexts(), ["Set as Tote primary", "Add to Tote"]);
  await shot("tote-outline-menu");
  await menu.getByRole("menuitem", { name: "Add to Tote" }).click();
  // Its first fix is a second after current time: it says so, rather than showing nothing.
  await line("Cargo 01").locator(".tote-why").waitFor();
  assert.equal(await line("Cargo 01").locator(".tote-why").innerText(), "Starts 08:00:01Z");
  // From the keyboard: Shift+F10 on Cargo 04's row, the arrow key to Add to Tote, Enter.
  await page.locator(`#outline li[data-id="track-ais-cargo-04"]`).focus();
  await page.keyboard.press("Shift+F10");
  await menu.waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await line("Cargo 04").waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.id), "track-ais-cargo-04", "focus back on the row");
  // Escape closes the menu without choosing.
  await page.keyboard.press("Shift+F10");
  await menu.waitFor();
  assert.deepEqual(await menu.locator("button").allInnerTexts(), ["Set as Tote primary", "Remove from Tote"]);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  // Press and hold on a touch screen: Tug 01's menu.
  await pressAndHold(page, `#outline li[data-id="track-ais-tug-01"]`);
  await menu.waitFor();
  await menu.getByRole("menuitem", { name: "Add to Tote" }).click();
  await line("Tug 01").waitFor();
  assert.deepEqual(await secondaries(), ["RED ONE", "Cargo 01", "Cargo 04", "Tug 01"]);

  // Cargo 04's first fix is at 08:28:48: before then, it says so.
  await line("Cargo 04").locator(".tote-why").waitFor();
  assert.equal(await line("Cargo 04").locator(".tote-why").innerText(), "Starts 08:28:48Z");
  await page.locator("#side").evaluate((side) => (side.scrollTop = 0));
  // The picture without the time controller's last note, which goes by itself after 8 s.
  await page.locator(".toast", { hasText: "changed elsewhere" }).waitFor({ state: "detached", timeout: 10000 });
  await shot("tote-chosen");

  // Step current time forward: the values follow, and Cargo 01 and Tug 01 have theirs.
  const range = () => cell("RED ONE", "range").innerText();
  const at0 = await range();
  for (let i = 0; i < 5; i++) await page.locator("#timebar .forward").click();
  await page.waitForFunction((was) => document.querySelector('#tote td[data-measure="range"]')?.textContent !== was, at0);
  assert.notEqual(await range(), at0);
  await showsValues("Cargo 01");
  await showsValues("Tug 01");
  assert.equal(await cell("Tug 01", "depth").innerText(), "—", "no depth recorded: a dash, not zero");
  // A line to each secondary with a position now: RED ONE, Cargo 01 and Tug 01, not Cargo 04 yet.
  assert.equal(await mapLines(), 3);

  // Play: the values keep changing as current time moves; latency reported (NFR-04).
  const latencyBefore = await page.evaluate(() => window.debriefToteLatency());
  const seen = new Set();
  await page.locator("#timebar .tc-speed").selectOption({ label: "600×" }).catch(() => undefined);
  await page.locator("#timebar .tc-play").click();
  for (let i = 0; i < 25; i++) {
    seen.add(await range());
    await page.waitForTimeout(120);
  }
  await page.locator("#side").evaluate((side) => (side.scrollTop = 0));
  await shot("tote-playing");
  await page.locator("#timebar .tc-play").click(); // pause
  assert.ok(seen.size >= 5, `the Tote kept pace while playing: ${seen.size} different ranges`);
  // By now (past 08:28:48) Cargo 04 has values.
  await showsValues("Cargo 04");
  const latency = await page.evaluate(() => window.debriefToteLatency());
  console.log(
    `Tote latency in the playground (Pyodide), from asking to showing: p50 ${latency.shown.p50} ms, p95 ${latency.shown.p95} ms, max ${latency.shown.max} ms over ${latency.shown.count} answers; ` +
      `Python's part p50 ${latency.compute.p50} ms, p95 ${latency.compute.p95} ms (budget ${BUDGET_MS} ms; ${latencyBefore.shown.count} answers before playing).`,
  );
  // Generous: the report says precisely what was seen; this catches only a gross regression.
  assert.ok(latency.shown.p95 < 3 * BUDGET_MS, `p95 ${latency.shown.p95} ms`);
  assert.ok(latency.compute.p50 < BUDGET_MS, `Python's part p50 ${latency.compute.p50} ms`);

  // Tug 01's last fix is at 10:35:17: current time at the window's end, it says it has ended.
  await page.locator("#timebar .tc-current").focus();
  await page.keyboard.press("End");
  await line("Tug 01").locator(".tote-why").waitFor();
  assert.equal(await line("Tug 01").locator(".tote-why").innerText(), "Ended 10:35:17Z");
  await page.locator("#side").evaluate((side) => (side.scrollTop = 0));
  await shot("tote-no-data");

  // Remove a secondary with its × button, and another with Delete on its line, from the keyboard.
  await line("Cargo 01").getByRole("button", { name: "Remove Cargo 01 from the Tote" }).click();
  await line("Cargo 01").waitFor({ state: "detached" });
  await line("Tug 01").focus();
  await page.keyboard.press("Delete");
  await line("Tug 01").waitFor({ state: "detached" });
  assert.deepEqual(await secondaries(), ["RED ONE", "Cargo 04"]);
  assert.ok(await page.evaluate(() => !!document.activeElement?.closest("#tote")), "the keyboard stays in the Tote");
  // A new primary: RED ONE, which then is no longer a secondary.
  await tote(".tote-primary").selectOption({ label: "RED ONE" });
  await page.waitForFunction(() => [...document.querySelectorAll("#tote tbody[data-track][tabindex] .tote-name")].map((n) => n.textContent).join() === "Cargo 04");
  assert.equal(await steps(), before, "still no step: the choice is view state");

  // Kept in the plot's island: open another plot and come back, and the choice is there.
  await page.selectOption("#plots", "serial-2");
  await page.waitForFunction(() => document.getElementById("plot-title")?.textContent?.includes("2"));
  await tote(".tote-hint").waitFor();
  // Close in, a range is in whole yards (decision, 14 Oct 2026): in serial 2, Towing 01 passes
  // BLUE ONE at 0.53 nmi; the Timeline's note of it moves current time there.
  await tote(".tote-primary").selectOption({ label: "BLUE ONE" });
  await tote(".tote-add").selectOption({ label: "Towing 01" });
  await page.locator("#timeline li[data-id]", { hasText: "Towing 01 passed clear" }).locator("button").click();
  await page.waitForFunction(() => /^\d+ yd$/.test(document.querySelector('#tote td[data-measure="range"]')?.textContent ?? ""), null, { timeout: 30000 });
  const close = Number((await cell("Towing 01", "range").innerText()).replace(" yd", ""));
  assert.ok(close > 900 && close < 1100, `Towing 01 at ${close} yd, about 0.53 nmi`);
  await page.locator("#side").evaluate((side) => (side.scrollTop = 0));
  await page.mouse.move(2, 400);
  await shot("tote-close-range");
  // Nothing chosen in serial 2 again.
  await line("Towing 01").getByRole("button", { name: "Remove Towing 01 from the Tote" }).click();
  await tote(".tote-primary").selectOption({ value: "" });
  await tote(".tote-hint").waitFor();
  await page.selectOption("#plots", "serial-1");
  await line("Cargo 04").waitFor();
  assert.equal(await tote(".tote-primary").inputValue(), "track-red-one");
  assert.match((await tote(".tote-primary-own").getAttribute("aria-label")) ?? "", /^RED ONE, the primary/);
  assert.deepEqual(await secondaries(), ["Cargo 04"]);
  // The panel folds away by its heading's button, which the keyboard reaches: Enter toggles it.
  // Folded, the Tote asks for nothing; opened again, it is up to date.
  await fold.focus();
  await page.keyboard.press("Enter");
  assert.equal(await fold.getAttribute("aria-expanded"), "false");
  assert.equal(await page.locator("#tote").isVisible(), false);
  await page.keyboard.press("Enter");
  assert.equal(await fold.getAttribute("aria-expanded"), "true");
  await line("Cargo 04").waitFor();
  await playFolding(page);
  // Nothing chosen again, so what follows starts with the side column as it was.
  await line("Cargo 04").getByRole("button", { name: "Remove Cargo 04 from the Tote" }).click();
  await tote(".tote-primary").selectOption({ value: "" });
  await tote(".tote-hint").waitFor();
  await page.waitForTimeout(500);
  return latency;
}

const PANELS = { time: "Time", tote: "Tote", plot: "Plot", outline: "Outline", timeline: "Timeline", tools: "Tools", history: "History", try: "Try", import: "Import your own" };

/**
 * Every side panel folds away as the Tote does (decision, 14 Oct 2026): each heading is still a
 * heading a screen reader lists, holding a button that says whether its panel is open. Which are
 * folded is remembered in this browser; where storage is refused, they fold all the same.
 */
// The stylesheet writes headings in capitals, which a browser may pass on to a screen reader.
const named = (name) => new RegExp(`^${name}$`, "i");

export async function playFolding(page) {
  const side = page.locator("#side");
  const folded = () => page.evaluate(() => JSON.parse(localStorage.getItem("debrief.play.folded") ?? "[]"));
  for (const [id, name] of Object.entries(PANELS)) {
    const heading = side.getByRole("heading", { level: 2, name: named(name) });
    assert.equal(await heading.count(), 1, `${name} is a heading`);
    const button = heading.getByRole("button", { name: named(name) });
    assert.equal(await button.getAttribute("aria-expanded"), "true", name);
    assert.equal(await button.getAttribute("aria-controls"), `body-${id}`);
    await button.click();
    assert.equal(await button.getAttribute("aria-expanded"), "false", name);
    assert.equal(await page.locator(`#body-${id}`).isHidden(), true, `${name} folded away`);
    assert.equal(await heading.isVisible(), true, `${name}'s heading stays`);
  }
  // History's Undo and Redo stay beside its heading, folded or not.
  assert.equal(await page.locator("#undo").isVisible(), true);
  await page.locator("#side").evaluate((s) => (s.scrollTop = 0));
  assert.deepEqual(await folded(), Object.keys(PANELS).map((id) => `panel-${id}`).sort());

  // Remembered: the playground opened again in this browser has them folded.
  // (A second window on the same storage: the browser's state carried over.)
  const browser = page.context().browser();
  const later = await browser.newContext({ storageState: await page.context().storageState(), viewport: { width: 1400, height: 820 } });
  const again = await later.newPage();
  await again.goto(page.url());
  await again.locator("#panel-outline.folded").waitFor();
  for (const id of Object.keys(PANELS)) assert.equal(await again.locator(`#body-${id}`).isHidden(), true, `panel-${id} remembered`);
  await later.close();

  // A browser that refuses storage: every panel starts open and still folds.
  const refusing = await browser.newPage({ viewport: { width: 1400, height: 820 } });
  const errors = [];
  refusing.on("pageerror", (e) => errors.push(String(e)));
  await refusing.addInitScript(() => Object.defineProperty(window, "localStorage", { get: () => { throw new DOMException("refused", "SecurityError"); } }));
  await refusing.goto(page.url());
  const toteFold = refusing.locator("#panel-tote h2 button.fold");
  await toteFold.waitFor();
  assert.equal(await toteFold.getAttribute("aria-expanded"), "true");
  await toteFold.click();
  assert.equal(await refusing.locator("#body-tote").isHidden(), true);
  assert.deepEqual(errors, [], "no errors without storage");
  await refusing.close();

  // Open again from the keyboard, and the column is as it was.
  for (const name of Object.values(PANELS)) {
    await side.getByRole("heading", { level: 2, name: named(name) }).getByRole("button").focus();
    await page.keyboard.press("Enter");
  }
  assert.deepEqual(await folded(), []);
  for (const id of Object.keys(PANELS)) assert.equal(await page.locator(`#body-${id}`).evaluate((body) => body.hidden), false, `panel-${id} open`);
}

/** A finger held on an element, as a tablet sends it: touch pointer events, held still past the hold time. */
async function pressAndHold(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const x = box.x + 30;
  const y = box.y + box.height / 2;
  const fire = (type) =>
    page.evaluate(
      ({ type, x, y }) => {
        const target = document.elementFromPoint(x, y);
        target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y }));
      },
      { type, x, y },
    );
  await fire("pointerdown");
  await page.waitForTimeout(800);
  await fire("pointerup");
}
