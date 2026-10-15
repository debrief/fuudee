// The narrative in the playground's Timeline (CAP-05, CAP-19, CAP-20, NFR-06, NFR-13),
// played as a reader would: the sample's log, notes and periods in one quiet table; the
// list follows current time while it plays and stops when the reader scrolls (Follow time
// brings it back); choosing an entry moves current time to it, the one chosen among those
// sharing its second; filter by source and type; search; add, change and delete an entry,
// each one step, undone like any other; all of it from the keyboard too; the entry on the
// map beside its track; a phone. And at the track-heavy volume (60,000 entries), how long
// each part takes, reported.
import assert from "node:assert/strict";
import { narrativeLog } from "./narrativelog.mjs";
import { searchTimeline, timelineRow } from "./timelinerows.mjs";

const state = (page) => page.evaluate(() => window.debriefTimeline());
const timeLabel = (page) => page.locator("#timebar .time-label").innerText();
const historySays = (page, text) => page.locator("#history li", { hasText: text }).first().waitFor({ timeout: 60000 });

/** The row current time is at, and whether it lies wholly within the list's view. */
async function currentInView(page) {
  // Looked at after a frame: while playing fast, current time may move between the list's
  // drawing and this look, so a look that finds it not yet drawn looks again next frame.
  return page.evaluate(async () => {
    let seen = { id: undefined, inView: false };
    for (let i = 0; i < 4 && !seen.inView; i++) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const row = document.querySelector("#timeline .tl-row.tl-current");
      const list = document.querySelector("#timeline .tl-scroll");
      if (!row || !list) continue;
      const r = row.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      seen = { id: row.dataset.id, inView: r.top >= l.top - 1 && r.bottom <= l.bottom + 1 };
    }
    return seen;
  });
}

/** Fold the panels above the Timeline away, as a reader would, and open it; returns how to put them back. */
async function openTimeline(page) {
  const folded = [];
  for (const id of ["panel-tote", "panel-outline", "panel-tools", "panel-try"]) {
    const fold = page.locator(`#${id} button.fold`);
    if ((await fold.count()) && (await fold.getAttribute("aria-expanded")) === "true") {
      await fold.click();
      folded.push(fold);
    }
  }
  const fold = page.locator("#panel-timeline button.fold");
  if ((await fold.getAttribute("aria-expanded")) === "false") await fold.click();
  await page.locator("#panel-timeline").scrollIntoViewIfNeeded();
  return async () => {
    for (const button of folded) if ((await button.getAttribute("aria-expanded")) === "false") await button.click();
  };
}

