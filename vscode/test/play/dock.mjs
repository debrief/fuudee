// The browser's docked layout (product owner, 23 Oct 2026): the default "A, task-grouped" layout,
// dragging and splitting, moving by keyboard, remembering and Reset; frames never reloaded and
// Python's state kept; the narrow fallback; a blog post's fixed layout (dock.ts, host.ts).
import assert from "node:assert/strict";

const LAYOUT_KEY = "debrief.play.layout";
/** Every panel with a tab of its own, docked. */
export const DOCKED_PANELS = ["panel-time", "panel-tote", "panel-outline", "panel-catalogue", "panel-timeline", "panel-coverage", "panel-tour", "panel-tools", "panel-history"];
/** The default layout, group by group (dock.ts, DEFAULT_GROUPS), the panel in front first. */
const DEFAULT = [
  "centre:map",
  "left:panel-time",
  "left:panel-tote",
  "left:panel-outline,panel-catalogue",
  "centre:panel-timeline,panel-coverage",
  "right:panel-tour,panel-tools,panel-history",
];

/** The layout as it is: docked or not, and each group as "place:panel,panel". */
export const layoutOf = (page) => page.evaluate(() => window.debriefLayout());
const groupsOf = async (page) => (await layoutOf(page)).groups.map((g) => `${g.place}:${g.panels.join(",")}`);
const docked = async (page) => (await layoutOf(page)).docked;

/**
 * Bring a panel into view, as a reader would: docked, click its tab; narrow, unfold it and scroll to it;
 * Export, Try and Import, open their menu from the top bar. Takes "history" or "panel-history".
 */
export async function showPanel(page, name) {
  const id = name.startsWith("panel-") ? name : `panel-${name}`;
  const panel = page.locator(`#${id}`);
  if (await panel.evaluate((p) => p.classList.contains("menu-panel"))) {
    if (await panel.isHidden()) await page.locator(`#topbar [aria-controls="${id}"]`).click();
    await panel.waitFor({ state: "visible" });
    return;
  }
  if (await docked(page)) {
    const tab = page.locator(`.dv-tab[data-panel="${id}"]`);
    if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
    await page.waitForFunction((tabId) => document.querySelector(`.dv-tab[data-panel="${tabId}"]`)?.getAttribute("aria-selected") === "true", id);
    // Dockview places a panel brought to the front in the next frame.
    await page.waitForFunction((sectionId) => {
      const overlay = document.getElementById(sectionId)?.closest(".dv-render-overlay");
      return overlay && getComputedStyle(overlay).visibility !== "hidden";
    }, id);
    return;
  }
  const fold = panel.locator("button.fold").first();
  if ((await fold.getAttribute("aria-expanded")) === "false") await fold.click();
  await panel.scrollIntoViewIfNeeded();
}

/** Resize the window, once the layout has followed: docked from 900 px wide (and 480 high), narrow below. */
export async function resizeTo(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction((dock) => document.body.classList.contains("docked") === dock, width >= 900 && height >= 480);
  // Dockview lays itself out again a frame or two after the window changes.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
  await page.waitForTimeout(100);
  await mapPlaced(page);
}

/** Docked, the map laid over its place in the layout (a frame or two after a change). */
export const mapPlaced = (page) =>
  page.waitForFunction(() => {
    const slot = document.querySelector(".map-slot")?.getBoundingClientRect();
    const main = document.getElementById("main").getBoundingClientRect();
    return !slot || ["left", "top", "width", "height"].every((k) => Math.abs(slot[k] - main[k]) < 1);
  });

/** Whether the page scrolls, down or sideways. */
const pageScrolls = (page) => page.evaluate(() => ({ down: document.documentElement.scrollHeight > innerHeight, sideways: document.documentElement.scrollWidth > innerWidth }));

