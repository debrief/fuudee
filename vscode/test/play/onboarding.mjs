// Onboarding (CAP-25, NFR-09, OUT-05) and the web demo (DEP-06, DEP-07), played as a reader would.
//
// playTours: each of the four walkthroughs, start to finish, by doing what each step asks with
// the pointer and the keyboard. Each step must tick itself off from what was done, and only on
// the walkthrough's own copy, in the walkthrough shown (panel review, 17 Oct 2026): the same
// thing done to another plot, a stretch for a shear, one track selected, Coverage before the log,
// ticks nothing; a step's button opens the walkthrough's copy first, and refuses before there is
// one; starting again unticks the steps and makes one fresh copy, however often it is pressed.
// Serial 1 itself gains no step.
//
// speedRun: the onboarding trial's tasks (docs/notes/onboarding-trial.md), in the playground
// only, not VS Code: import a REP file and a legacy .dpf plot, tidy a track, annotate, and export
// a figure traced back to its plot. Counts what the test does (each click, key and field filled
// in) and the time, and fails if the tasks come to ask much more; the trial with analysts is the
// product owner's to run.
//
// playDemo: the web demo at /demo/, full screen: every panel, the walkthroughs open, the sample
// serials by default, its Content-Security-Policy. Files of the reader's own (a REP file, a Word
// narrative, an exported image found again) are read in the browser only: no request carries
// them or sends anything, no WebSocket opens, even after the tab closes; and nothing derived from
// them is kept, in any of the browser's stores, after the tab closes (product owner and panel
// review, 17 Oct 2026).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CSP } from "../../play/csp.mjs";

const ready = (page) => page.waitForFunction(() => document.getElementById("status")?.textContent?.startsWith("Ready"), null, { timeout: 240000 });
const events = (page) => page.evaluate(() => window.debriefTours().events);
/** The step's event was sent; if not, what the page said meanwhile, to see why. */
const done = (page, event) =>
  page.waitForFunction((e) => window.debriefTours().events.includes(e), event, { timeout: 90000 }).catch(async (error) => {
    const said = await page.evaluate(() => [document.getElementById("status")?.textContent, ...[...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent), JSON.stringify(window.debriefTours())]);
    throw new Error(`${event} was not done. The page said: ${said.join(" | ")}. ${error.message}`);
  });
/** Not ticked, after giving it the time a tick would take. */
const notDone = async (page, event, why) => {
  await page.waitForTimeout(600);
  assert.ok(!(await events(page)).includes(event), why);
};
const stepRow = (page, index) => page.locator("#tour .tour-step").nth(index);
/** A step's own button, in its body (open once it is the step to do next). */
const go = (page, index) => stepRow(page, index).locator(".tour-body > button");
/** A step's button, its step opened first if it is closed (a step done closes). */
async function press(page, index) {
  if ((await stepRow(page, index).locator(".tour-head").getAttribute("aria-expanded")) === "false") await stepRow(page, index).locator(".tour-head").click();
  await go(page, index).click();
}
const stepAdded = (page, count) => page.waitForFunction((c) => document.querySelectorAll("#history li").length > c, count, { timeout: 60000 });
const steps = (page) => page.locator("#history li").count();
/** How many steps a plot's history has, read from Python, whatever plot is open. */
const stepsOf = (page, item) => page.evaluate((i) => window.debriefStepsOf(i), item);
const copiesTitled = async (page, title) => (await page.locator("#plots option").allInnerTexts()).filter((t) => t === title).length;

/** The step is ticked, and says so to a screen reader. */
async function ticked(page, index, title) {
  const row = stepRow(page, index);
  await page.waitForFunction((i) => document.querySelectorAll("#tour .tour-step")[i]?.classList.contains("done"), index, { timeout: 30000 });
  assert.match(await row.locator(".tour-head").innerText(), new RegExp(`${title}`));
  assert.equal(await row.locator(".visually-hidden").innerText(), ", done");
  assert.equal(await row.locator(".tour-mark").innerText(), "✓");
}

/** How wide the map is, in pixels. */
const mapWidth = async (page) => (await page.locator(".frame-map").boundingBox()).width;
/** Wholly in sight in the walkthroughs' column on the right, not scrolled away in it or off the screen. */
const inSight = (locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const g = document.getElementById("guide").getBoundingClientRect();
    return r.height > 0 && r.top >= Math.max(0, g.top) - 1 && r.bottom <= Math.min(innerHeight, g.bottom) + 1 && r.left >= g.left - 1 && r.right <= g.right + 1;
  });
/** The page itself scrolls sideways. */
const pageSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

/**
 * On a wide screen the walkthroughs are a column of their own on the right of the map, a
 * labelled landmark; folded, a narrow tab, and the map takes the rest (product owner, 22 Oct 2026).
 */
/**
 * The window resized, once the walkthroughs' panel has moved for it: a media query's change
 * arrives after the resize, later on a slow machine, so where it sits is read only after.
 */
export async function resize(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction((into) => document.getElementById("panel-tour")?.parentElement?.id === into, width >= 1200 ? "guide" : "side");
}

