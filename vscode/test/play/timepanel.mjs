// The Time panel as "big time and scrubber" (product owner, 28 Oct 2026): current time the largest
// text, following play; the scrubber over the window; the overview strip's band dragged and resized
// and clicked; the window's details collapsed at first and remembered; every part from the keyboard;
// and no sideways scroll at 390 px or in the narrow side column. Polls rather than waits, and brings
// each part into view before the pointer uses it, so fonts and timings as CI has them pass too.
import assert from "node:assert/strict";
import { resizeTo, showPanel } from "./dock.mjs";

const at = (hhmm) => Date.parse(`2023-06-15T${hhmm}:00.000Z`);
const MIN = 60000;

/** Font sizes of the panel's text, largest first: [size, class] for each element with text of its own. */
async function textSizes(page) {
  return page.locator("#panel-time").evaluate((panel) =>
    [...panel.querySelectorAll("*")]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.getClientRects().length)
      .map((e) => [parseFloat(getComputedStyle(e).fontSize), e.className || e.tagName])
      .sort((a, b) => b[0] - a[0]),
  );
}

/** The panel and the page never scroll sideways. */
async function noSidewaysScroll(page, where) {
  const widths = await page.evaluate(() => {
    const bar = document.getElementById("timebar");
    const over = [...bar.querySelectorAll("*")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > bar.getBoundingClientRect().right + 1).map((e) => e.className);
    return { page: document.documentElement.scrollWidth - innerWidth, bar: bar.scrollWidth - bar.clientWidth, over };
  });
  assert.ok(widths.page <= 0, `${where}: the page scrolls sideways by ${widths.page}px`);
  assert.ok(widths.bar <= 0, `${where}: the Time panel scrolls sideways by ${widths.bar}px`);
  assert.deepEqual(widths.over, [], `${where}: nothing in the panel reaches past its right edge`);
}

