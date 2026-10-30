// Collation in the playground (CAP-05, CAP-08 to CAP-12), played as a reader would: new data
// arrives through Debrief's import and is marked in Catalogue and Coverage (a sparkle and the
// words New data, never colour alone, its reason its tooltip and its label for screen
// readers); taken from the keyboard as one step, undone and redone; the Timeline lists the
// periods each item supplies; a period's source chosen from its list, then by clicking a
// bar; a proposal by name refused; an item the plot drew from revised by a colleague, said
// once and flagged May need review until Reviewed. Down to 210 px, in a wider font, nothing
// scrolls sideways. And VS Code's Coverage view, the same component, at a sidebar's widths.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { frames, resizeTo, showPanel } from "./dock.mjs";

export async function playCollation(page, shot) {
  const latest = () => page.locator("#history li").first().locator(".name").textContent();
  const stepNamed = (name) => page.waitForFunction((n) => document.querySelector("#history li .name")?.textContent === n, name, { timeout: 60000 });
  const coverage = page.locator("#coverage");
  const blue = coverage.locator('.cov-platform[data-track="track-blue-one"]');
  const item = (title) => page.locator("#items > li", { has: page.locator(".item-title", { hasText: title }) });

  await page.selectOption("#plots", "serial-1");
  // Catalogue and Coverage in view: docked, their tabs to the front (behind the Outline and the Timeline by default).
  await showPanel(page, "catalogue");
  await showPanel(page, "coverage");
  await blue.waitFor();
  // The sample's other serials have BLUE ONE too: proposed, by name, as the same platform.
  assert.match(await blue.locator(".cov-head").innerText(), /BLUE ONE\s+3 sources/);
  assert.deepEqual(await blue.locator(".cov-source .cov-title").allTextContents(), ["Serial 1", "Serial 2", "Serial 3"]);
  // Folded: nothing to choose yet, so a study of many items stays readable.
  assert.equal(await blue.getAttribute("open"), null);

  // New data arrives, through Debrief's import: a navigation log for BLUE ONE.
  await showPanel(page, "try");
  await page.locator("#new-data").click();
  const log = item("BLUE ONE navigation log");
  await log.locator(".item-mark").waitFor({ timeout: 60000 });
  assert.equal(await log.locator(".item-mark").innerText(), "✦");
  assert.match(await log.getAttribute("aria-label"), /^BLUE ONE navigation log, New data, New data for Serial 1: BLUE ONE, within its period/);
  assert.equal(await log.locator(".item-name").getAttribute("title"), "New data for Serial 1: BLUE ONE, within its period");
  const fresh = coverage.locator(".cov-new .cov-item");
  assert.match(await fresh.innerText(), /New data\s*BLUE ONE navigation log/);
  assert.equal(await fresh.locator(".cov-tag").innerText(), "New data");
  // Its BLUE ONE, named "Blue One", proposed as the plot's.
  assert.match(await blue.locator(".cov-source", { hasText: "BLUE ONE navigation log" }).innerText(), /proposed: same name · Blue One/);
  await showPanel(page, "catalogue");
  await shot("collation-01-new-data");

  // Taken from the keyboard: one step, named for the item.
  await coverage.locator(".cov-take").first().focus();
  await page.keyboard.press("Enter");
  await stepNamed("New data from BLUE ONE navigation log");
  await page.locator(".toast", { hasText: "BLUE ONE 120 fixes, WATCHER added" }).waitFor().catch(() => undefined);
  // The mark clears once taken; the item is drawn from.
  await page.waitForFunction(() => ![...document.querySelectorAll("#items .item-title")].some((t) => t.textContent === "BLUE ONE navigation log" && t.closest("li").querySelector(".item-mark")));
  assert.match(await log.locator(".detail").innerText(), /^drawn from/);
  assert.equal(await coverage.locator(".cov-new").count(), 0);
  assert.ok(await page.locator('#outline li[data-id="track-watcher"]').count(), "WATCHER, matching none of the plot's tracks, added");
  // The Timeline lists the periods of data, by the item supplying each (CAP-05).
  // The list draws only the rows in sight: found by searching for them, as a reader would.
  await showPanel(page, "timeline");
  const search = page.locator("#timeline .tl-search");
  await search.fill("navigation log");
  const rows = page.locator('#timeline .tl-row[data-kind="coverage"]', { hasText: "navigation log" });
  await rows.first().waitFor();
  const supplied = await rows.evaluateAll((all) => all.map((r) => r.getAttribute("aria-label")));
  assert.ok(supplied.some((label) => /BLUE ONE navigation log, Data: Until .*BLUE ONE: 120 fixes/.test(label)), supplied.join("\n"));
  await search.fill("");
  await showPanel(page, "coverage");
  await shot("collation-02-taken");

  // Undo takes it all back; redo puts it again.
  await page.locator("#undo").click();
  await page.waitForFunction(() => document.querySelector("#history li .detail")?.textContent?.includes("undone"));
  await page.waitForFunction(() => !document.querySelector('#outline li[data-id="track-watcher"]'));
  await page.locator("#redo").click();
  await page.locator('#outline li[data-id="track-watcher"]').waitFor({ state: "attached" }); // in the Outline, behind the Catalogue's tab

  // Which source supplies the period both have: chosen on its list, then on the bar.
  const choice = blue.locator("select", { has: page.locator("option", { hasText: "BLUE ONE navigation log" }) }).first();
  const label = await choice.getAttribute("aria-label");
  assert.match(label, /^Source for BLUE ONE \d\d:\d\d:\d\dZ to \d\d:\d\d:\d\dZ$/);
  const period = label.replace("Source for BLUE ONE ", "");
  // Real keys: the arrow keys move through the list (a change at every one) and make no
  // step; Enter makes the one chosen. Focus stays on the list as Coverage is drawn again.
  const stepsBefore = await page.locator("#history li").count();
  await choice.focus();
  const picked = () => choice.evaluate((s) => s.options[s.selectedIndex].text);
  for (let i = 0; i < 4 && (await picked()) !== "BLUE ONE navigation log"; i++) await page.keyboard.press("ArrowDown");
  assert.equal(await picked(), "BLUE ONE navigation log");
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#history li").count(), stepsBefore, "moving through the list makes no step");
  assert.equal(await choice.locator("xpath=following-sibling::button[1]").isDisabled(), false, "Set is ready once another source is picked");
  await page.keyboard.press("Enter");
  await stepNamed(`BLUE ONE ${period} from BLUE ONE navigation log`);
  await page.waitForFunction((l) => document.activeElement?.getAttribute("aria-label") === l, label, { timeout: 10000 });
  // The panel redraws once the step is saved: waited for, not read the moment the step shows.
  const logBar = blue.locator(".cov-source", { hasText: "BLUE ONE navigation log" }).locator(".cov-bar .cov-supplied");
  await logBar.nth(1).waitFor({ timeout: 10000 }).catch(() => undefined);
  assert.ok((await logBar.count()) >= 2, `the log supplies its period of overlap and its hour after the plot's (${await logBar.count()} shown)`);
  await showPanel(page, "coverage");
  await shot("collation-03-chosen");
  // Back to Serial 1 by clicking its bar in the middle of that period.
  const [from, to] = period.split(" to ").map((t) => Date.parse(`2023-06-15T${t.replace("Z", "")}.000Z`));
  const extent = await coverage.evaluate(() => [...document.querySelectorAll(".cov-axis span")].map((s) => s.textContent));
  const [start, end] = extent.map((t) => Date.parse(`2023-06-15T${t.replace("Z", "")}.000Z`));
  const bar = blue.locator(".cov-source", { hasText: "Serial 1" }).first().locator(".cov-bar");
  await bar.scrollIntoViewIfNeeded();
  const box = await bar.boundingBox();
  await page.mouse.click(box.x + (((from + to) / 2 - start) / (end - start)) * box.width, box.y + box.height / 2);
  await stepNamed(`BLUE ONE ${period} from Serial 1`);

  // Serial 2's BLUE ONE is another platform: refused, it is proposed no more.
  await blue.locator(".cov-source", { hasText: "Serial 2" }).getByRole("button", { name: "Not this platform" }).click();
  await stepNamed("BLUE ONE in Serial 2 is not BLUE ONE");
  await page.waitForFunction(() => ![...document.querySelectorAll('#coverage .cov-platform[data-track="track-blue-one"] .cov-title')].some((t) => t.textContent === "Serial 2"));

  // A colleague revises the log: said once, and the plot flagged until reviewed (CAP-12).
  await showPanel(page, "try");
  await page.locator("#revise").click();
  await page.locator(".toast", { hasText: "May need review: BLUE ONE navigation log was revised since Serial 1 took data from it" }).waitFor({ timeout: 60000 });
  const serial = item("Serial 1");
  await serial.locator(".item-flag").waitFor();
  assert.match(await serial.getAttribute("aria-label"), /May need review/);
  assert.match(await coverage.locator(".cov-review").innerText(), /May need review: BLUE ONE navigation log was revised/);
  await showPanel(page, "catalogue");
  await shot("collation-04-review");
  const steps = await page.locator("#history li").count();
  await coverage.locator(".cov-reviewed").click();
  await coverage.locator(".cov-review").waitFor({ state: "detached" });
  assert.equal(await serial.locator(".item-flag").count(), 0);
  assert.equal(await page.locator("#history li").count(), steps, "clearing a flag is view state, never a step");
  assert.equal(await latest(), "BLUE ONE in Serial 2 is not BLUE ONE");

  // Narrow, and in a wider font: Catalogue and Coverage never scroll sideways.
  const sideways = () =>
    page.evaluate(() =>
      ["#body-catalogue", "#body-coverage", "#coverage", "#items"].flatMap((s) => {
        const el = document.querySelector(s);
        return el && el.scrollWidth > el.clientWidth + 1 ? [`${s} ${el.scrollWidth}/${el.clientWidth}`] : [];
      }),
    );
  const widths = [];
  for (const wide of [false, true]) {
    const style = wide ? await page.addStyleTag({ content: "#side * { letter-spacing: 0.1em !important } .cov, .cov *, .items, .items * { font-size: 15px !important }" }) : undefined;
    for (const width of [390, 280, 210]) {
      await resizeTo(page, width, 800);
      await frames(page);
      const over = await sideways();
      widths.push(`${wide ? "wide font, " : ""}${width} px: ${over.length ? over.join(", ") : "fits"}`);
      assert.deepEqual(over, [], `${wide ? "in a wide font, " : ""}at ${width} px nothing scrolls sideways`);
      if (width === 390 && !wide) {
        await showPanel(page, "coverage");
        await shot("collation-05-phone");
      }
    }
    await style?.evaluate((s) => s.remove());
  }
  console.log(`Collation panels (sideways scroll): ${widths.join("; ")}.`);
  const times = (await page.evaluate(() => window.debriefCoverage())).times.map((t) => Math.round(t)).sort((a, b) => a - b);
  console.log(`Coverage in the playground (Pyodide), asking to answer: ${times.join(", ")} ms over ${times.length} asks.`);
  assert.ok(times[Math.floor(times.length / 2)] < 1500, "coverage answers within budget (generously, for a slow machine)");
  await resizeTo(page, 1400, 820);
  await showPanel(page, "outline"); // in front again, as the tests after this one expect
}