async function rightColumn(page, open) {
  assert.equal(await page.locator("#panel-tour").evaluate((s) => s.parentElement.id), "guide", "the walkthroughs in the right-hand column");
  assert.equal(await page.getByRole("complementary", { name: "Walkthroughs" }).getByRole("heading", { level: 2, name: /^Walkthroughs$/i }).count(), 1);
  const map = await page.locator(".frame-map").boundingBox();
  const guide = await page.locator("#guide").boundingBox();
  assert.ok(guide.x >= map.x + map.width - 1, "right of the map");
  assert.ok(Math.abs(guide.x + guide.width - (page.viewportSize()?.width ?? 0)) <= 1, "at the right edge of the window");
  assert.equal(await page.locator("#panel-tour button.fold").getAttribute("aria-expanded"), String(open));
  if (open) assert.ok(guide.width >= 240 && guide.width <= 302, `open, the column is 240 to 300 px wide: ${guide.width}`);
  else assert.ok(guide.width <= 40, `folded, the column is a narrow tab: ${guide.width}`);
  assert.equal(await page.locator("#side > #panel-tour").count(), 0);
  assert.equal(await page.locator("#side > section:not([hidden])").first().getAttribute("id"), "panel-time", "the side column starts with the time controller");
}

/** The walkthroughs' panel open, if this reader folded it (it starts open everywhere: product owner, 22 Oct 2026). */
async function openTours(page) {
  const fold = page.locator("#panel-tour button.fold");
  if ((await fold.getAttribute("aria-expanded")) === "false") await fold.click();
}

/**
 * Open on first load, wherever the panel is (product owner, 22 Oct 2026, superseding 17 Oct's
 * folded outside the web demo): in the right-hand column from 1200 px, else first in the side column.
 */
export async function openOnFirstLoad(page, where) {
  await page.locator("#panel-tour button.fold").waitFor();
  assert.equal(await page.locator("#panel-tour button.fold").getAttribute("aria-expanded"), "true", `${where}: the walkthroughs open on first load`);
  assert.equal(await page.locator("#body-tour").isVisible(), true, `${where}: their steps in sight`);
  const wide = (page.viewportSize()?.width ?? 0) >= 1200;
  if (wide) await rightColumn(page, true);
  else assert.equal(await page.locator("#side > section:not([hidden])").first().getAttribute("id"), "panel-tour", `${where}: first in the side column`);
}