export async function playTimePanel(page, shot, history) {
  const tc = (selector) => page.locator(`#timebar ${selector}`);
  const value = async (selector) => Number(await tc(selector).getAttribute("aria-valuenow"));
  const window = async () => ({ start: await value(".tc-start"), end: await value(".tc-end") });
  const current = async () => Number(await tc(".tc-current").inputValue());
  const near = (actual, expected, within, what) => assert.ok(Math.abs(actual - expected) <= within, `${what}: ${new Date(actual).toISOString()}, expected about ${new Date(expected).toISOString()}`);
  await showPanel(page, "time");
  const steps = await history();

  // Current time is the largest text in the panel, by far; its date small beside it.
  const sizes = await textSizes(page);
  assert.match(sizes[0][1], /tc-time/, `current time is the largest text: ${JSON.stringify(sizes.slice(0, 3))}`);
  assert.ok(sizes[0][0] >= 1.6 * sizes[1][0], `and by far: ${JSON.stringify(sizes.slice(0, 3))}`);
  assert.match(await tc(".tc-time").innerText(), /^\d\d:\d\d:\d\dZ$/);
  assert.match(await tc(".tc-date").innerText(), /^15 Jun 2023$/);

  // The transport: icon buttons of 32 px or more, named, with titles.
  for (const [selector, name] of [[".back", "Step back"], [".tc-play", "Play"], [".forward", "Step forward"]]) {
    const box = await tc(selector).boundingBox();
    assert.ok(box.width >= 32 && box.height >= 32, `${name} is at least 32 px: ${box.width} × ${box.height}`);
    assert.equal(await tc(selector).getAttribute("aria-label"), name);
    assert.ok(await tc(selector).getAttribute("title"));
  }
  assert.match(await tc(".tc-step-label").innerText(), /^step \d+ (s|min|h|day|days)$/);

  // The window's details are collapsed at first.
  assert.equal(await tc(".tc-disclosure").getAttribute("aria-expanded"), "false");
  assert.equal(await tc(".tc-details").isVisible(), false);
  assert.match(await tc(".tc-disclosure").innerText(), /Window\s+\d\d:\d\d–\d\d:\d\dZ\s+\(Visible\)/);

  // Open them from the keyboard; type the window's ends: 09:00 to 10:00, saved, no step.
  await tc(".tc-disclosure").focus();
  await page.keyboard.press("Enter");
  assert.equal(await tc(".tc-disclosure").getAttribute("aria-expanded"), "true");
  await tc(".tc-details").waitFor();
  if (await tc(".tc-whole").isEnabled()) await tc(".tc-whole").click();
  await page.waitForFunction(() => document.querySelector("#timebar .tc-whole")?.disabled);
  assert.match(await tc(".tc-window-length").innerText(), /^Length 4 h, the whole plot$/);
  await tc(".tc-from").fill("09:00");
  await page.keyboard.press("Enter");
  await tc(".tc-to").fill("10:00Z");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#timebar .tc-summary")?.textContent === "09:00–10:00Z");
  assert.deepEqual(await window(), { start: at("09:00"), end: at("10:00") });
  assert.equal(await tc(".tc-to").inputValue(), "15 Jun 2023 10:00:00Z");
  assert.equal(await tc(".tc-whole").isEnabled(), true, "Whole plot offered again");
  await tc(".tc-from").fill("not a time");
  await page.keyboard.press("Enter");
  assert.match(await tc(".tc-window-problem").innerText(), /not a time/);
  await page.keyboard.press("Escape");
  assert.equal(await tc(".tc-from").inputValue(), "15 Jun 2023 09:00:00Z");
  await shot("time-07-window-open");
  // Closed again from the keyboard: remembered as closed.
  await tc(".tc-disclosure").focus();
  await page.keyboard.press("Space");
  assert.equal(await tc(".tc-disclosure").getAttribute("aria-expanded"), "false");

  // The scrubber spans the window: its middle is 09:30, its ends the window's; it says its time.
  const scrub = tc(".tc-current");
  await scrub.scrollIntoViewIfNeeded();
  assert.equal(Number(await scrub.getAttribute("min")), at("09:00"));
  assert.equal(Number(await scrub.getAttribute("max")), at("10:00"));
  let box = await scrub.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction((t) => Math.abs(Number(document.querySelector("#timebar .tc-current")?.value) - t) <= 2 * 60000, at("09:30"));
  near(await current(), at("09:30"), 2 * MIN, "the scrubber's middle");
  assert.match(await scrub.getAttribute("aria-valuetext"), /^15 Jun 2023 09:\d\d:\d\dZ$/);
  assert.equal(await tc(".tc-time").innerText(), (await scrub.getAttribute("aria-valuetext")).slice(12));
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await page.waitForFunction((t) => Number(document.querySelector("#timebar .tc-current")?.value) === t, at("10:00"));
  // Its tick labels fall on whole intervals within the window.
  const ticks = await tc(".tc-tick").allInnerTexts();
  assert.ok(ticks.length >= 2, `tick labels: ${ticks}`);
  for (const tick of ticks) assert.match(tick, /^09:\d\d$/);
  // From the keyboard: an arrow steps (a hundredth of the window: 1 min), Home to the window's start.
  await scrub.focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await current(), at("09:59"));
  await page.keyboard.press("Home");
  assert.equal(await current(), at("09:00"));

  // Play: current time, large, follows it; no live region follows playing.
  const label = await tc(".tc-time").innerText();
  await tc(".tc-play").click();
  await page.waitForFunction((was) => document.querySelector("#timebar .tc-time")?.textContent !== was, label);
  assert.equal(await tc(".tc-play").getAttribute("aria-label"), "Pause");
  assert.equal(await tc(".tc-time").getAttribute("aria-live"), null);
  assert.equal(await page.locator("#timebar [aria-live]:not(.tc-cue)").count(), 0, "the only live region is the note");
  await tc(".tc-play").click();
  await page.waitForFunction(() => document.querySelector("#timebar .tc-play")?.getAttribute("aria-label") === "Play");

  // The overview strip: the whole plot (08:00 to 12:00), the window a band a quarter of it.
  const strip = tc(".tc-window");
  await strip.scrollIntoViewIfNeeded();
  const rail = await strip.boundingBox();
  const band = await tc(".tc-band").boundingBox();
  near(band.x, rail.x + rail.width * 0.25, 2, "the band starts a quarter along");
  near(band.width, rail.width * 0.25, 2, "the band is a quarter of the strip");
  // Drag the band a quarter along: the window moves an hour, keeping its length; saved once let go, no step.
  const y = band.y + band.height / 2;
  await page.mouse.move(band.x + band.width / 2, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(band.x + band.width / 2 + (i * rail.width * 0.25) / 8, y);
  await page.mouse.up();
  let w = await window();
  near(w.start, at("10:00"), 2 * MIN, "the band dragged: the window's start");
  assert.equal(w.end - w.start, 60 * MIN, "the band dragged: the window keeps its length");
  assert.match(await tc(".tc-summary").innerText(), /^1[01]:\d\d–1[01]:\d\dZ$/);
  // Drag its end edge: resized, half an hour longer.
  box = await tc(".tc-end").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width / 2 + (i * rail.width * 0.125) / 6, box.y + box.height / 2);
  await page.mouse.up();
  const resized = await window();
  assert.equal(resized.start, w.start, "the start stays");
  near(resized.end, w.end + 30 * MIN, 2 * MIN, "the end edge dragged");
  // Click inside the band: current time moves there, the window stays.
  const inside = await tc(".tc-band").boundingBox();
  await page.mouse.click(inside.x + inside.width / 2, y);
  near(await current(), (resized.start + resized.end) / 2, 2 * MIN, "a click in the band moves current time");
  assert.deepEqual(await window(), resized);
  // Click outside it, at 08:24: the window moves to take it in (its length kept, within the plot), current time there.
  await page.mouse.click(rail.x + rail.width * 0.1, y);
  await page.waitForFunction((t) => Math.abs(Number(document.querySelector("#timebar .tc-current")?.value) - t) <= 2 * 60000, at("08:24"));
  w = await window();
  assert.equal(w.start, at("08:00"), "the window moved to the plot's start, as near as it can centre 08:24");
  assert.equal(w.end - w.start, resized.end - resized.start, "its length kept");
  await shot("time-08-overview-strip");

  // The band from the keyboard: an arrow moves the window by a step (5 min of the plot's four hours), Shift and an arrow resizes it.
  // First 08:00 to 09:30 exactly, by the edges' keys: End, then three Page Downs of ten steps.
  await tc(".tc-start").focus();
  await page.keyboard.press("Home");
  await tc(".tc-end").focus();
  for (const key of ["End", "PageDown", "PageDown", "PageDown"]) await page.keyboard.press(key);
  assert.deepEqual(await window(), { start: at("08:00"), end: at("09:30") });
  await tc(".tc-band").focus();
  assert.equal(await tc(".tc-band").getAttribute("role"), "slider");
  assert.match(await tc(".tc-band").getAttribute("aria-valuetext"), /^15 Jun 2023 08:00:00Z to 15 Jun 2023 09:30:00Z, 1 h 30 min$/);
  await page.keyboard.press("ArrowRight");
  assert.deepEqual(await window(), { start: at("08:05"), end: at("09:35") });
  await page.keyboard.press("Shift+ArrowRight");
  assert.deepEqual(await window(), { start: at("08:05"), end: at("09:40") });
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  assert.deepEqual(await window(), { start: at("08:05"), end: at("09:30") });
  await page.keyboard.press("End");
  assert.deepEqual(await window(), { start: at("10:35"), end: at("12:00") });
  // The window's edges from the keyboard, as before.
  await tc(".tc-start").focus();
  await page.keyboard.press("Home");
  assert.deepEqual(await window(), { start: at("08:00"), end: at("12:00") });

  // Type a time: Enter on current time, type, Enter; Escape leaves it as it was.
  await tc(".tc-time").focus();
  await page.keyboard.press("Enter");
  await tc(".tc-time-input").waitFor();
  await page.keyboard.type("11:45");
  await page.keyboard.press("Enter");
  await page.waitForFunction((t) => Number(document.querySelector("#timebar .tc-current")?.value) === t, at("11:45"));
  assert.equal(await tc(".tc-time").innerText(), "11:45:00Z");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("tc-time")), true, "the keyboard back on current time");
  await page.keyboard.press("Enter");
  await page.keyboard.type("13:00");
  await page.keyboard.press("Enter");
  assert.match(await tc(".tc-time-problem").innerText(), /Outside the plot/);
  await page.keyboard.press("Escape");
  assert.equal(await tc(".tc-time-problem").innerText(), "");
  assert.equal(await current(), at("11:45"));

  // Nothing here is a step in the plot's history: the window and current time are view state.
  await page.waitForTimeout(300);
  assert.equal(await history(), steps, "no step");

  // Every part from the keyboard, in order: Tab reaches each.
  const order = [];
  await tc(".tc-time").focus();
  for (let i = 0; i < 12; i++) {
    order.push(await page.evaluate(() => ["tc-time", "back", "tc-play", "forward", "tc-speed", "tc-current", "tc-band", "tc-start", "tc-end", "tc-disclosure"].find((c) => document.activeElement?.classList.contains(c))));
    await page.keyboard.press("Tab");
  }
  for (const part of ["tc-time", "back", "tc-play", "forward", "tc-speed", "tc-current", "tc-band", "tc-start", "tc-end", "tc-disclosure"]) assert.ok(order.includes(part), `Tab reaches ${part}: ${order}`);
}