/**
 * VS Code's Coverage view page (dist/webview/coverage.js), at a sidebar's widths: a
 * show_coverage message drawn, nothing scrolling sideways down to 210 px in a wide font;
 * the list, a bar, Same platform, Take and Not now each ask the host.
 */
export async function vscodeCoverageView(browser, files, errors, shot, repo) {
  const view = await browser.newPage({ viewport: { width: 280, height: 560 }, colorScheme: "dark" });
  view.on("pageerror", (e) => errors.push(String(e)));
  const posted = [];
  await view.exposeFunction("tellTest", (message) => posted.push(message));
  await view.route("**/coverage-view.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body:
        `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><link rel="stylesheet" href="coverage.css">` +
        `<style>:root { --vscode-font-family: system-ui, Ubuntu, "Droid Sans", sans-serif; --vscode-font-size: 13px; --vscode-editor-font-family: "Droid Sans Mono", monospace; --vscode-foreground: #ccc; --vscode-descriptionForeground: #9d9d9d; --vscode-sideBar-background: #181818; --vscode-focusBorder: #0078d4; --vscode-button-background: #0078d4; --vscode-button-foreground: #fff; --vscode-button-secondaryBackground: #313131; --vscode-button-secondaryForeground: #ccc; --vscode-dropdown-background: #313131; --vscode-input-background: #313131; --vscode-widget-border: #313131; --vscode-badge-background: #616161; --vscode-badge-foreground: #f8f8f8; --vscode-editorWarning-foreground: #cca700; --vscode-textBlockQuote-background: #2b2b2b; }</style>` +
        `</head><body><div id="root"></div><script>window.acquireVsCodeApi = () => ({ postMessage: (m) => window.tellTest(m) });</script>` +
        `<script src="coverage.js"></script></body></html>`,
    }),
  );
  await view.goto(`http://127.0.0.1:${files.address().port}/coverage-view.html`);
  for (let i = 0; i < 50 && !posted.some((m) => m.kind === "ready"); i++) await view.waitForTimeout(100);
  await view.locator(".cov-empty", { hasText: "Open a plot" }).waitFor();
  const message = JSON.parse(readFileSync(path.join(repo, "schemas/fixtures/webview_message/valid/show-coverage.json"), "utf8"));
  message.coverage.review = {
    catalogue: "debrief-sample",
    item: "serial-1",
    title: "Serial 1",
    revised: [{ catalogue: "debrief-sample", item: "serial-2", title: "Serial 2", revision: `sha256:${"2".repeat(64)}` }],
    note: "May need review: Serial 2 was revised since Serial 1 took data from it",
  };
  await view.evaluate((m) => window.postMessage(m, "*"), message);
  await view.locator(".cov-platform").waitFor();
  // The mark: a symbol and words, its reason the tooltip and the label read aloud.
  assert.equal(await view.locator(".cov-item").getAttribute("aria-label"), "BLUE ONE navigation log. New data for Serial 1: BLUE ONE, within its period");
  assert.equal(await view.locator(".cov-tag").innerText(), "New data");
  // Never sideways, at a sidebar's widths and a phone's, in this font and a wider one.
  const widths = [];
  const noSideways = async (what) => {
    await view.waitForTimeout(150);
    const [w, c] = await view.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    widths.push(`${what}: ${w}/${c} px`);
    assert.ok(w <= c, `${what}, the Coverage view does not scroll sideways: ${w} px in ${c} px`);
  };
  for (const width of [210, 280, 390]) {
    await view.setViewportSize({ width, height: 560 });
    await noSideways(`at ${width} px`);
  }
  const wide = await view.addStyleTag({ content: "* { letter-spacing: 0.1em !important } .cov, .cov * { font-size: 15px !important }" });
  for (const width of [210, 280, 390]) {
    await view.setViewportSize({ width, height: 560 });
    await noSideways(`in a wide font at ${width} px`);
  }
  await wide.evaluate((s) => s.remove());
  console.log(`Coverage view widths (scrollWidth/clientWidth): ${widths.join("; ")}.`);
  await view.setViewportSize({ width: 280, height: 560 });
  await view.waitForTimeout(150);
  await shot("collation-vscode-coverage", view);
  const asked = async (kind) => {
    for (let i = 0; i < 20 && !posted.some((m) => m.kind === kind); i++) await view.waitForTimeout(50);
    return posted.findLast((m) => m.kind === kind);
  };
  // Touch: every button and list, and every bar, at least 24 px tall at a phone's width.
  await view.setViewportSize({ width: 390, height: 560 });
  await view.waitForTimeout(150);
  const short = await view.evaluate(() =>
    [...document.querySelectorAll(".cov button, .cov select, .cov-bar")].flatMap((el) => {
      const h = el.getBoundingClientRect().height;
      return h && h < 24 ? [`${el.className || el.tagName} ${h}px`] : [];
    }),
  );
  assert.deepEqual(short, [], "touch targets at least 24 px");
  await view.setViewportSize({ width: 280, height: 560 });
  await view.waitForTimeout(150);
  // The list, from the keyboard: picking the log asks nothing; Enter makes it supply 09:00 to 09:30.
  const list = view.locator("select").first();
  await list.focus();
  await list.selectOption("1");
  await view.waitForTimeout(200);
  assert.equal(posted.filter((m) => m.kind === "source_chosen").length, 0, "picking on the list makes no step");
  // Refused (here, said by the host): the list goes back to what supplies the period.
  await view.evaluate(() => window.postMessage({ kind: "show_coverage", message: "Refused, for the test." }, "*"));
  await view.locator(".cov-status", { hasText: "Refused, for the test." }).waitFor();
  assert.equal(await view.locator("select").first().inputValue(), "0", "a refused choice resets its list");
  assert.ok(await view.locator(".cov-set").first().isDisabled(), "and Set waits for another pick");
  await view.locator("select").first().focus();
  await view.locator("select").first().selectOption("1");
  await view.keyboard.press("Enter");
  const chosen = await asked("source_chosen");
  assert.deepEqual(chosen, { kind: "source_chosen", feature_id: "track-blue-one", time_range: { start: "2023-06-15T09:00:00.000Z", end: "2023-06-15T09:30:00.000Z" }, source: { catalogue: "debrief-sample", item: "blue-one-nav-log", track: "track-blue-one", name: "Blue One" } });
  // The host answers; drawn again, the page asks once more on a bar click.
  await view.evaluate((m) => window.postMessage(m, "*"), message);
  await view.waitForTimeout(150);
  posted.length = 0;
  const bar = view.locator(".cov-source", { hasText: "BLUE ONE navigation log" }).locator(".cov-bar");
  const box = await bar.boundingBox();
  await view.mouse.click(box.x + box.width * 0.375, box.y + box.height / 2); // 08:45 of 08:00 to 10:00: no data there
  await view.waitForTimeout(300);
  assert.equal(posted.length, 0, "a click where the source has no data asks nothing");
  await view.mouse.click(box.x + box.width * 0.625, box.y + box.height / 2); // 09:15, in the period both have
  assert.equal((await asked("source_chosen")).source.item, "blue-one-nav-log");
  await view.evaluate((m) => window.postMessage(m, "*"), message);
  await view.waitForTimeout(150);
  for (const [name, kind] of [["Same platform", "link_changed"], ["Take", "take_asked"], ["Not now", "dismiss_asked"], ["Reviewed", "review_cleared"]]) {
    posted.length = 0;
    await view.getByRole("button", { name, exact: true }).first().focus();
    await view.keyboard.press("Enter");
    assert.ok(await asked(kind), `${name} asks the host (${kind})`);
    await view.evaluate((m) => window.postMessage(m, "*"), message); // answered: drawn again
    await view.waitForTimeout(150);
  }
  // A refusal is said, and leaves what is shown.
  await view.evaluate(() => window.postMessage({ kind: "show_coverage", message: "Nothing to change: it is so already." }, "*"));
  await view.locator(".cov-status", { hasText: "Nothing to change" }).waitFor();
  assert.equal(await view.locator(".cov-platform").count(), 1);
  await view.close();
}