/** A colour as the browser computes it (rgb(), rgba() or color(srgb ...)), as [r, g, b, a] in 0 to 255 and 0 to 1. */
function rgba(text) {
  const srgb = text.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])];
  const rgb = text.match(/^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?\)$/);
  assert.ok(rgb, `a colour: ${text}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
}
const over = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
const luminance = (c) => {
  const [r, g, b] = c.slice(0, 3).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG's contrast ratio between two opaque colours. */
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const near = (a, b, by = 2) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= by);

/**
 * The guidance accent (style guide, Theme; product owner, 22 Oct 2026): the theme's link colour
 * (--vscode-textLink-foreground) as a 3 px edge on the panel, a heading bar tinted with it, the
 * steps' numbers in it and the next step's a disc of it; folded, the tab carries it too. Its
 * heading and step text keep WCAG AA contrast, 4.5:1, on the theme given. Returns the ratios.
 */
export async function guidanceAccent(page, scheme) {
  await page.locator("#tour .tour-step.next .tour-mark").waitFor();
  const read = () =>
    page.evaluate(() => {
      const css = (el, prop) => getComputedStyle(el).getPropertyValue(prop);
      const probe = document.createElement("span");
      probe.style.color = "var(--vscode-textLink-foreground)";
      probe.style.backgroundColor = "var(--vscode-sideBar-background)";
      document.body.append(probe);
      const theme = { accent: css(probe, "color"), sideBar: css(probe, "background-color") };
      probe.remove();
      /** The colours behind an element, nearest first, until an opaque one. */
      const behind = (el) => {
        const layers = [];
        for (let at = el; at; at = at.parentElement) {
          const bg = css(at, "background-color");
          if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") layers.push(bg);
        }
        return layers;
      };
      const panel = document.getElementById("panel-tour");
      const heading = panel.querySelector(":scope > h2");
      const text = (el) => ({ color: css(el, "color"), behind: behind(el), what: el.className || el.tagName });
      return {
        theme,
        light: document.documentElement.classList.contains("light"),
        folded: panel.classList.contains("folded"),
        inGuide: panel.parentElement.id === "guide",
        edge: { width: css(panel, "border-left-width"), colour: css(panel, "border-left-color"), style: css(panel, "border-left-style") },
        bar: css(heading, "background-color"),
        tab: css(panel, "background-color"),
        texts: panel.classList.contains("folded")
          ? [text(heading.querySelector("button.fold"))]
          : [
              text(heading.querySelector("button.fold")),
              ...[...panel.querySelectorAll(".tour-title, .tour-summary, .tour-step:not(.done) .tour-mark, .tour-body:not([hidden]) p")].map(text),
            ],
        marks: [...panel.querySelectorAll(".tour-step:not(.done):not(.next) .tour-mark")].map((m) => ({ color: css(m, "color"), border: css(m, "border-top-color") })),
        next: (() => {
          const m = panel.querySelector(".tour-step.next .tour-mark");
          return { color: css(m, "color"), bg: css(m, "background-color") };
        })(),
      };
    });
  const ratios = [];
  const check = async (folded) => {
    const got = await read();
    assert.equal(got.light, scheme === "light", `the playground's ${scheme} theme`);
    assert.equal(got.folded, folded);
    const accent = rgba(got.theme.accent);
    const sideBar = rgba(got.theme.sideBar);
    const tint = [0.14 * accent[0] + 0.86 * sideBar[0], 0.14 * accent[1] + 0.86 * sideBar[1], 0.14 * accent[2] + 0.86 * sideBar[2]];
    assert.ok(!near(accent, sideBar, 10), `${scheme}: the accent stands apart from the panel's background`);
    // The edge: 3 px of the theme's link colour, folded or open.
    assert.equal(got.edge.width, "3px", `${scheme}: a 3 px edge`);
    assert.equal(got.edge.style, "solid");
    assert.ok(near(rgba(got.edge.colour), accent), `${scheme}: the edge in the accent (${got.edge.colour}, ${got.theme.accent})`);
    if (folded && got.inGuide) {
      assert.ok(near(rgba(got.tab), tint), `${scheme}: the folded tab tinted with the accent (${got.tab})`);
    } else {
      assert.ok(near(rgba(got.bar), tint), `${scheme}: the heading bar tinted with the accent (${got.bar})`);
    }
    if (!folded) {
      for (const mark of got.marks) assert.ok(near(rgba(mark.color), accent) && near(rgba(mark.border), accent), `${scheme}: a step's number in the accent`);
      assert.ok(got.marks.length >= 3, "the steps to come are numbered");
      assert.ok(near(rgba(got.next.bg), accent), `${scheme}: the next step's marker a disc of the accent`);
      assert.ok(near(rgba(got.next.color), sideBar), `${scheme}: its number the panel's background`);
    }
    for (const t of got.texts) {
      const back = t.behind.reverse().reduce((under, layer) => over(rgba(layer), under), [0, 0, 0, 1]);
      const fore = over(rgba(t.color), back);
      const ratio = contrast(fore, back);
      ratios.push(ratio);
      assert.ok(ratio >= 4.5, `${scheme}${folded ? ", folded" : ""}: ${t.what} at ${ratio.toFixed(2)}:1, under WCAG AA's 4.5:1 (${t.color} on ${t.behind.join(" over ")})`);
    }
  };
  const fold = page.locator("#panel-tour button.fold");
  const wasOpen = (await fold.getAttribute("aria-expanded")) === "true";
  if (!wasOpen) await fold.click();
  await check(false);
  await fold.click();
  await check(true);
  await fold.click();
  return { least: Math.min(...ratios), count: ratios.length };
}

