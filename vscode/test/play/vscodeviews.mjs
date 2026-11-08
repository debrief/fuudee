// VS Code's webview pages in Chromium (play.mjs plays them), each served alone from dist/webview as VS
// Code serves it, with VS Code's theme tokens: the Time, Tote, Timeline and Coverage views.
import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stickyHeadings } from "./tote.mjs";
import { vscodeTimelineView } from "./narrative.mjs";
import { vscodeCoverageView } from "./collation.mjs";

/**
 * VS Code's Time view page (dist/webview/time.js), given about 190 px of the sidebar: everything
 * shows without scrolling, the note and its Keep and Revert included, the window's details
 * folded; the context choice is not in the view (it is in the view's title menu) though the
 * summary says it. At the height VS Code first gives it (below), a closer layout. The details' state is VS Code's view state, so it comes back when the page
 * loads again. High contrast and forced colours keep the band, the edges and the thumb.
 */
async function vscodeTimeView(ctx) {
  const { browser, errors, shot, serve } = ctx;
  const extension = path.resolve(import.meta.dirname, "..", "..");
  const webview = path.join(extension, "dist", "webview");
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: extension, stdio: "inherit" }); // the page as it is now
  const files = serve(webview);
  const view = await browser.newPage({ viewport: { width: 290, height: 188 }, colorScheme: "dark" });
  view.on("pageerror", (e) => errors.push(String(e)));
  view.on("console", (m) => m.text().startsWith("webview_message_refused") && errors.push(m.text())); // a message the page refused (CON-08)
  const posted = [];
  await view.exposeFunction("tellTest", (message) => posted.push(message));
  // VS Code's own fonts and sizes, and the theme tokens the page uses for its colours: Dark Modern, or High Contrast.
  const DARK = "--vscode-foreground: #ccc; --vscode-descriptionForeground: #9d9d9d; --vscode-sideBar-background: #181818; --vscode-focusBorder: #0078d4; --vscode-button-background: #0078d4; --vscode-button-foreground: #fff; --vscode-button-hoverBackground: #026ec1; --vscode-button-secondaryBackground: #313131; --vscode-button-secondaryForeground: #ccc; --vscode-dropdown-background: #313131; --vscode-input-background: #313131; --vscode-inputValidation-warningBorder: #b89500; --vscode-inputValidation-warningBackground: #352a05;";
  const HIGH_CONTRAST = "--vscode-foreground: #fff; --vscode-descriptionForeground: #fff; --vscode-sideBar-background: #000; --vscode-focusBorder: #f38518; --vscode-contrastBorder: #6fc3df; --vscode-button-background: #000; --vscode-button-foreground: #fff; --vscode-button-border: #6fc3df; --vscode-button-secondaryBackground: #000; --vscode-button-secondaryForeground: #fff; --vscode-dropdown-background: #000; --vscode-dropdown-border: #6fc3df; --vscode-input-background: #000; --vscode-input-border: #6fc3df; --vscode-widget-border: #6fc3df; --vscode-inputValidation-warningBorder: #ff0;";
  let tokens = DARK;
  await view.route("**/time-view.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body:
        `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><link rel="stylesheet" href="time.css">` +
        `<style>:root { --vscode-font-family: system-ui, Ubuntu, "Droid Sans", sans-serif; --vscode-font-size: 13px; --vscode-editor-font-family: "Droid Sans Mono", monospace; ${tokens} }</style>` +
        // The page's state as VS Code keeps it: here, for the tab's life.
        `</head><body><div id="root"></div><script>window.acquireVsCodeApi = () => ({ postMessage: (m) => window.tellTest(m), getState: () => JSON.parse(sessionStorage.getItem("state") || "null") ?? undefined, setState: (s) => sessionStorage.setItem("state", JSON.stringify(s)) });</script>` +
        `<script src="time.js"></script></body></html>`,
    }),
  );
  const open = async () => {
    posted.length = 0;
    await view.goto(`http://127.0.0.1:${files.address().port}/time-view.html`);
    await view.waitForFunction(() => document.getElementById("timebar"));
    for (let i = 0; i < 50 && !posted.some((m) => m.kind === "ready"); i++) await view.waitForTimeout(100);
  };
  await open();
  const period = { start: "2023-06-15T08:00:00.000Z", end: "2023-06-15T12:00:00.000Z" };
  const showTime = (range, saved) =>
    // Current time within the window, as the host keeps it (a page refuses one outside, CON-08).
    view.evaluate(([range, saved]) => window.postMessage({ kind: "show_time", time: { current: range.end < "2023-06-15T09:21:17.000Z" ? range.end : "2023-06-15T09:21:17.000Z", range }, time_range: { start: "2023-06-15T08:00:00.000Z", end: "2023-06-15T12:00:00.000Z" }, saved_window: saved, context_tracks: "faint" }, "*"), [range, saved]);
  const allShown = async (state) => {
    const box = await view.evaluate(() => {
      const bottom = (selector) => document.querySelector(selector).getBoundingClientRect().bottom;
      return {
        scroll: document.documentElement.scrollHeight - innerHeight,
        sideways: document.documentElement.scrollWidth - innerWidth,
        height: innerHeight,
        bottoms: [".tc-play", ".tc-speed", ".time-label", ".tc-current", ".tc-step-label", ".tc-window", ".tc-cue", ".tc-disclosure"].map(bottom),
      };
    });
    assert.ok(box.scroll <= 0, `${state}: the Time view scrolls by ${box.scroll}px`);
    assert.ok(box.sideways <= 0, `${state}: the Time view scrolls sideways by ${box.sideways}px`);
    for (const b of box.bottoms) assert.ok(b <= box.height, `${state}: something ends at ${b}px, below the view's ${box.height}px`);
  };
  // A window as saved: no note; the details folded, the summary saying the plot's context tracks.
  const early = { start: period.start, end: "2023-06-15T09:00:00.000Z" };
  await showTime(early, early);
  await view.locator(".time-label", { hasText: "09:00:00Z" }).waitFor();
  assert.equal(await view.locator(".tc-cue-text").innerText(), "");
  assert.equal(await view.locator(".tc-disclosure").getAttribute("aria-expanded"), "false");
  assert.match(await view.locator(".tc-disclosure").innerText(), /Window\s+08:00–09:00Z\s+\(Faint\)/);
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
  // Current time large, above one row of the steps, play and speed.
  const big = await view.locator(".time-label").boundingBox();
  const row = await Promise.all([".back", ".tc-play", ".forward", ".tc-speed", ".tc-step-label"].map((s) => view.locator(s).boundingBox()));
  for (const box of row) assert.ok(Math.abs(box.y + box.height / 2 - (row[1].y + row[1].height / 2)) <= 3, "one row");
  assert.ok(big.y + big.height <= row[1].y + 1, "current time above the transport");
  assert.ok(big.height >= 1.5 * (await view.locator(".tc-step-label").boundingBox()).height, "and large");
  await shot("vscode-time-view-note", view);
  // Keep, from the keyboard: the window is sent to be saved.
  await view.locator(".tc-keep").focus();
  await view.keyboard.press("Enter");
  for (let i = 0; i < 20 && !posted.some((m) => m.kind === "window_changed"); i++) await view.waitForTimeout(50);
  assert.deepEqual(posted.find((m) => m.kind === "window_changed")?.time_range, widened);

  // The window's details open: kept as the view's state, so open again when the page loads again.
  await view.locator(".tc-disclosure").click();
  await view.locator(".tc-details").waitFor();
  assert.equal(await view.locator(".tc-from").inputValue(), "15 Jun 2023 08:00:00Z");
  await shot("vscode-time-view-window-open", view);
  await open();
  await showTime(early, early);
  await view.locator(".tc-details").waitFor();
  assert.equal(await view.locator(".tc-disclosure").getAttribute("aria-expanded"), "true", "remembered open");
  await view.locator(".tc-disclosure").click();
  assert.equal(await view.locator(".tc-details").isVisible(), false);

  // High contrast, and forced colours: the band, its edges, the thumb and Play still show.
  tokens = HIGH_CONTRAST;
  for (const forced of ["none", "active"]) {
    await view.emulateMedia({ forcedColors: forced });
    await open();
    await showTime(early, early);
    await view.locator(".time-label", { hasText: "09:00:00Z" }).waitFor();
    await allShown(`high contrast, forced colours ${forced}`);
    const looks = await view.evaluate(() => {
      const style = (s) => getComputedStyle(document.querySelector(s));
      const seen = (c) => !!c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent";
      return {
        band: seen(style(".tc-band").backgroundColor) || seen(style(".tc-band").borderTopColor),
        handle: seen(style(".tc-handle").backgroundColor),
        play: seen(style(".tc-play").backgroundColor) || seen(style(".tc-play").borderTopColor),
        time: seen(style(".tc-time").color),
      };
    });
    assert.deepEqual(looks, { band: true, handle: true, play: true, time: true }, `high contrast, forced colours ${forced}`);
    await shot(`vscode-time-view-high-contrast${forced === "active" ? "-forced" : ""}`, view);
  }
  // VS Code's first height at 1440 × 900 with the other Debrief views open (about 297 × 123 px in the
  // integration test's screenshots; a little less here): closer, without its tick labels, all of it shown.
  // Only the note, when there is one, takes it past the height: the view then scrolls.
  tokens = DARK;
  await view.emulateMedia({ forcedColors: "none" });
  await view.setViewportSize({ width: 290, height: 120 });
  await open();
  await showTime(early, early);
  await view.locator(".time-label", { hasText: "09:00:00Z" }).waitFor();
  await allShown("a short view");
  assert.equal(await view.locator(".tc-tick").first().isVisible(), false, "a short view leaves the tick labels out");
  await shot("vscode-time-view-short", view);
  await view.close();
  files.close();
}

