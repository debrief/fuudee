// Narrative part B in the playground (CAP-19, CAP-05), played as a reader would: a Word
// narrative read into the open plot, the reader asked first what legacy Debrief asked
// (which types, only within the plot's period, which track an unknown platform is), one
// question at a time as VS Code asks them (PAR-10), one step, undone like any other; then the Timeline's extras, the reader's own: highlighted
// phrases, choosing an entry without moving current time, text size and wrapping, which
// columns show, on a phone too. The log is synthetic, made up for the sample (DEV-05).
import { resizeTo, showPanel } from "./dock.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { timelineRow } from "./timelinerows.mjs";
import { asking, choose, form } from "./questions.mjs";

const state = (page) => page.evaluate(() => window.debriefTimeline());
const timeLabel = (page) => page.locator("#timebar .time-label").innerText();
const LOG = path.join(import.meta.dirname, "red-one-log.docx");

/**
 * The Timeline in view, as a reader would bring it: docked, its tab to the front (it has a place
 * of its own under the map); narrow, the panels above it folded away and it opened. Returns how to
 * put them back.
 */
async function openTimeline(page) {
  if (await page.evaluate(() => document.body.classList.contains("docked"))) {
    await showPanel(page, "timeline");
    return async () => undefined;
  }
  const folded = [];
  for (const id of ["panel-tote", "panel-outline", "panel-tools"]) {
    const fold = page.locator(`#${id} button.fold`);
    if ((await fold.count()) && (await fold.getAttribute("aria-expanded")) === "true") {
      await fold.click();
      folded.push(fold);
    }
  }
  await showPanel(page, "timeline");
  return async () => {
    for (const button of folded) if ((await button.getAttribute("aria-expanded")) === "false") await button.click();
  };
}