/** The first hour post's demo, which includes the walkthroughs: open when it starts, accented. */
export async function playTourInThePost(browser, siteUrl, shot) {
  const post = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  const errors = [];
  post.on("pageerror", (e) => errors.push(String(e)));
  await post.goto(`${siteUrl}/blog/2026/10/22/first-hour/`);
  const demo = post.locator(".debrief-demo").first();
  assert.match(await demo.getAttribute("data-demo"), /panels=tour/, "the post's demo includes the walkthroughs");
  await demo.getByRole("button", { name: "Start the demo" }).click();
  const frame = post.frameLocator(".debrief-demo-frame");
  await frame.locator("#panel-tour button.fold").waitFor({ timeout: 60000 });
  assert.equal(await frame.locator("#panel-tour button.fold").getAttribute("aria-expanded"), "true", "in the post's demo the walkthroughs open on first load");
  assert.equal(await frame.locator("#body-tour").isVisible(), true);
  assert.equal(await frame.locator("#side > section:not([hidden])").first().getAttribute("id"), "panel-tour", "first in the demo's side column");
  assert.equal(await frame.locator("#panel-tour").evaluate((p) => getComputedStyle(p).borderLeftWidth), "3px", "with the accent's edge");
  await frame.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
  await demo.scrollIntoViewIfNeeded();
  await shot("accent-03-in-the-post", post);
  assert.deepEqual(errors, []);
  await post.close();
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

/** Over the ground, for each track of a REP file, as legacy Debrief asked: each question answered once it is asked. */
async function answerImport(page) {
  const dialog = page.locator("dialog.track-form[open]");
  for (let i = 0; i < 4; i++) {
    const asked = await dialog.first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    if (!asked) break;
    const handle = await dialog.first().elementHandle();
    await dialog.first().getByRole("button", { name: "Import" }).click();
    await page.waitForFunction((d) => !d.isConnected, handle, { timeout: 10000 });
  }
}

/** Draw an area on the map, clear of the tracks (the north-east of the exercise area), and name it. */
async function drawArea(page, act = async (x) => x) {
  const mapFrame = page.frameLocator(".frame-map");
  await act(mapFrame.getByRole("toolbar", { name: "Draw an annotation" }).getByRole("button", { name: "Area", exact: true }).click());
  const box = await page.locator(".frame-map").boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  for (const [fx, fy] of [[0.72, 0.1], [0.84, 0.1], [0.84, 0.2]]) await act(page.mouse.click(...at(fx, fy)));
  await act(page.mouse.dblclick(...at(0.72, 0.2)));
  const form = page.frameLocator(".frame-annotation");
  await act(form.locator("#field-name input").fill("Search area"));
  await act(form.getByRole("button", { name: "Add" }).click());
}

export async function playTours(page, shot, root) {
  const mapFrame = page.frameLocator(".frame-map");
  const dialog = page.locator("dialog.track-form");
  const side = page.locator("#side-frame");
  const serial1 = await stepsOf(page, "serial-1");

  // The walkthroughs start open, here as everywhere (product owner, 22 Oct 2026); this reader
  // folded them at the start of play.mjs, and folded they stay, remembered in this browser. On a
  // wide screen they are a column on the right of the map, folded to a narrow tab; opened, the map
  // narrows by the column's width, and folded again, widens back, from the pointer or the keyboard.
  await rightColumn(page, false);
  const wideMap = await mapWidth(page);
  await openTours(page);
  await rightColumn(page, true);
  const narrowMap = await mapWidth(page);
  assert.ok(wideMap - narrowMap >= 200, `the map narrows as the walkthroughs open: ${wideMap} to ${narrowMap} px`);
  await page.locator("#panel-tour button.fold").focus();
  await page.keyboard.press("Enter");
  await rightColumn(page, false);
  assert.ok(Math.abs((await mapWidth(page)) - wideMap) <= 1, "folded, the map widens back");
  await page.keyboard.press("Space");
  await rightColumn(page, true);
  assert.equal(await page.evaluate(() => document.activeElement?.closest("section")?.id), "panel-tour", "the keyboard stays on its heading");
  assert.equal(await stepRow(page, 0).locator(".tour-head").getAttribute("aria-expanded"), "true");
  await stepRow(page, 0).locator(".tour-media svg").waitFor({ timeout: 15000 }); // the same picture as VS Code's
  assert.equal(await stepRow(page, 0).locator(".tour-media").getAttribute("role"), "img");

  // Before its copy, a step's button does nothing to the plot that is open, and says why.
  await page.selectOption("#tour-pick", "annotate");
  await stepRow(page, 1).locator(".tour-head").click();
  await go(page, 1).click();
  await page.locator(".toast", { hasText: "Open a copy of serial 1 first" }).waitFor();
  assert.equal(await page.locator("#plots").inputValue(), "serial-1");

  // --- Open and explore a serial -----------------------------------------------------
  await page.selectOption("#tour-pick", "explore");
  // Pressed twice: one copy, not two.
  await go(page, 0).dblclick();
  await done(page, "exploreOpened");
  await page.waitForTimeout(500);
  assert.equal(await copiesTitled(page, "Serial 1: Open and explore a serial"), 1, "a double click makes one copy");
  await ticked(page, 0, "Open a copy of serial 1");
  await shot("tour-01-explore-open");
  // The step's words stay in sight while the side column is scrolled to its end, and while the
  // step is done there: its button scrolls the side column to the time controller, never the column
  // on the right, nor the page.
  await page.locator("#side").evaluate((s) => (s.scrollTop = s.scrollHeight));
  assert.ok((await page.locator("#side").evaluate((s) => s.scrollTop)) > 300, "the side column scrolled down");
  const stepWords = stepRow(page, 1).locator(".tour-body p").first();
  assert.ok(await inSight(stepWords), "the step's words in sight, the side column scrolled to its end");
  assert.ok(await inSight(go(page, 1)), "and its button");
  // Its button only takes the reader there: pressing it ticks nothing.
  await go(page, 1).click();
  assert.ok(await inSight(stepWords), "the step's words in sight as it is done");
  assert.equal(await page.evaluate(() => scrollY), 0, "the page itself does not scroll");
  assert.equal(await page.evaluate(() => document.activeElement?.closest("section")?.id), "panel-time");
  assert.equal(await stepRow(page, 1).getAttribute("class"), "tour-step next");
  await page.locator("#timebar .tc-current").focus();
  await page.keyboard.press("ArrowRight");
  await done(page, "timeMoved");
  await ticked(page, 1, "Move current time");
  // Select from the keyboard, as the step says: Enter, then Ctrl+Enter adds. One track is not it.
  await page.locator('#outline li[data-id="track-blue-one"]').focus();
  await page.keyboard.press("Enter");
  await notDone(page, "selected", "one track selected is not the step");
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
  assert.ok(await inSight(stepRow(page, 4).locator(".tour-body p").first()), "the Timeline step's words in sight");
  await page.locator('#timeline .tl-row[data-kind="narrative"]').nth(3).click();
  assert.ok((await page.locator("#side").evaluate((s) => s.scrollTop)) > 0, "the side column scrolled to the Timeline");
  assert.ok(await inSight(stepRow(page, 4).locator(".tour-head")), "the step still in sight, the side column scrolled to the Timeline");
  await done(page, "timelineChosen");
  await ticked(page, 4, "Read the narrative in the Timeline");
  assert.match(await page.locator("#tour .tour-said").innerText(), /That is the whole of Open and explore a serial/);
  await page.locator("#panel-tour").scrollIntoViewIfNeeded();
  await shot("tour-02-explore-done");

  // --- Import and collate ------------------------------------------------------------
  await startTour(page, "collate");
  // Coverage looked at before the log is imported is not the step.
  await stepRow(page, 2).locator(".tour-head").click();
  await go(page, 2).click();
  await notDone(page, "coverageShown", "Coverage before the log is imported");
  // A file of the reader's own is not the walkthrough's import.
  await page.locator("#file").setInputFiles(path.join(root, "sample", "serial-3", "sources", "red-one.rep"));
  await answerImport(page);
  await page.locator(".omitted-panel h2", { hasText: "red-one.rep: imported" }).waitFor({ timeout: 60000 });
  await notDone(page, "imported", "the reader's own file is not the walkthrough's log");
  assert.notEqual(await page.locator("#plots").inputValue(), "serial-1-collate");
  // The step's button opens the walkthrough's copy again, then imports its log.
  await go(page, 1).click();
  await answerImport(page);
  await done(page, "imported");
  assert.equal(await page.locator("#plots").inputValue(), "serial-1-collate", "the copy is open: the log is new data for it");
  const log = page.locator("#items > li", { has: page.locator(".item-title", { hasText: "blue-one-nav-log" }) });
  await log.locator(".item-mark").waitFor({ timeout: 60000 });
  await page.locator(".side-bar button", { hasText: "Close" }).click();
  // With the walkthroughs in their own column, Coverage may already be in sight in the side column
  // once the log is in, which is the step done; if not, its button brings it into sight.
  if (!(await events(page)).includes("coverageShown")) await go(page, 2).click();
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
  // The same change to another plot ticks nothing: serial 2's RED ONE smoothed by hand.
  await page.selectOption("#plots", "serial-2");
  await page.waitForFunction(() => document.getElementById("plot-title")?.textContent === "Serial 2", null, { timeout: 60000 });
  n = await steps(page);
  await page.locator('#outline li[data-id="track-red-one"]').click();
  await page.locator("#smooth-track").click();
  await page.locator("#track-form-window").fill("5");
  await dialog.getByRole("button", { name: "Preview" }).click();
  await side.getByRole("button", { name: "Apply" }).click();
  await stepAdded(page, n);
  await notDone(page, "smoothed", "smoothing another plot is not the step");
  // The step's button takes the reader back to the copy (with Serial 2 open) before it acts.
  await go(page, 1).click(); // selects RED ONE and opens Jumps…
  await page.waitForFunction(() => document.getElementById("plots")?.value === "serial-1-tidy", null, { timeout: 60000 });
  await page.locator(".toast", { hasText: "the walkthrough works on its copy" }).first().waitFor();
  await dialog.getByRole("button", { name: "Find" }).click();
  await side.getByRole("button", { name: "Remove 3 jumps" }).click();
  await done(page, "jumpsRemoved");
  await go(page, 2).click();
  await page.locator("#track-form-window").fill("5");
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
  // A stretch is not the shear the step asks for.
  await page.locator('#outline li[data-id="track-blue-one"]').click();
  await page.locator("#stretch-track").click();
  await page.locator("#track-form-speed").fill("8");
  n = await steps(page);
  await dialog.getByRole("button", { name: "Stretch" }).click();
  await stepAdded(page, n);
  await notDone(page, "sheared", "a stretch is not a shear");
  await go(page, 4).click();
  await page.locator("#track-form-course").fill("200");
  await page.locator("#track-form-speed").fill("6");
  await dialog.getByRole("button", { name: "Shear" }).click();
  await done(page, "sheared");
  await ticked(page, 4, "Shear a leg, as in TMA");
  await page.locator("#panel-tour").scrollIntoViewIfNeeded();
  await shot("tour-04-tidy-done");
  // Started again: one fresh copy, its steps unticked; the old copy gone.
  await press(page, 0);
  await page.waitForFunction(() => { const e = window.debriefTours().events; return e.includes("tidyOpened") && !e.includes("jumpsRemoved") && !e.includes("sheared"); }, null, { timeout: 60000 });
  assert.equal(await copiesTitled(page, "Serial 1: Tidy a track"), 1, "starting again leaves one copy");
  assert.match(await page.locator("#history li .name").first().innerText(), /^GPS glitches put into RED ONE$/, "the fresh copy has its glitches again");
  assert.equal(await stepRow(page, 1).getAttribute("class"), "tour-step next");

  // --- Annotate and export a figure --------------------------------------------------
  await startTour(page, "annotate");
  await drawArea(page);
  await done(page, "annotationAdded");
  await go(page, 2).click(); // selects BLUE ONE and RED ONE and opens Frequencies…
  await page.locator("#freq-label_interval").selectOption({ label: "Every 10 min" });
  await dialog.getByRole("button", { name: "Apply" }).click();
  await done(page, "frequenciesSet");
  await go(page, 3).click();
  await page.selectOption("#export-preset", "slide");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.locator("#export-image").click()]);
  assert.match(download.suggestedFilename(), /\.png$/);
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

  // Serial 1 itself, read from Python: no step was added to it by any walkthrough.
  assert.equal(await stepsOf(page, "serial-1"), serial1, "Serial 1's history gained no step");

  // The panel at laptops' widths, in its column on the right; at a phone's and a blog's widths, and
  // in the side column of a 650 to 750 px window (210 px wide there), first in the side column as
  // before; in a wider font too: nothing scrolls sideways, the page, Import's file boxes neither.
  // From 1200 px the map keeps 640 px or more beside the two columns.
  const widths = [];
  for (const wide of [false, true]) {
    const style = wide ? await page.addStyleTag({ content: "#side *, #guide * { letter-spacing: 0.1em !important; font-size: 15px !important }" }) : undefined;
    for (const width of [1440, 1366, 1280, 1200, 1199, 1024, 750, 700, 650, 390, 280, 210]) {
      await resize(page, width, 800);
      await page.waitForTimeout(300);
      if (width >= 1200) {
        await rightColumn(page, true);
        assert.ok((await mapWidth(page)) >= 640, `at ${width} px the map keeps 640 px: ${await mapWidth(page)}`);
      } else {
        assert.equal(await page.locator("#guide").isHidden(), true, `no right-hand column at ${width} px`);
        assert.equal(await page.locator("#side > section:not([hidden])").first().getAttribute("id"), "panel-tour", `at ${width} px the walkthroughs are first in the side column`);
        assert.equal(await page.locator("#side > section:not([hidden])").nth(1).getAttribute("id"), "panel-time");
      }
      assert.equal(await pageSideways(page), false, `at ${width} px the page does not scroll sideways`);
      const over = await page.evaluate(() =>
        ["#side", "#guide", "#body-tour", "#tour", ".tour-steps", ".tour-pick", "#body-import", ...[...document.querySelectorAll(".tour-body")].map((_, i) => `.tour-step:nth-child(${i + 1}) .tour-body`)].flatMap((s) => {
          const el = document.querySelector(s);
          return el && el.offsetParent && el.scrollWidth > el.clientWidth + 1 ? [`${s} ${el.scrollWidth}/${el.clientWidth}`] : [];
        }),
      );
      widths.push(`${wide ? "wide font, " : ""}${width} px: ${over.length ? over.join(", ") : "fits"}`);
      assert.deepEqual(over, [], `${wide ? "in a wide font, " : ""}at ${width} px neither column scrolls sideways`);
      if (width === 280 && !wide) {
        await page.locator("#panel-tour").scrollIntoViewIfNeeded();
        await shot("tour-06-narrow");
      }
    }
    await style?.evaluate((s) => s.remove());
  }
  await resize(page, 1400, 820);
  await rightColumn(page, true);
  console.log(`Walkthroughs played, every step ticked by what was done on its copy, none by the same thing done elsewhere: ${(await events(page)).length} of 20 (Tidy a track started again). In the right-hand column from 1200 px, the step's words in sight while the side column scrolls; sideways scroll: ${widths.join("; ")}.`);
}