/**
 * A first visit in a fresh browser: the disclosure folded; opened, it is open again when the page
 * loads again (remembered in this browser); then 390 px and the narrow side column, with no
 * sideways scroll and current time still the largest text.
 */
export async function timePanelElsewhere(browser, url, shot, errors) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: "dark" });
  const other = await context.newPage();
  other.on("pageerror", (e) => errors.push(String(e)));
  try {
    await other.goto(url);
    await other.locator("#timebar .tc-disclosure").waitFor();
    assert.equal(await other.locator("#timebar .tc-disclosure").getAttribute("aria-expanded"), "false", "folded on a first visit");
    await other.locator("#timebar .tc-disclosure").click();
    await other.reload();
    await other.locator("#timebar .tc-disclosure").waitFor();
    await other.waitForFunction(() => document.querySelector("#timebar .tc-disclosure")?.getAttribute("aria-expanded") === "true");
    assert.equal(await other.locator("#timebar .tc-details").isVisible(), true, "remembered open");
    for (const [width, height, where] of [[390, 844, "390 px"], [760, 800, "the narrow side column"], [1366, 768, "docked at 1366"]]) {
      await resizeTo(other, width, height);
      await other.locator("#panel-time").scrollIntoViewIfNeeded();
      await noSidewaysScroll(other, where);
      const sizes = await textSizes(other);
      assert.match(sizes[0][1], /tc-time/, `${where}: current time is the largest text: ${JSON.stringify(sizes.slice(0, 3))}`);
      if (width === 390) await shot("time-09-390px", other);
    }
    await other.locator("#timebar .tc-disclosure").click(); // folded again, remembered so
    await other.waitForFunction(() => window.localStorage.getItem("debrief.play.timeWindowOpen") === "false");
  } finally {
    await context.close();
  }
}
