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
  const cell = (name, measure) => line(name).locator(`td[data-measure="${measure}"]`);
  const secondaries = () => page.$$eval("#tote tbody[data-track][tabindex] .tote-name", (names) => names.map((n) => n.textContent));
  const valuesOf = (name) => line(name).locator("td[data-measure]").allInnerTexts();
  const showsValues = (name) =>
    page.waitForFunction(
      (n) => [...document.querySelectorAll("#tote tbody[data-track]")].some((r) => r.querySelector(".tote-name")?.textContent === n && /nmi/.test(r.querySelector('td[data-measure="range"]')?.textContent ?? "")),
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
  assert.equal(await panel.evaluate((d) => d.tagName), "DETAILS");
  assert.equal(await panel.getAttribute("open"), "");
  await tote(".tote-hint").waitFor();
  assert.match(await tote(".tote-hint").innerText(), /Choose a primary track/);
  const before = await steps();

  // The primary, from its list (a pointer's choice).
  await tote(".tote-primary").selectOption({ label: "BLUE ONE" });
  await line("BLUE ONE").waitFor();
  assert.match(await line("BLUE ONE").locator(".tote-role").innerText(), /primary/);
  // A secondary, from the keyboard: Tab to the list to add from, and choose with the arrow keys.
  await tote(".tote-add").focus();
  await page.keyboard.press("ArrowDown"); // "Add a secondary…" → RED ONE, the first not chosen
  await showsValues("RED ONE");
  assert.deepEqual(await secondaries(), ["RED ONE"]);
  // Choosing tracks is view state in the plot's island: never a step in the history.
  assert.equal(await steps(), before, "choosing Tote tracks is no step");

  // The values: range, bearing true, relative bearing red or green, course, speed, depth.
  const red = await valuesOf("RED ONE");
  assert.equal(red.length, 6);
  assert.match(red[0], /^\d+\.\d\d nmi$/);
  assert.match(red[1], /^\d{3}\.\d°T$/);
  assert.match(red[2], /^([RG]\d{3}\.\d|000\.0|180\.0)°$/);
  assert.match(red[3], /^\d{3}\.\d°T$/);
  assert.match(red[4], /^\d+\.\d kn$/);
  assert.match(red[5], /^\d+\.\d m$/, "RED ONE has depths");
  // The primary shows only its own measures: course, speed and depth.
  const blue = await valuesOf("BLUE ONE");
  assert.equal(blue.length, 3);
  assert.match(blue[0], /°T$/);
  assert.match(blue[1], / kn$/);

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
  await page.selectOption("#plots", "serial-1");
  await line("RED ONE").waitFor();
  assert.equal(await tote(".tote-primary").inputValue(), "track-red-one");
  assert.deepEqual(await secondaries(), ["Cargo 04"]);
  // The panel folds away: a summary the keyboard reaches, Enter toggles it.
  await page.locator("#panel-tote > summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(await panel.getAttribute("open"), null);
  await page.keyboard.press("Enter");
  assert.equal(await panel.getAttribute("open"), "");
  // Nothing chosen again, so what follows starts with the side column as it was.
  await line("Cargo 04").getByRole("button", { name: "Remove Cargo 04 from the Tote" }).click();
  await tote(".tote-primary").selectOption({ value: "" });
  await tote(".tote-hint").waitFor();
  await page.waitForTimeout(500);
  return latency;
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