/** The most the trial's tasks may take in the playground before the speed run fails: a regression in what they ask. */
export const SPEED_RUN_MOST = 36;

/**
 * The onboarding trial's tasks, in the playground (not VS Code), done as quickly as the page
 * answers, counting each thing the test does. Not the trial: it shows the tasks can be done, and
 * fails if they come to ask more than SPEED_RUN_MOST actions.
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
  // 1. Import a REP file (serial 2's RED ONE, over the ground) and a legacy .dpf plot (product owner, 17 Oct 2026).
  let t = Date.now();
  let c = actions;
  await act(page.locator("#file").setInputFiles(path.join(root, "sample", "serial-2", "sources", "red-one.rep")));
  await dialog.waitFor({ timeout: 60000 });
  await act(dialog.getByRole("button", { name: "Import" }).click());
  await page.locator(".omitted-panel h2", { hasText: "red-one.rep: imported 1 track" }).waitFor({ timeout: 60000 });
  await act(page.locator(".side-bar button", { hasText: "Close" }).click());
  const dpf = path.resolve("../python/debrief-io/tests/data/shapes.dpf");
  assert.ok(existsSync(dpf), "the legacy plot the speed run imports");
  await act(page.locator("#file").setInputFiles(dpf));
  await page.locator(".omitted-panel h2", { hasText: "shapes.dpf: imported" }).waitFor({ timeout: 60000 });
  await act(page.locator(".side-bar button", { hasText: "Close" }).click());
  lap("Import (REP and .dpf)", t, c);

  // 2. Tidy RED ONE: the walkthrough's copy, its jumps removed, smoothed over 5 fixes.
  t = Date.now();
  c = actions;
  await page.locator("#panel-tour").scrollIntoViewIfNeeded();
  await act(page.selectOption("#tour-pick", "tidy"));
  if ((await stepRow(page, 0).locator(".tour-head").getAttribute("aria-expanded")) === "false") await act(stepRow(page, 0).locator(".tour-head").click());
  await act(go(0).click());
  await page.waitForFunction(() => document.getElementById("plots")?.value === "serial-1-tidy", null, { timeout: 60000 });
  let n = await steps(page);
  await act(go(1).click());
  await act(dialog.getByRole("button", { name: "Find" }).click());
  await act(side.getByRole("button", { name: "Remove 3 jumps" }).click());
  await stepAdded(page, n);
  n = await steps(page);
  await act(go(2).click());
  await act(page.locator("#track-form-window").fill("5"));
  await act(dialog.getByRole("button", { name: "Preview" }).click());
  await act(side.getByRole("button", { name: "Apply" }).click());
  await stepAdded(page, n);
  assert.match(await page.locator("#history li .name").first().innerText(), /^RED ONE smoothed over 5 fixes$/);
  lap("Tidy", t, c);

  // 3. Annotate: an area drawn and named; both tracks labelled every 10 minutes.
  t = Date.now();
  c = actions;
  n = await steps(page);
  await drawArea(page, act);
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
  console.log(`Onboarding speed run, in the playground only (the trial's tasks, done by the test as fast as the page answers; the walkthrough's buttons used where a step has one): ${actions} actions in ${seconds.toFixed(1)} s, at most ${SPEED_RUN_MOST} allowed. ${tasks.join("; ")}.`);
  assert.ok(actions <= SPEED_RUN_MOST, `the trial's tasks take ${actions} actions, more than ${SPEED_RUN_MOST}`);
  return { actions, seconds, tasks };
}

/** The web demo, at /demo/ on the built site. */
export async function playDemo(browser, siteUrl, shot) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 820 }, acceptDownloads: true });
  const requests = [];
  const sockets = [];
  const violations = [];
  context.on("request", (request) => requests.push({ url: request.url(), method: request.method(), body: request.postDataBuffer() }));
  const errors = [];
  const watch = (on) => {
    on.on("pageerror", (e) => errors.push(String(e)));
    on.on("websocket", (ws) => sockets.push(ws.url()));
    on.on("console", (m) => /Content Security Policy|Refused to/.test(m.text()) && violations.push(m.text()));
  };
  let page = await context.newPage();
  watch(page);

  // The home page leads to it.
  await page.goto(`${siteUrl}/`);
  const link = page.locator('a[href$="demo/"]').first();
  assert.equal(await link.count(), 1, "the home page links to the web demo");
  await Promise.all([page.waitForURL(/\/demo\/$/), link.click()]);
  await ready(page);
  assert.equal(await page.title(), "Debrief web demo");
  // Its policy, before anything it loads, in the page and in each frame (product owner, 17 Oct 2026).
  assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content"), CSP);
  for (const frame of page.frames().slice(1)) assert.equal(await frame.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content"), CSP, frame.url());
  // Full screen, every panel, the walkthroughs open in their column on the right; the sample serials by default.
  const shown = async () => page.$$eval("#side > section", (all) => all.filter((s) => !s.hidden).map((s) => s.id));
  const others = ["panel-time", "panel-tote", "panel-plot", "panel-outline", "panel-timeline", "panel-catalogue", "panel-coverage", "panel-tools", "panel-history", "panel-export", "panel-try", "panel-import"];
  assert.deepEqual(await shown(), others);
  await rightColumn(page, true);
  // On a phone, first in the one column, as before; and back on the right when wide again.
  await resize(page, 390, 844);
  assert.deepEqual(await shown(), ["panel-tour", ...others]);
  assert.equal(await page.locator("#guide").isHidden(), true);
  assert.equal(await pageSideways(page), false, "at 390 px the demo does not scroll sideways");
  await resize(page, 1400, 820);
  await rightColumn(page, true);
  assert.equal(await page.locator("#plots").inputValue(), "serial-1");
  assert.deepEqual(await page.locator("#plots option").allInnerTexts(), ["Serial 1", "Serial 2", "Serial 3"]);
  assert.ok((await page.locator("#tools button").count()) > 3);
  assert.ok(await page.frameLocator(".frame-map").locator(".leaflet-interactive").count());
  await shot("demo-01-full-screen", page);

  // A file of the reader's own, its narrative's source and type named after the marker: read in the browser.
  const marker = `LOCALONLY${Date.now().toString(36).toUpperCase()}`;
  const rep =
    [
      `;; ${marker}: a file of the reader's own`,
      ...Array.from({ length: 12 }, (_, i) => `230615 0${8 + Math.floor(i / 6)}${String((i % 6) * 10).padStart(2, "0")}00.000 ${marker} @A 37 00 00.00 N 075 ${String(30 + i).padStart(2, "0")} 00.00 W 090.0 10.0 0`),
      `;NARRATIVE2: 230615 083000.000 ${marker} ${marker}TYPE Seen by ${marker} at the start.`,
    ].join("\n") + "\n";
  await page.locator("#file").setInputFiles({ name: `${marker.toLowerCase()}.rep`, mimeType: "text/plain", buffer: Buffer.from(rep) });
  await answerImport(page);
  await page.locator(".omitted-panel h2", { hasText: "imported 1 track" }).waitFor({ timeout: 60000 });
  assert.match(await page.locator("#outline").innerText(), new RegExp(marker));
  // The Timeline used on it: its source filtered out, its words highlighted (H1, panel review, 17 Oct 2026).
  const timeline = (selector) => page.locator(`#timeline ${selector}`);
  await timeline(".tl-filter-button").click();
  await timeline(`.tl-filter input[data-member="sources"][data-name="${marker}"]`).uncheck();
  await timeline(`.tl-filter input[data-member="types"][data-name="${marker}TYPE"]`).uncheck();
  await timeline(".tl-filter-button").click();
  await timeline(".tl-view-button").click();
  await timeline(".tl-highlights").fill(`${marker}, seen`);
  await page.waitForFunction(() => window.debriefTimeline().view.highlights.length === 2);
  await timeline(".tl-view-button").click();
  // A Word narrative read into it.
  await page.locator("#narrative-file").setInputFiles(path.resolve(import.meta.dirname, "red-one-log.docx"));
  await page.locator("dialog.track-form[open] button.primary").click({ timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector("dialog.track-form[open]"), null, { timeout: 60000 });
  // An image exported, and found again from its file.
  await page.locator("#panel-export").scrollIntoViewIfNeeded();
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.locator("#export-image").click()]);
  const png = readFileSync(await download.path());
  await page.locator("#find-file").setInputFiles({ name: "figure.png", mimeType: "image/png", buffer: png });
  await page.frameLocator(".frame-map").locator(".revision-banner").waitFor({ state: "visible", timeout: 60000 });
  await page.frameLocator(".frame-map").locator(".revision-banner button").click();

  // Never sent: the worker's requests are watched too (its wheels and Pyodide come through it).
  const sending = () => requests.filter((r) => r.body?.length || !["GET", "HEAD"].includes(r.method));
  const carrying = () => requests.filter((r) => r.url.toUpperCase().includes(marker) || (r.body && r.body.toString("latin1").includes(marker)));
  assert.ok(requests.some((r) => r.url.includes("/play/wheels/")) && requests.some((r) => r.url.includes("pyodide")), "the worker's requests are seen");
  assert.deepEqual(carrying(), [], "no request carries the file, in its address or its body");
  assert.deepEqual(sending(), [], "the demo sends nothing anywhere: every request only fetches");
  assert.deepEqual(sockets, [], "no WebSocket opens");

  // Nothing derived from it kept, in any of the browser's stores.
  const kept = async (on) =>
    on.evaluate(async (m) => {
      const values = (storage) => Array.from({ length: storage.length }, (_, i) => `${storage.key(i)}=${storage.getItem(storage.key(i))}`);
      const opfs = [];
      try {
        for await (const [name] of (await navigator.storage.getDirectory()).entries()) opfs.push(name);
      } catch {
        // no origin private file system here: nothing in it
      }
      return {
        local: values(localStorage).filter((v) => v.toUpperCase().includes(m) || /BLUE ONE|RED ONE|SEEN/i.test(v)),
        session: values(sessionStorage).filter((v) => v.toUpperCase().includes(m)),
        indexedDB: (await indexedDB.databases()).map((d) => d.name),
        caches: await caches.keys(),
        opfs,
      };
    }, marker);
  const none = { local: [], session: [], indexedDB: [], caches: [], opfs: [] };
  assert.deepEqual(await kept(page), none);
  // The Timeline's filter is remembered all the same, without the words: its kinds and view only.
  const remembered = await page.evaluate(() => localStorage.getItem("debrief.play.timelineFilter"));
  assert.ok(remembered && !/sources|types|highlights/.test(remembered), `the Timeline keeps no words: ${remembered}`);

  // Closed: nothing sent as it closes (a beacon, a request kept alive), and nothing kept.
  const beforeClose = requests.length;
  await page.close();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.deepEqual(sending(), [], "nothing sent as the tab closes");
  assert.deepEqual(requests.slice(beforeClose), [], "no request at all as the tab closes");
  page = await context.newPage();
  watch(page);
  await page.goto(`${siteUrl}/demo/`);
  await ready(page);
  assert.deepEqual(await page.locator("#plots option").allInnerTexts(), ["Serial 1", "Serial 2", "Serial 3"]);
  assert.doesNotMatch(await page.locator("#outline").innerText(), new RegExp(marker));
  assert.deepEqual(await kept(page), none);
  // A walkthrough runs here as in the playground.
  await page.selectOption("#tour-pick", "explore");
  await go(page, 0).click();
  await done(page, "exploreOpened");
  await page.locator("#panel-tour").scrollIntoViewIfNeeded();
  await shot("demo-02-walkthrough", page);
  assert.deepEqual(sockets, []);
  assert.deepEqual(violations, [], "nothing the page needs is refused by its policy");
  console.log(`Web demo: every panel, the walkthroughs open, its policy in the page and every frame; a REP file, a Word narrative and an image of the reader's own read in the browser: ${requests.length} requests, none carrying them or sending anything, no WebSocket, nothing as the tab closed; nothing derived from them kept after.`);
  assert.deepEqual(errors, []);
  await context.close();
}