export async function playNarrative(page, shot) {
  await page.selectOption("#plots", "serial-3");
  await page.waitForFunction(() => document.getElementById("plot-title")?.textContent?.includes("3"));
  const unfold = await openTimeline(page);
  // Notes from the tests before this one are not this one's to show.
  await page.evaluate(() => document.getElementById("toasts")?.replaceChildren());
  const timeline = (selector) => page.locator(`#timeline ${selector}`);
  await timeline(".tl-row[data-id]").first().waitFor();

  // One quiet table: the headings once; each row a time, a source, a type and the entry,
  // with no labels repeated in the rows; a day's date before its first entry.
  // (In the side column, narrow, the entry's text goes under the others: no heading of its own.)
  const headings = await timeline(".tl-head > span").evaluateAll((spans) => spans.filter((s) => s.checkVisibility()).map((s) => s.textContent));
  assert.deepEqual(headings, ["Time", "Source", "Type"]);
  const first = timeline(".tl-row[data-id]").first();
  assert.match(await first.locator(".tl-time").innerText(), /^\d\d:\d\d:\d\dZ$/);
  assert.doesNotMatch(await timeline(".tl-spacer").innerText(), /Source:|Type:|Time:/);
  assert.equal(await timeline(".tl-day").first().innerText(), "15 Jun 2023");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#timeline .tl-time")).fontFamily.toLowerCase().includes("mono")), true, "times are monospaced");
  const initial = await state(page);
  assert.ok(initial.entries > 30 && initial.drawn < initial.entries, "only the rows in sight are drawn");
  // Another plot opened: the list follows current time again, whatever the reader did before.
  assert.equal(initial.following, true);
  // BLUE ONE's entries carry its track's colour; the exercise's control has none.
  assert.ok(await timeline('.tl-row[data-kind="narrative"]:has(.tl-swatch)').count());
  await page.mouse.move(2, 2);
  await shot("narrative-01-timeline");

  // Playing: the list follows current time, keeping its entry in sight, and never takes the keyboard.
  await page.locator("#timebar .tc-speed").selectOption({ label: "3600×" });
  await page.locator("#timebar .tc-play").click();
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(250);
    const now = await currentInView(page);
    if (now.id) seen.add(now.id);
    assert.ok(now.inView, `the entry at current time stays in view while playing (${now.id})`);
  }
  assert.ok(seen.size >= 2, "the entry at current time changed while playing");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("tc-play")), true, "the keyboard stays on Play");
  assert.equal((await state(page)).following, true);
  await shot("narrative-02-playing");
  await page.locator("#timebar .tc-play").click(); // pause
  // Resizing never stops it following: only the reader's own scroll does.
  await page.setViewportSize({ width: 1400, height: 560 });
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.waitForTimeout(300);
  assert.equal((await state(page)).following, true, "resizing the page does not stop following");

  // The reader scrolls the list: it stops following, and says where current time is.
  const scroller = timeline(".tl-scroll");
  const box = await scroller.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 2000);
  await page.waitForFunction(() => window.debriefTimeline().following === false);
  await timeline(".tl-follow:not([hidden])").waitFor();
  assert.match(await timeline(".tl-follow").innerText(), /^↑ Follow time$/);
  // Current time moves on: the list stays where the reader left it.
  const left = await scroller.evaluate((el) => el.scrollTop);
  await page.locator("#timebar .forward").click();
  await page.waitForTimeout(400);
  assert.equal(await scroller.evaluate((el) => el.scrollTop), left, "the list does not fight the reader's scroll");
  await page.mouse.move(2, 2);
  await shot("narrative-03-scrolled-away");
  // Pressing Play follows current time again; scrolling away while it plays stops it again
  // (product owner, 15 Oct 2026).
  await page.locator("#timebar .tc-play").click();
  await page.waitForFunction(() => window.debriefTimeline().following === true && window.debriefTimeline().playing === true);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -2000);
  await page.waitForFunction(() => window.debriefTimeline().following === false);
  await page.locator("#timebar .tc-play").click(); // pause
  await page.waitForFunction(() => window.debriefTimeline().playing === false);
  assert.equal((await state(page)).following, false, "pausing does not follow again");
  await timeline(".tl-follow").click();
  await page.waitForFunction(() => window.debriefTimeline().following === true);
  assert.equal((await currentInView(page)).inView, true);

  // Choosing an entry moves current time to it; among those at one second, the one chosen is marked.
  await searchTimeline(page, "");
  const firstAtStart = timeline('.tl-row[data-id]').filter({ has: page.locator(".tl-time", { hasText: "17:00:00Z" }) }).first();
  await scroller.evaluate((el) => (el.dispatchEvent(new WheelEvent("wheel")), (el.scrollTop = 0)));
  await page.waitForTimeout(100);
  const chosen = await firstAtStart.getAttribute("data-id");
  await firstAtStart.click();
  await page.waitForFunction(() => document.querySelector("#timebar .time-label")?.textContent?.includes("17:00:00Z"));
  await page.waitForFunction((id) => window.debriefTimeline().current === id, chosen);
  const contact = await timelineRow(page, "Bow sonar contact");
  const contactTime = (await contact.locator(".tl-time").innerText()).trim();
  await contact.click();
  await page.waitForFunction((t) => document.querySelector("#timebar .time-label")?.textContent?.includes(t), contactTime);
  assert.equal((await state(page)).current, await contact.getAttribute("data-id"));
  // The map shows the entry beside BLUE ONE's marker, its source first.
  const mapFrame = page.frameLocator(".frame-map");
  await mapFrame.locator(".narrative-box", { hasText: "Bow sonar contact" }).waitFor();
  assert.match(await mapFrame.locator(".narrative-box b").innerText(), /BLUE ONE/);
  await shot("narrative-04-on-the-map");
  // Narrative on the map: the plot's choice, saved in its island, never a step (product
  // owner, 15 Oct 2026). Off, the box goes; on, it comes back.
  const stepsBefore = await page.locator("#history li").count();
  const onMap = timeline(".tl-on-map input");
  assert.equal(await onMap.isChecked(), true);
  await onMap.uncheck();
  await mapFrame.locator(".narrative-box").waitFor({ state: "detached" });
  await page.waitForFunction(() => window.debriefTimeline().narrativeOnMap === false);
  // Saved in the plot: the plot opened again still has it off.
  await page.selectOption("#plots", "serial-1");
  await page.waitForFunction(() => document.getElementById("plot-title")?.textContent?.includes("1"));
  await page.selectOption("#plots", "serial-3");
  await page.waitForFunction(() => document.getElementById("plot-title")?.textContent?.includes("3"));
  await timeline(".tl-row[data-id]").first().waitFor();
  assert.equal(await timeline(".tl-on-map input").isChecked(), false, "the plot keeps the map's narrative box off");
  await timeline(".tl-on-map input").check();
  await page.waitForFunction(() => window.debriefTimeline().narrativeOnMap === true);
  const again = await timelineRow(page, "Bow sonar contact");
  await again.click();
  await mapFrame.locator(".narrative-box", { hasText: "Bow sonar contact" }).waitFor();
  assert.equal(await page.locator("#history li").count(), stepsBefore, "turning it off and on is never a step");

  // Filter by source and by type; the status says how many are listed of how many.
  await timeline(".tl-filter-button").click();
  await timeline('.tl-filter input[data-member="sources"][data-name="BLUE ONE"]').uncheck();
  await page.waitForFunction(() => document.querySelector("#timeline .tl-status")?.textContent?.includes(" of "));
  assert.equal(await timeline('.tl-row[data-id] .tl-source:text-is("BLUE ONE")').count(), 0);
  assert.equal(await timeline(".tl-filter-button").innerText(), "Filter (1)");
  assert.equal((await state(page)).following, true, "filtering does not stop following");
  await timeline('.tl-filter input[data-member="types"][data-name="Course"]').uncheck();
  assert.equal(await timeline('.tl-row[data-id] .tl-type:text-is("Course")').count(), 0);
  await page.mouse.move(2, 2);
  await shot("narrative-05-filtered");
  await timeline(".tl-show-all").click();
  await page.waitForFunction(() => window.debriefTimeline().listed === window.debriefTimeline().entries);
  await timeline(".tl-filter-button").click();

  // Search: matches marked; Escape clears it.
  await searchTimeline(page, "sprint");
  const found = await state(page);
  assert.ok(found.listed > 0 && found.listed < found.entries);
  assert.ok(await timeline(".tl-row mark").count());
  await page.mouse.move(2, 2);
  await shot("narrative-06-search");
  await timeline(".tl-search").press("Escape");
  await page.waitForFunction(() => window.debriefTimeline().listed === window.debriefTimeline().entries);

  // Add an entry through the form: one step, on BLUE ONE's track, in its place on the axis.
  const steps = () => page.locator("#history li").count();
  const before = await steps();
  await timeline(".tl-add").click();
  const form = (name) => timeline(`.tl-form [name="${name}"]`);
  assert.match(await form("time").inputValue(), /^\d{1,2} Jun 2023 \d\d:\d\d:\d\dZ$/, "the time starts at current time");
  await form("time").fill("15 Jun 2023 17:31:00Z");
  await form("source").fill("BLUE ONE");
  assert.equal(await form("track").inputValue(), "track-blue-one", "the track follows the source's name");
  await form("type").fill("Comms");
  await form("text").fill("Link check with control: loud and clear.");
  await page.mouse.move(2, 2);
  await shot("narrative-07-form");
  const entriesBefore = (await state(page)).entries;
  const addStarted = Date.now();
  await timeline(".tl-form .tl-primary").click();
  await page.waitForFunction((n) => window.debriefTimeline().entries === n + 1, entriesBefore);
  const smallAddMs = Date.now() - addStarted;
  await historySays(page, "Narrative entry by BLUE ONE at 17:31:00Z added");
  assert.equal(await steps(), before + 1);
  const added = timeline(".tl-row.tl-active");
  await added.waitFor();
  assert.match(await added.innerText(), /Link check with control/);
  assert.equal(await added.locator(".tl-swatch").count(), 1);

  // Change it: Edit on the row; one more step.
  await added.locator(".tl-edit").click();
  await form("text").fill("Link check with control: loud and clear, both nets.");
  await timeline(".tl-form .tl-primary").click();
  await historySays(page, "Narrative entry by BLUE ONE at 17:31:00Z: text changed");
  // A time that cannot be read is refused in the form, saying how to write one; nothing is changed.
  await timeline(".tl-add").click();
  await form("time").fill("half past five");
  await form("source").fill("CONTROL");
  await form("text").fill("Never saved.");
  await timeline(".tl-form .tl-primary").click();
  await timeline(".tl-form-error", { hasText: "Give the time as" }).waitFor();
  await form("text").press("Escape");
  assert.equal(await timeline(".tl-form").isHidden(), true);

  // The keyboard: the list takes it; arrows move through it without moving time, so
  // following stops; Enter moves current time; F2 changes; Delete deletes; N adds.
  await scroller.focus();
  const label = await timeLabel(page);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  assert.equal(await timeLabel(page), label, "moving through the list leaves current time alone");
  assert.equal((await state(page)).following, false);
  const active = await scroller.getAttribute("aria-activedescendant");
  assert.ok(active && (await page.locator(`#${active}`).getAttribute("aria-selected")) === "true");
  await page.keyboard.press("Enter");
  await page.waitForFunction((l) => document.querySelector("#timebar .time-label")?.textContent !== l, label);
  assert.equal((await state(page)).following, true, "choosing an entry follows time again");
  // To the entry added, by searching for it, then back to the list.
  await searchTimeline(page, "both nets");
  await scroller.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("F2");
  assert.match(await form("text").inputValue(), /both nets/);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await historySays(page, "Narrative entry by BLUE ONE at 17:31:00Z deleted");
  await page.waitForFunction(() => window.debriefTimeline().listed === 0);
  await timeline(".tl-empty", { hasText: "Nothing matches" }).waitFor();
  // Undone like any step, by Ctrl+Z in the Timeline (product owner, 15 Oct 2026); but in
  // the search box Ctrl+Z edits the search, never the plot.
  const entriesNow = (await state(page)).entries;
  await timeline(".tl-search").focus();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(800);
  assert.equal((await state(page)).entries, entriesNow, "Ctrl+Z in the search box leaves the plot alone");
  await searchTimeline(page, "both nets");
  await scroller.focus();
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => window.debriefTimeline().listed === 1);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("tl-scroll")), true, "the list keeps the keyboard");
  // Ctrl+Shift+Z redoes and Ctrl+Z undoes again, from the list.
  await page.keyboard.press("Control+Shift+z");
  await page.waitForFunction(() => window.debriefTimeline().listed === 0);
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => window.debriefTimeline().listed === 1);
  await timeline(".tl-search").press("Escape");
  await scroller.focus();
  await page.keyboard.press("n");
  await timeline(".tl-form:not([hidden])").waitFor();
  await page.keyboard.press("Escape");
  // Deleting from the keyboard keeps its place: on the entry after, which takes its place.
  await scroller.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 40 && (await page.locator(`#${await scroller.getAttribute("aria-activedescendant")}`).getAttribute("data-kind")) !== "narrative"; i++) {
    await page.keyboard.press("ArrowDown");
  }
  const place = await scroller.evaluate((list) => {
    const rows = [...list.querySelectorAll(".tl-row[data-id]")].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const at = rows.findIndex((r) => r.id === list.getAttribute("aria-activedescendant"));
    return { gone: rows[at].dataset.id, next: rows[at + 1].dataset.id };
  });
  const stepsNow = await steps();
  await page.keyboard.press("Delete");
  await page.waitForFunction((n) => document.querySelectorAll("#history li").length > n, stepsNow);
  await page.waitForFunction((id) => window.debriefTimeline().active === id, place.next);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("tl-scroll")), true, "the list keeps the keyboard");
  await page.locator("#undo").click();
  await page.waitForFunction((id) => window.debriefTimeline().entries > 0 && document.querySelector(`#timeline .tl-row[data-id="${id}"]`) !== null, place.gone).catch(() => undefined);

  // On a phone: one column for the text under time, source and type; the page never
  // scrolls sideways; a tap moves current time.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#panel-timeline").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "the page does not scroll sideways on a phone");
  assert.equal(await timeline(".tl-scroll").evaluate((el) => el.scrollWidth <= el.clientWidth), true, "nor the list");
  assert.equal(await page.locator("#timeline").evaluate((el) => el.classList.contains("tl-narrow")), true);
  const tapped = await timelineRow(page, "Serial 3 started");
  await tapped.click();
  await page.waitForFunction(() => document.querySelector("#timebar .time-label")?.textContent?.includes("17:00:00Z"));
  await page.mouse.move(2, 2);
  await shot("narrative-08-phone");
  await page.setViewportSize({ width: 1400, height: 820 });
  await unfold(); // the panels as the tests after this one expect them
  console.log(`Timeline: ${initial.entries} entries in serial 3, ${initial.drawn} drawn; followed while playing through ${seen.size} entries; an entry added through the form and shown in ${smallAddMs} ms.`);
}