/** Drag a panel's tab, as a hand does, to a point. */
async function dragTab(page, id, to) {
  const tab = await page.locator(`.dv-tab[data-panel="${id}"]`).boundingBox();
  const from = { x: tab.x + tab.width / 2, y: tab.y + tab.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
}
/** A group's box, by a panel in it. */
const groupBox = (page, id) => page.locator(".dv-groupview", { has: page.locator(`.dv-tab[data-panel="${id}"]`) }).boundingBox();

/** The default layout at a size: every tab there, the expected panels in view, nothing scrolling. */
async function defaultAt(page, width, height) {
  await resizeTo(page, width, height);
  assert.deepEqual(await groupsOf(page), DEFAULT, `the default layout at ${width} × ${height}`);
  for (const id of DOCKED_PANELS) assert.equal(await page.locator(`.dv-tab[data-panel="${id}"]`).count(), 1, `${id} has a tab`);
  const inView = await page.evaluate((ids) => ids.filter((id) => document.querySelector(`.dv-tab[data-panel="${id}"]`)?.getAttribute("aria-selected") === "true"), DOCKED_PANELS);
  assert.deepEqual(inView.sort(), ["panel-outline", "panel-time", "panel-timeline", "panel-tote", "panel-tour"]);
  assert.deepEqual(await pageScrolls(page), { down: false, sideways: false }, `at ${width} × ${height} the page does not scroll`);
  const map = await page.locator(".frame-map").boundingBox();
  const main = await page.locator("#main").boundingBox();
  assert.ok(main.width >= width * 0.5, `the map keeps half the width or more at ${width} px: ${main.width}`);
  const strip = await groupBox(page, "panel-timeline");
  const centre = main.height + strip.height;
  assert.ok(Math.abs(strip.height / centre - 0.3) <= 0.06, `Timeline and Coverage about 30% of the centre's height: ${(strip.height / centre).toFixed(2)}`);
  // Time and the Tote show the sample whole, with no scroll inside them.
  for (const id of ["panel-time", "panel-tote"]) {
    const [scroll, client] = await page.locator(`#${id}`).evaluate((s) => [s.parentElement.scrollHeight, s.parentElement.clientHeight]);
    assert.ok(scroll <= client + 1, `${id} without a scroll inside it at ${width} × ${height}: ${scroll} in ${client}`);
  }
  return { map: Math.round(map.width), share: main.width / width };
}

/**
 * The layout, played in a fresh browser context (nothing remembered): the default at 1366 × 768 and
 * 1920 × 1080; frames and Python's state surviving drag, tabs, splitting, the narrow layout and Reset;
 * a tab dragged to split a group, remembered across a reload; a panel moved by keyboard; a corrupt
 * or outdated layout giving the default; the narrow fallback; a post's fixed layout.
 */
export async function playDock(browser, base, shot, ready, errors) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: "dark" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/index.html`);
  await ready(page);
  const at1366 = await defaultAt(page, 1366, 768);
  await page.mouse.move(2, 2);
  await shot("dock-01-default-1366-dark", page);
  const at1920 = await defaultAt(page, 1920, 1080);
  await resizeTo(page, 1366, 768);

  // Groups are named for screen readers by where they are and what they hold; the tab strips are tab lists.
  assert.equal(await page.locator(".dv-groupview", { has: page.locator('.dv-tab[data-panel="panel-outline"]') }).getAttribute("aria-label"), "Panels, left: Outline, Catalogue");
  assert.equal(await page.locator('.dv-tab[data-panel="panel-tour"]').evaluate((t) => t.parentElement.closest('[role="tablist"]') !== null), true);
  // The top bar: Plot, Import…, Export, Try, Reset layout, each with its name.
  for (const name of ["Plot"]) assert.equal(await page.getByRole("combobox", { name }).count(), 1);
  for (const name of ["Import…", "Export", "Try", "Reset layout"]) assert.equal(await page.locator("#topbar").getByRole("button", { name, exact: true }).count(), 1, name);

  // A marker in each frame's window, and a step in the open plot's history: what must survive.
  const mapFrame = () => page.frames().find((f) => f.url().includes("frame-map.html"));
  await mapFrame().evaluate(() => (window.debriefMarker = "kept"));
  await page.locator('#outline li[data-id="track-blue-one"]').click();
  await page.selectOption("#colour", { label: "Red" });
  await page.waitForFunction(() => document.getElementById("history")?.textContent?.includes("Colour of BLUE ONE set to red"));
  const steps = await page.evaluate(() => window.debriefStepsOf("serial-1"));
  // A tool's form open beside the map: its frame too.
  await showPanel(page, "tools");
  await page.locator("#tools button", { hasText: "Range rings" }).click();
  await page.frameLocator(".frame-form").getByRole("button", { name: "Run" }).waitFor();
  const formFrame = () => page.frames().find((f) => f.url().includes("frame-form.html"));
  await formFrame().evaluate(() => (window.debriefMarker = "kept"));
  const loads = await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => /frame-(map|form)\.html/.test(r.name)).length);

  // Drag History's tab to the bottom of the left column's last group: a group of its own there.
  const outline = await groupBox(page, "panel-outline");
  await dragTab(page, "panel-history", { x: outline.x + outline.width / 2, y: outline.y + outline.height - 15 });
  assert.deepEqual(await groupsOf(page), [
    "centre:map",
    "left:panel-time",
    "left:panel-tote",
    "left:panel-outline,panel-catalogue",
    "centre:panel-timeline,panel-coverage",
    "right:panel-tour,panel-tools",
    "left:panel-history",
  ]);
  assert.equal(await page.locator("#history").isVisible(), true, "History in view, in its own group");
  // Drag Coverage's tab into the right-hand group, as a tab.
  const right = await groupBox(page, "panel-tour");
  await dragTab(page, "panel-coverage", { x: right.x + right.width / 2, y: right.y + right.height / 2 });
  assert.ok((await groupsOf(page)).includes("right:panel-tour,panel-tools,panel-coverage"), (await groupsOf(page)).join(" | "));
  // Tabs switched, here and there.
  for (const id of ["panel-catalogue", "panel-coverage", "panel-tour", "panel-outline", "panel-tools"]) await showPanel(page, id);
  await page.mouse.move(2, 2);
  await shot("dock-02-rearranged", page);

  // Moved by keyboard: Tab reaches the tab strips; arrows move along a strip; Shift+F10 opens the
  // tab's menu, whose "Move to left: …" moves it there; the keyboard stays on its tab.
  await page.locator('.dv-tab[data-panel="panel-tools"]').focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.panel), "panel-tour", "← moves along the strip");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator('.dv-tab[data-panel="panel-tour"]').getAttribute("aria-selected"), "true", "Enter brings it to the front");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Tools: move" });
  await menu.waitFor();
  const items = await menu.getByRole("menuitem").allInnerTexts();
  assert.ok(items.includes("Move to left: Time") && items.includes("Reset layout"), items.join(" | "));
  const target = items.findIndex((i) => i === "Move to left: Outline, Catalogue");
  assert.ok(target >= 0, items.join(" | "));
  for (let i = 0; i < target; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.debriefLayout().groups.some((g) => g.panels.join() === "panel-outline,panel-catalogue,panel-tools"));
  await page.waitForFunction(() => document.activeElement?.dataset?.panel === "panel-tools");
  // The group's ⋯ button opens the same menu, Escape closes it and the keyboard goes back.
  const more = page.locator(".dv-groupview", { has: page.locator('.dv-tab[data-panel="panel-time"]') }).locator(".dock-menu-button");
  assert.equal(await more.getAttribute("aria-label"), "Move Time…");
  await more.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu", { name: "Time: move" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("dock-menu-button")), true);
  // Delete on a tab closes nothing: every panel stays.
  await page.locator('.dv-tab[data-panel="panel-tools"]').focus();
  await page.keyboard.press("Delete");
  assert.equal(await page.locator('.dv-tab[data-panel="panel-tools"]').count(), 1, "Delete closes no panel");

  // Narrow and back: the side column, then docked again as it was.
  const rearranged = await groupsOf(page);
  await resizeTo(page, 700, 768);
  assert.equal(await page.locator("#side > #panel-history").count(), 1);
  await resizeTo(page, 1366, 768);
  assert.deepEqual((await groupsOf(page)).sort(), [...rearranged].sort(), "docked again as it was");

  // Reset layout: the default again.
  await page.locator("#reset-layout").click();
  assert.deepEqual(await groupsOf(page), DEFAULT);

  // The frames were never reloaded, and Python kept the plot as it was.
  assert.equal(await mapFrame().evaluate(() => window.debriefMarker), "kept", "the map's frame was not reloaded");
  assert.equal(await formFrame().evaluate(() => window.debriefMarker), "kept", "the form's frame was not reloaded");
  assert.equal(await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => /frame-(map|form)\.html/.test(r.name)).length), loads, "no frame fetched again");
  assert.equal(await page.evaluate(() => window.debriefStepsOf("serial-1")), steps, "the plot's history is as it was");
  assert.match(await page.locator("#history").textContent(), /Colour of BLUE ONE set to red/);
  await page.frameLocator(".frame-form").getByRole("button", { name: "Run" }).waitFor();
  await page.locator("#side-frame .side-bar button", { hasText: "Close" }).click();
  await page.keyboard.press("Control+z"); // the colour back, so the sample's look is as shipped
  await page.waitForFunction(() => /Colour of BLUE ONE set to red[^]*undone/.test(document.getElementById("history")?.textContent ?? ""));

  // Remembered: a split, kept across a reload; in this browser only, its shape only.
  const outlineAgain = await groupBox(page, "panel-outline");
  await dragTab(page, "panel-history", { x: outlineAgain.x + outlineAgain.width / 2, y: outlineAgain.y + outlineAgain.height - 15 });
  const split = await groupsOf(page);
  await page.waitForTimeout(400); // saved a moment after the change
  const saved = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), LAYOUT_KEY));
  assert.equal(saved.version, 1);
  assert.deepEqual(Object.keys(saved.layout.panels).sort(), ["map", ...DOCKED_PANELS].sort());
  await page.reload();
  await ready(page);
  assert.deepEqual((await groupsOf(page)).sort(), [...split].sort(), "remembered across a reload");
  // A corrupt layout, and one from an older version, give the default.
  for (const bad of ["{not json", JSON.stringify({ ...saved, version: 0 }), JSON.stringify({ version: 1, layout: { grid: {}, panels: { map: {} } } })]) {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [LAYOUT_KEY, bad]);
    await page.reload();
    await page.locator(".dv-tab").first().waitFor();
    assert.deepEqual(await groupsOf(page), DEFAULT, `the default for ${bad.slice(0, 40)}`);
  }
  await ready(page);

  // Light, at 1366 px.
  const light = await browser.newPage({ viewport: { width: 1366, height: 768 }, colorScheme: "light" });
  light.on("pageerror", (e) => errors.push(String(e)));
  await light.goto(`${base}/index.html`);
  await ready(light);
  await light.mouse.move(2, 2);
  await shot("dock-03-default-1366-light", light);
  await light.close();

  // Narrow (below 900 px), and phones: the one side column, each panel folding, the page never sideways.
  const narrow = [];
  for (const [width, height] of [[390, 844], [280, 700], [210, 600], [600, 800], [750, 800], [899, 800]]) {
    await resizeTo(page, width, height);
    assert.equal(await docked(page), false, `narrow at ${width} px`);
    assert.equal(await page.locator("#dock").isHidden(), true);
    assert.deepEqual(await page.$$eval("#side > section", (all) => all.map((s) => s.id)), ["panel-tour", "panel-time", "panel-tote", "panel-outline", "panel-timeline", "panel-catalogue", "panel-coverage", "panel-tools", "panel-history"]);
    assert.equal(await page.locator("#panel-time button.fold").isVisible(), true, "folding by the heading, narrow");
    assert.equal(await page.locator("#reset-layout").isHidden(), true, "no layout to reset, narrow");
    assert.equal((await pageScrolls(page)).sideways, false, `at ${width} px the page does not scroll sideways`);
    narrow.push(width);
    if (width === 390) {
      await page.mouse.move(2, 2);
      await shot("dock-04-narrow-390", page);
    }
  }
  await resizeTo(page, 900, 800);
  assert.equal(await page.locator("#panel-time button.fold").isVisible(), false, "no fold buttons docked: tabs replace them");
  assert.equal(await mapFrame().evaluate(() => window.debriefMarker), undefined, "a fresh page since the reload");
  await context.close();

  // A blog post's demo: a fixed layout from the panels it lists, never remembered.
  const embed = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const post = await embed.newPage();
  post.on("pageerror", (e) => errors.push(String(e)));
  await post.goto(`${base}/index.html?panels=tote,timeline,history,try`);
  await ready(post);
  assert.deepEqual(await groupsOf(post), ["centre:map", "left:panel-time", "left:panel-tote", "left:panel-outline", "centre:panel-timeline", "right:panel-history"]);
  assert.equal(await post.locator("#open-try").isVisible(), true);
  assert.equal(await post.locator("#open-export").isHidden(), true, "Export is not listed");
  const embedOutline = await groupBox(post, "panel-outline");
  await dragTab(post, "panel-history", { x: embedOutline.x + embedOutline.width / 2, y: embedOutline.y + embedOutline.height - 15 });
  await post.waitForTimeout(400);
  assert.equal(await post.evaluate((key) => localStorage.getItem(key), LAYOUT_KEY), null, "a post's demo remembers no layout");
  await post.reload();
  await ready(post);
  assert.deepEqual(await groupsOf(post), ["centre:map", "left:panel-time", "left:panel-tote", "left:panel-outline", "centre:panel-timeline", "right:panel-history"], "the same layout every time");
  await embed.close();
  console.log(
    `Docked layout: the default at 1366 × 768 (map ${at1366.map} px, ${(at1366.share * 100).toFixed(0)}% of the width) and 1920 × 1080 (map ${at1920.map} px, ${(at1920.share * 100).toFixed(0)}%), no page scroll; a tab dragged to split a group and another into a group; a panel moved by keyboard; narrow and back; Reset; the map's and form's frames never reloaded and the plot's ${steps} steps kept; remembered across a reload, the default for a corrupt or outdated layout; narrow at ${narrow.join(", ")} px; a post's fixed layout, never remembered.`,
  );
}