export async function playWordNarrative(page, shot) {
  await page.selectOption("#plots", "serial-3");
  await page.waitForFunction(() => document.getElementById("plot-title")?.textContent?.includes("3"));
  const unfold = await openTimeline(page);
  await page.locator("#timeline .tl-row[data-id]").first().waitFor();
  const before = (await state(page)).entries;
  const steps = await page.locator("#history li").count();

  // The file chosen under Import: the reader is asked what legacy Debrief asked, one question at
  // a time, as VS Code's QuickPicks ask it (PAR-10): the types, the plot's period, BLUE TWO's track.
  const started = Date.now();
  await page.locator("#narrative-file").setInputFiles(LOG);
  const types = form(page, "Read which types from red-one-log.docx?");
  await types.waitFor({ timeout: 60000 });
  assert.match(await types.locator(".form-info").innerText(), /Word document, read as a narrative log: 7 entries/);
  // Its types with how many of each, every one ticked.
  assert.deepEqual(await types.locator(".form-check > span:not(.form-note)").allInnerTexts(), ["OOW COMMENT 3 entries", "SONAR 2 entries", "COMMS 1 entry", "FCS 1 entry"]);
  await types.getByRole("checkbox", { name: /^FCS/ }).uncheck();
  await page.mouse.move(2, 2);
  await shot("narrative-b-01-word-questions");
  await types.getByRole("button", { name: "OK" }).click();
  await asking(page).waitFor();
  assert.match(await page.locator("#ask-title").innerText(), /outside the plot's period$/);
  await choose(page, "Only the 6 within the plot's period");
  await asking(page).locator("#ask-title", { hasText: "Which track is BLUE TWO's?" }).waitFor();
  assert.deepEqual(await asking(page).locator("#ask-buttons > button").allInnerTexts().then((o) => [o[0], o.at(-2), o.at(-1)]), ["BLUE ONE", "No track", "Cancel"]);
  await choose(page, "No track");
  // One step, named in the History; five entries: no FCS, none after the serial.
  await page.locator("#history li", { hasText: "Narrative read from red-one-log.docx" }).first().waitFor({ timeout: 60000 });
  const readMs = Date.now() - started;
  await page.waitForFunction((n) => window.debriefTimeline().entries === n + 5, before);
  assert.equal(await page.locator("#history li").count(), steps + 1);
  await page.locator(".toast", { hasText: "Read 5 narrative entries into the plot" }).first().waitFor();
  // RED ONE's entries belong to its track; the continuation joined its entry.
  const sonar = await timelineRow(page, "Classified as BLUE ONE");
  assert.match(await sonar.innerText(), /SONAR/);
  assert.match(await sonar.locator(".tl-text").innerText(), /Contact held on the towed array/);
  assert.equal(await sonar.locator(".tl-swatch").count(), 1, "RED ONE's entry has its track's colour");
  await showPanel(page, "timeline");
  await page.mouse.move(2, 2);
  await shot("narrative-b-02-word-read");

  await playTimelineExtras(page, shot);

  // Undone as one step: the whole log goes.
  await page.locator("#undo").click();
  await page.waitForFunction((n) => window.debriefTimeline().entries === n, before);

  // Read again: last time's answers are offered, kept in the page's settings (never the
  // plot), and Enter confirms them; Cancel reads nothing.
  await page.locator("#narrative-file").setInputFiles(LOG);
  await asking(page).locator("#ask-title", { hasText: "Read red-one-log.docx" }).waitFor({ timeout: 60000 });
  const last = asking(page).locator("#ask-buttons > button").first();
  assert.match(await last.innerText(), /^Read as last time\nAll types but FCS; only within the plot's period; BLUE TWO on no track$/);
  assert.equal(await last.getAttribute("class"), "primary", "Enter reads as last time");
  await asking(page).locator("#ask-buttons > button").last().click(); // the dialog's Cancel
  await page.locator(".toast", { hasText: "Nothing was read." }).first().waitFor();
  assert.equal((await state(page)).entries, before);

  await playReadAgain(page, shot, before);
  await unfold();
  console.log(`Word narrative: read into serial 3 in ${readMs} ms (questions answered by the test), undone as one step.`);
}

/**
 * The same document read in again, under another name (product owner, 15 Oct 2026): known
 * by its content, the form says when it was read in and how many of its entries are in the
 * plot, and its action skips them; Cancel reads nothing. Left as it was found.
 */
async function playReadAgain(page, shot, before) {
  const steps = await page.locator("#history li").count();
  await page.locator("#narrative-file").setInputFiles(LOG);
  // A document new to the plot is not said to be in it: last time's answers are asked first.
  await asking(page).locator("#ask-title", { hasText: "Read red-one-log.docx" }).waitFor({ timeout: 60000 });
  await choose(page, "Read as last time"); // five entries
  await page.waitForFunction((n) => window.debriefTimeline().entries === n + 5, before);
  const copy = { name: "red-one-log (2).docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: readFileSync(LOG) };
  await page.locator("#narrative-file").setInputFiles(copy);
  // Said first, its own question: when it was read in, how many of its entries are in the plot.
  await asking(page).locator("#ask-title", { hasText: "red-one-log (2).docx is already in the plot" }).waitFor({ timeout: 60000 });
  assert.match(await page.locator("#ask-text").innerText(), /^Read in on .+ \(step \d+, Narrative read from red-one-log\.docx\)\. 5 of its 7 entries are in the plot\.$/);
  assert.deepEqual(await asking(page).locator("#ask-buttons > button").allInnerTexts(), ["Skip entries already in the plot\nRead the 2 entries not in the plot", "Cancel\nRead nothing", "Cancel"]);
  await page.evaluate(() => document.getElementById("toasts")?.replaceChildren());
  await page.mouse.move(2, 2);
  await shot("narrative-f-01-already-in-plot");
  // Cancel reads nothing.
  await choose(page, "Cancel");
  await page.locator(".toast", { hasText: "Nothing was read." }).first().waitFor();
  assert.equal((await state(page)).entries, before + 5);
  // Every type, every entry this time: the two not in the plot are read, the five skipped.
  await page.locator("#narrative-file").setInputFiles(copy);
  await choose(page, "Skip entries already in the plot");
  await asking(page).locator("#ask-title", { hasText: "Read red-one-log (2).docx" }).waitFor({ timeout: 60000 });
  await choose(page, "Choose again");
  const types = form(page, "Read which types from red-one-log (2).docx?");
  await types.getByRole("checkbox", { name: /^FCS/ }).check();
  await types.getByRole("button", { name: "OK" }).click();
  await asking(page).locator("#ask-title", { hasText: "outside the plot's period" }).waitFor();
  // Last time's answer first, chosen by Enter.
  assert.match(await asking(page).locator("#ask-buttons > button").first().innerText(), /^Only the 6 within/);
  await choose(page, "All 7 entries");
  await asking(page).locator("#ask-title", { hasText: "Which track is BLUE TWO's?" }).waitFor();
  assert.equal(await asking(page).locator("#ask-buttons > button").first().innerText(), "No track", "last time's track first");
  await choose(page, "No track");
  await page.locator(".toast", { hasText: "Read 2 narrative entries into the plot." }).first().waitFor({ timeout: 60000 });
  await page.waitForFunction((n) => window.debriefTimeline().entries === n + 7, before);
  assert.equal(await page.locator("#history li").count(), steps + 2);
  // Both reads undone: as found.
  await page.locator("#undo").click();
  await page.waitForFunction((n) => window.debriefTimeline().entries === n + 5, before);
  await page.locator("#undo").click();
  await page.waitForFunction((n) => window.debriefTimeline().entries === n, before);
}

/** The Timeline's extras, the reader's own, from the menu (⋯). Left as the Timeline's own afterwards. */
async function playTimelineExtras(page, shot) {
  const timeline = (selector, options) => page.locator(`#timeline ${selector}`, options);
  const menu = timeline(".tl-view");
  const button = timeline(".tl-view-button");
  assert.equal(await menu.isHidden(), true, "the bar stays quiet: the extras are in a menu");
  await button.click();
  assert.equal(await button.getAttribute("aria-expanded"), "true");
  await menu.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("tl-highlights")), true, "the menu takes the keyboard");
  assert.equal(await timeline(".tl-view-label").innerText(), "Highlight", "the phrases' box has a visible label");

  // Highlights: phrases the reader names, marked wherever they are, case ignored.
  await timeline(".tl-highlights").fill("contact, towed array");
  await page.waitForFunction(() => window.debriefTimeline().view.highlights.length === 2);
  const lit = await timelineRow(page, "Classified as BLUE ONE");
  assert.deepEqual(await lit.locator("mark.tl-hl").allInnerTexts(), ["Contact", "Contact", "towed array"]);
  assert.match(await lit.getAttribute("aria-label"), /, highlighted$/);
  assert.equal(await button.evaluate((b) => b.classList.contains("tl-on")), true, "the button says the view is the reader's own");
  await page.evaluate(() => document.getElementById("toasts")?.replaceChildren());
  await page.mouse.move(2, 2);
  await shot("narrative-b-03-highlights");

  // Choosing an entry without moving current time.
  await timeline('input[data-view="moveTime"]').uncheck();
  assert.doesNotMatch(await timeline(".tl-status").innerText(), /Choosing an entry/, "the switch is seen: the status does not repeat it");
  const label = await timeLabel(page);
  const row = await timelineRow(page, "Came to 180");
  await row.click();
  await page.waitForFunction((id) => window.debriefTimeline().active === id, await row.getAttribute("data-id"));
  assert.equal(await timeLabel(page), label, "choosing an entry leaves current time where it is");
  // The row worked with shows its Edit and Delete, wholly in the list's sight.
  const actions = await row.locator(".tl-actions").boundingBox();
  const list = await timeline(".tl-scroll").boundingBox();
  assert.ok(actions && list && actions.y + actions.height <= list.y + list.height + 0.5, `Edit and Delete in sight (${JSON.stringify(actions)} in ${JSON.stringify(list)})`);
  await timeline(".tl-scroll").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  assert.equal(await timeLabel(page), label, "Enter too");
  const openMenu = async () => (await menu.isHidden()) && (await button.click());
  await openMenu();
  await timeline('input[data-view="moveTime"]').check();
  await (await timelineRow(page, "Came to 180")).click();
  await page.waitForFunction((l) => document.querySelector("#timebar .time-label")?.textContent !== l, label);

  // Text size and wrapping; the columns shown. Never sideways, at any size.
  await openMenu();
  const larger = timeline('[data-size="up"]');
  await larger.click();
  await larger.click();
  assert.equal((await state(page)).view.textSize, 16);
  assert.equal(await timeline(".tl-text").first().evaluate((el) => getComputedStyle(el).fontSize), "16px");
  await timeline('input[data-view="wrap"]').uncheck();
  assert.equal(await timeline(".tl-text").first().evaluate((el) => getComputedStyle(el).whiteSpace), "nowrap");
  await timeline('input[data-column="type"]').uncheck();
  assert.equal(await timeline(".tl-row[data-id] .tl-type").first().isVisible(), false);
  assert.equal(await timeline(".tl-head-type").isVisible(), false);
  const noSideways = async (what) => {
    await page.waitForTimeout(300);
    const [pageWidth, list] = await page.evaluate(() => [document.documentElement, document.querySelector("#timeline .tl-scroll")].map((el) => [el.scrollWidth, el.clientWidth]));
    assert.ok(pageWidth[0] <= pageWidth[1] && list[0] <= list[1], `${what}: no sideways scroll (page ${pageWidth}, list ${list})`);
  };
  await noSideways("larger text, unwrapped, no type");
  // Kept for the reader's next visit, in this browser only.
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("debrief.play.timelineFilter") ?? "{}").view);
  assert.deepEqual(kept, { highlights: ["contact", "towed array"], moveTime: true, textSize: 16, wrap: false, hidden: ["type"] });

  // On a phone, with the menu open.
  await resizeTo(page, 390, 844);
  await timeline('input[data-view="wrap"]').check();
  await showPanel(page, "timeline");
  await noSideways("on a phone, the menu open");
  // The row worked with keeps its Edit and Delete in sight, above the list's foot.
  await page.waitForTimeout(300);
  const phoneActions = await timeline(".tl-active .tl-actions").boundingBox();
  const phoneList = await timeline(".tl-scroll").boundingBox();
  assert.ok(phoneActions && phoneList && phoneActions.y + phoneActions.height <= phoneList.y + phoneList.height + 0.5, `on a phone, Edit and Delete in sight (${JSON.stringify(phoneActions)} in ${JSON.stringify(phoneList)})`);
  await page.evaluate(() => document.getElementById("toasts")?.replaceChildren());
  await page.mouse.move(2, 2);
  await shot("narrative-b-04-phone-menu");
  // Back to the Timeline's own view, from the keyboard: Escape closes the menu.
  await timeline('input[data-column="type"]').check();
  await timeline('[data-size="down"]').click();
  await timeline('[data-size="down"]').click();
  await timeline(".tl-highlights").fill("");
  await page.waitForFunction(() => window.debriefTimeline().view.highlights.length === 0);
  await timeline(".tl-highlights").press("Escape");
  assert.equal(await menu.isHidden(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("tl-view-button")), true, "Escape returns the keyboard to the button");
  assert.deepEqual((await state(page)).view, { highlights: [], moveTime: true, textSize: 12, wrap: true, hidden: [] });
  await resizeTo(page, 1400, 820);
}