/**
 * At the track-heavy volume profile (NFR-06): 60,000 entries read into a plot, then the
 * list drawn, scrolled, searched and followed while playing. Reported; the bounds asserted
 * are generous, for a slow machine.
 */
export async function playNarrativeAtScale(page, shot) {
  await page.selectOption("#plots", "serial-2");
  await page.waitForFunction(() => document.getElementById("plot-title")?.textContent?.includes("2"));
  await openTimeline(page);
  // First the typical narrative (a few hundred entries, two thousand at most: product
  // owner, 15 Oct 2026): read in, then an entry added through the form and undone.
  const typical = 2_000;
  let started = Date.now();
  await page.locator("#narrative-file").setInputFiles({ name: "typical-log.rep", mimeType: "text/plain", buffer: Buffer.from(narrativeLog(typical)) });
  await page.locator(".toast", { hasText: `Read ${typical} narrative entries into the plot` }).waitFor({ timeout: 120000 });
  const typicalImportS = (Date.now() - started) / 1000;
  await page.waitForFunction((n) => window.debriefTimeline().entries >= n, typical);
  await page.locator("#timeline .tl-add").click();
  await page.locator('#timeline .tl-form [name="source"]').fill("CONTROL");
  await page.locator('#timeline .tl-form [name="text"]').fill("Typical-size check.");
  const entriesBefore = (await state(page)).entries;
  started = Date.now();
  await page.locator("#timeline .tl-form .tl-primary").click();
  await page.waitForFunction((n) => window.debriefTimeline().entries === n + 1, entriesBefore);
  const typicalAddMs = Date.now() - started;
  started = Date.now();
  await page.locator("#undo").click();
  await page.waitForFunction((n) => window.debriefTimeline().entries === n, entriesBefore);
  const typicalUndoMs = Date.now() - started;
  console.log(
    `Timeline at ${typical.toLocaleString("en-GB")} entries (typical): read into the plot and shown in ${typicalImportS.toFixed(1)} s (Pyodide); ` +
      `an entry added through the form and shown in ${typicalAddMs} ms; undone in ${typicalUndoMs} ms.`,
  );
  assert.ok(typicalImportS < 15, `a typical narrative is read in ${typicalImportS} s`);

  const count = 60_000;
  started = Date.now();
  await page.locator("#narrative-file").setInputFiles({ name: "exercise-log.rep", mimeType: "text/plain", buffer: Buffer.from(narrativeLog(count)) });
  await page.locator(".toast", { hasText: `Read ${count} narrative entries into the plot` }).waitFor({ timeout: 600000 });
  const importS = (Date.now() - started) / 1000;
  await page.waitForFunction((n) => window.debriefTimeline().entries >= n, count);
  const opened = await state(page);
  const buildMs = Math.max(...opened.drawTimes.slice(-2));
  // Scrolling by the wheel: the time between frames.
  const scroller = page.locator("#timeline .tl-scroll");
  const box = await scroller.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => {
    window.frameGaps = [];
    let last = performance.now();
    const tick = (now) => {
      window.frameGaps.push(now - last);
      last = now;
      if (window.frameGaps.length < 600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(300);
  const gaps = (await page.evaluate(() => window.frameGaps.slice(3))).sort((a, b) => a - b);
  const pick = (p) => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))];
  await page.mouse.move(2, 2);
  await shot("narrative-09-sixty-thousand");
  // Searching all of them.
  started = Date.now();
  await page.locator("#timeline .tl-search").fill("Marker");
  await page.waitForFunction(() => window.debriefTimeline().listed < 1000);
  const searchMs = Date.now() - started - 90; // less the pause the search waits for typing to stop
  await page.locator("#timeline .tl-search").press("Escape");
  // Playing, following current time through them: how long each change of the list's place took.
  await page.locator("#timeline .tl-follow").click().catch(() => undefined);
  await page.evaluate(() => (window.debriefTimeline().drawTimes.length = 0));
  await page.locator("#timebar .tc-speed").selectOption({ label: "60×" });
  await page.locator("#timebar .tc-play").click();
  const ids = new Set();
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(250);
    const now = await currentInView(page);
    ids.add(now.id);
    assert.ok(now.inView, `at 60,000 entries the entry at current time stays in view while playing: ${JSON.stringify({ now, state: await state(page) })}`);
  }
  await page.locator("#timebar .tc-play").click();
  console.log(
    `Timeline at ${count.toLocaleString("en-GB")} entries (NFR-06): read into the plot and shown in ${importS.toFixed(1)} s (Pyodide); ` +
      `list built in ${buildMs.toFixed(0)} ms; ${opened.drawn} rows drawn; scrolling, frame gaps p50 ${pick(0.5).toFixed(1)} ms, p95 ${pick(0.95).toFixed(1)} ms, ` +
      `max ${pick(1).toFixed(1)} ms; search ${searchMs} ms; followed ${ids.size} entries while playing at 60×.`,
  );
  assert.ok(opened.drawn < 100, "only the rows in sight are drawn");
  assert.ok(buildMs < 500, `the list is built in ${buildMs} ms`);
  assert.ok(pick(0.95) < 50, `scrolling stays smooth: p95 frame gap ${pick(0.95)} ms`);
}