/**
 * VS Code's Tote view page (dist/webview/tote.js), at a sidebar's usual width: the values
 * of a show_tote message in legacy Debrief's table, a row a measure and a column a track;
 * the page never scrolls sideways, the tracks scroll inside the table under row headings
 * that stay put; Delete on a secondary's × asks the host to remove it.
 */
async function vscodeToteView(ctx) {
  const { browser, errors, shot, serve } = ctx;
  const extension = path.resolve(import.meta.dirname, "..", "..");
  const files = serve(path.join(extension, "dist", "webview")); // built by vscodeTimeView
  const view = await browser.newPage({ viewport: { width: 290, height: 300 }, colorScheme: "dark" });
  view.on("pageerror", (e) => errors.push(String(e)));
  view.on("console", (m) => m.text().startsWith("webview_message_refused") && errors.push(m.text())); // a message the page refused (CON-08)
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

/** VS Code's Time, Tote, Timeline and Coverage view pages, each served alone as VS Code serves it. */
async function playVscodeViews(ctx) {
  const { browser, errors, root, shot, serve } = ctx;
  await vscodeTimeView(ctx);
  await vscodeToteView(ctx);
  const files = serve(path.join(path.resolve(import.meta.dirname, "..", ".."), "dist", "webview")); // built by vscodeTimeView
  await vscodeTimelineView(browser, files, errors, shot, JSON.parse(readFileSync(path.join(root, "sample/serial-1/plot.geojson"), "utf8")));
  await vscodeCoverageView(browser, files, errors, shot, path.resolve(import.meta.dirname, "..", "..", ".."));
  files.close();
}

export const plays = [{ name: "vscode-views", start: "blank", cost: 15, play: playVscodeViews }];