/**
 * The Timeline as VS Code's sidebar shows it: the webview bundle in a page of the
 * sidebar's width, given the host's messages as the extension sends them.
 */
/** The narrative of a plot as the extension sends it to the Timeline, in its order (src/timeline.ts). */
function timelineMessage(plot) {
  const colours = new Map(plot.features.filter((f) => f.properties.kind === "track").map((f) => [f.id, f.properties.style?.colour]));
  const rows = plot.features
    .map((f, index) => ({ f, index }))
    .filter(({ f }) => f.properties.kind === "narrative")
    .map(({ f, index }) => {
      const p = f.properties;
      const entry = { id: f.id, kind: "narrative", start: p.time, source: p.source, text: p.text };
      if (p.entry_type) entry.entry_type = p.entry_type;
      if (p.track_id) Object.assign(entry, { track: p.track_id }, colours.get(p.track_id) ? { colour: colours.get(p.track_id) } : {});
      return { entry, ms: Date.parse(p.time), index };
    })
    .sort((a, b) => a.ms - b.ms || (a.entry.source.toLowerCase() < b.entry.source.toLowerCase() ? -1 : a.entry.source.toLowerCase() > b.entry.source.toLowerCase() ? 1 : a.index - b.index));
  const tracks = plot.features.filter((f) => f.properties.kind === "track").map((f) => ({ id: f.id, name: f.properties.name, colour: f.properties.style?.colour }));
  const start = rows[0].entry.start;
  return { kind: "show_timeline", timeline_entries: rows.map((r) => r.entry), timeline_tracks: tracks, time: { current: rows[6].entry.start, range: { start, end: rows.at(-1).entry.start } } };
}

export async function vscodeTimelineView(browser, files, errors, shot, plot) {
  const view = await browser.newPage({ viewport: { width: 280, height: 420 }, colorScheme: "dark" });
  view.on("pageerror", (e) => errors.push(String(e)));
  const posted = [];
  await view.exposeFunction("tellTest", (message) => posted.push(message));
  await view.route("**/timeline-view.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body:
        `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><link rel="stylesheet" href="timeline.css">` +
        `<style>:root { --vscode-font-family: system-ui, Ubuntu, "Droid Sans", sans-serif; --vscode-font-size: 13px; --vscode-editor-font-family: "Droid Sans Mono", monospace; --vscode-foreground: #ccc; --vscode-descriptionForeground: #9d9d9d; --vscode-sideBar-background: #181818; --vscode-focusBorder: #0078d4; --vscode-input-background: #313131; --vscode-input-foreground: #ccc; --vscode-widget-border: #313131; --vscode-list-hoverBackground: #2a2d2e; --vscode-list-inactiveSelectionBackground: #37373d; --vscode-list-highlightForeground: #2aaaff; --vscode-textLink-foreground: #4daafc; --vscode-button-background: #0078d4; --vscode-button-foreground: #fff; }</style>` +
        `</head><body><div id="root"></div><script>let s; window.acquireVsCodeApi = () => ({ postMessage: (m) => window.tellTest(m), getState: () => s, setState: (v) => (s = v) });</script>` +
        `<script src="timeline.js"></script></body></html>`,
    }),
  );
  await view.goto(`http://127.0.0.1:${files.address().port}/timeline-view.html`);
  for (let i = 0; i < 50 && !posted.some((m) => m.kind === "ready"); i++) await view.waitForTimeout(100);
  // The sample's first serial, as the extension sends it.
  await view.evaluate((m) => window.postMessage(m, "*"), timelineMessage(plot));
  await view.locator(".tl-row[data-id]").first().waitFor();
  // Never wider than the sidebar, at any width or font: measured, so a failure says by how much.
  const widths = [];
  const noSideways = async (what) => {
    await view.waitForTimeout(300); // the list laid out again for its new width
    const [page, list] = await view.evaluate(() => [document.documentElement, document.querySelector(".tl-scroll")].map((el) => [el.scrollWidth, el.clientWidth]));
    widths.push(`${what}: page ${page[0]}/${page[1]} px, list ${list[0]}/${list[1]} px`);
    assert.ok(page[0] <= page[1] && list[0] <= list[1], `${what}, the view does not scroll sideways: page scrollWidth ${page[0]} px in ${page[1]} px, list ${list[0]} px in ${list[1]} px`);
  };
  await noSideways("at 280 px");
  assert.equal(await view.locator(".tl").evaluate((el) => el.classList.contains("tl-narrow")), true);
  for (const width of [210, 390]) {
    await view.setViewportSize({ width, height: 420 });
    await noSideways(`at ${width} px`);
  }
  // A wider font than this machine's, as some have (the CI runner's once overflowed 280 px).
  const wide = await view.addStyleTag({ content: "* { letter-spacing: 0.1em !important } .tl, .tl * { font-size: 15px !important }" });
  for (const width of [210, 280, 390]) {
    await view.setViewportSize({ width, height: 420 });
    await noSideways(`in a wide font at ${width} px`);
  }
  // The extras' menu open, the time hidden, unwrapped: still never sideways (CAP-05).
  await view.locator(".tl-view-button").click();
  await view.locator('input[data-column="time"]').uncheck();
  await view.locator('input[data-view="wrap"]').uncheck();
  for (const width of [210, 280, 390]) {
    await view.setViewportSize({ width, height: 420 });
    await noSideways(`in a wide font, the menu open, at ${width} px`);
  }
  await wide.evaluate((style) => style.remove());
  await view.setViewportSize({ width: 280, height: 420 });
  await view.locator(".tl-highlights").fill("sonar, contact");
  await view.waitForTimeout(400);
  await view.mouse.move(2, 2);
  await shot("narrative-b-05-vscode-menu", view);
  await view.locator(".tl-highlights").fill("");
  await view.waitForTimeout(400);
  // The largest text, in this machine's font.
  for (let i = 0; i < 3; i++) await view.locator('[data-size="up"]').click();
  for (const width of [210, 280, 390]) {
    await view.setViewportSize({ width, height: 420 });
    await noSideways(`at 18 px text, the menu open, at ${width} px`);
  }
  // The reader's own, kept with the view (VS Code's webview state), never sent to the host.
  const kept = await view.evaluate(() => window.acquireVsCodeApi().getState());
  assert.deepEqual(kept.filter.view, { highlights: [], moveTime: true, textSize: 18, wrap: false, hidden: ["time"] });
  assert.ok(!posted.some((m) => JSON.stringify(m).includes("textSize")));
  for (let i = 0; i < 3; i++) await view.locator('[data-size="down"]').click();
  await view.locator('input[data-column="time"]').check();
  await view.locator('input[data-view="wrap"]').check();
  await view.locator(".tl-view-button").click();
  await view.setViewportSize({ width: 280, height: 420 });
  console.log(`Timeline view widths (scrollWidth/clientWidth): ${widths.join("; ")}.`);
  await view.waitForTimeout(300);
  await shot("narrative-vscode-view", view);
  // Choosing an entry tells the host; the form saves through it.
  await view.locator(".tl-row[data-id]").nth(2).click();
  for (let i = 0; i < 20 && !posted.some((m) => m.kind === "timeline_chosen"); i++) await view.waitForTimeout(50);
  assert.ok(posted.some((m) => m.kind === "timeline_chosen"));
  // Ctrl+Z and Ctrl+Y in the list ask the host to undo and redo the plot; in the search
  // box they edit the search, asking nothing (product owner, 15 Oct 2026).
  const asked = () => posted.filter((m) => m.kind === "undo_asked" || m.kind === "redo_asked").map((m) => m.kind);
  await view.locator(".tl-scroll").focus();
  await view.keyboard.press("Control+z");
  await view.keyboard.press("Control+y");
  for (let i = 0; i < 20 && asked().length < 2; i++) await view.waitForTimeout(50);
  assert.deepEqual(asked(), ["undo_asked", "redo_asked"]);
  await view.locator(".tl-search").fill("sonar");
  await view.keyboard.press("Control+z");
  await view.waitForTimeout(300);
  assert.deepEqual(asked(), ["undo_asked", "redo_asked"], "Ctrl+Z in the search box asks nothing of the host");
  assert.equal(await view.locator(".tl-search").inputValue(), "", "it undoes the typing");
  await view.locator(".tl-search").press("Escape");
  await view.evaluate(() => window.postMessage({ kind: "open_narrative_form" }, "*"));
  await view.locator(".tl-form [name=source]").fill("CONTROL");
  await view.locator(".tl-form [name=text]").fill("Serial paused for weather.");
  await view.locator(".tl-form .tl-primary").click();
  for (let i = 0; i < 20 && !posted.some((m) => m.kind === "save_narrative"); i++) await view.waitForTimeout(50);
  const saved = posted.find((m) => m.kind === "save_narrative");
  assert.equal(saved.narrative.source, "CONTROL");
  assert.equal(saved.narrative.track_id, null);
  // The host refuses it: the form says why and stays open.
  await view.evaluate(() => window.postMessage({ kind: "narrative_saved", message: "The plot was changed elsewhere, so nothing was changed." }, "*"));
  await view.locator(".tl-form-error", { hasText: "changed elsewhere" }).waitFor();
  // The same plot shown again (a change to it) keeps the reader's place; another plot is
  // read from current time; Play follows current time again.
  const following = async () => !(await view.locator(".tl-follow").isVisible());
  const scrollAway = async () => {
    const list = view.locator(".tl-scroll");
    const box = await list.boundingBox();
    await view.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await view.mouse.wheel(0, 3000);
    await view.locator(".tl-follow:not([hidden])").waitFor();
    // The wheel's own scrolling over, as a reader's hand would be, before the host speaks.
    await view.waitForTimeout(800);
  };
  const message = { ...timelineMessage(plot), plot_id: "sample/serial-1" };
  await view.evaluate((m) => window.postMessage(m, "*"), message);
  await view.locator(".tl-form .tl-cancel").click().catch(() => undefined);
  await scrollAway();
  await view.evaluate((m) => window.postMessage(m, "*"), message);
  await view.waitForTimeout(200);
  assert.equal(await following(), false, "the same plot shown again keeps the reader's place");
  await view.evaluate((m) => window.postMessage({ ...m, plot_id: "sample/serial-2" }, "*"), message);
  await view.locator(".tl-follow").waitFor({ state: "hidden" });
  await scrollAway();
  await view.evaluate(() => window.postMessage({ kind: "playing_changed", playing: true }, "*"));
  await view.locator(".tl-follow").waitFor({ state: "hidden" });
  // The narrative box on the map: as the plot says, and the analyst's choice told to the host.
  await view.evaluate((m) => window.postMessage({ ...m, narrative_on_map: false }, "*"), message);
  assert.equal(await view.locator(".tl-on-map input").isChecked(), false);
  await view.locator(".tl-on-map input").check();
  for (let i = 0; i < 20 && !posted.some((m) => m.kind === "narrative_on_map_changed"); i++) await view.waitForTimeout(50);
  assert.deepEqual(posted.find((m) => m.kind === "narrative_on_map_changed"), { kind: "narrative_on_map_changed", narrative_on_map: true });
  // No plot: it says how to start.
  await view.evaluate(() => window.postMessage({ kind: "show_timeline" }, "*"));
  await view.locator(".tl-empty", { hasText: "Open a plot" }).waitFor();
  await view.close();
}
