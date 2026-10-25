// The browser's docked layout (product owner, 23 Oct 2026; second round the same day): the default
// "A, task-grouped" layout at four sizes; the keyboard's order and the screen reader's view; the
// drawing note; frames never reloaded and Python's state kept; a tool's form never squeezing the map;
// dragging and splitting, moving by keyboard and by touch; scroll and focus kept across the narrow
// layout and Reset; remembering, and a broken remembered layout never breaking the page; the narrow
// fallback; a blog post's fixed layout (dock.ts, host.ts, panels.mjs).
import assert from "node:assert/strict";
import { DEFAULT_GROUPS, PANELS, PANEL_TITLES } from "../../play/panels.mjs";

const LAYOUT_KEY = "debrief.play.layout";
/** Every panel with a tab of its own, docked. */
export const DOCKED_PANELS = PANELS.map((p) => p.id);
/** The default layout, group by group as built (dock.ts): the map's, then panels.mjs's DEFAULT_GROUPS. */
const DEFAULT = ["centre:map", ...DEFAULT_GROUPS.map((g) => `${g.place}:${g.panels.join(",")}`)];
/** The panels in front in the default layout: each group's first. */
const IN_FRONT = DEFAULT_GROUPS.map((g) => g.panels[0]).sort();

/** The layout as it is: docked or not, and each group as "place:panel,panel". */
export const layoutOf = (page) => page.evaluate(() => window.debriefLayout());
const groupsOf = async (page) => (await layoutOf(page)).groups.map((g) => `${g.place}:${g.panels.join(",")}`);
const docked = async (page) => (await layoutOf(page)).docked;
/** A frame or three: what Dockview lays out after a change. */
const frames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));

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

/** Docked, the map laid over its place in the layout (a frame or two after a change). */
export const mapPlaced = (page) =>
  page.waitForFunction(() => {
    const slot = document.querySelector(".map-slot")?.getBoundingClientRect();
    const main = document.getElementById("main").getBoundingClientRect();
    return !slot || ["left", "top", "width", "height"].every((k) => Math.abs(slot[k] - main[k]) < 1);
  });

/** Resize the window, once the layout has followed: docked from 900 px wide (and 480 high), narrow below. */
export async function resizeTo(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction((dock) => document.body.classList.contains("docked") === dock, width >= 900 && height >= 480);
  // Dockview lays itself out again a frame or two after the window changes; the groups settle.
  await frames(page);
  if (width >= 900 && height >= 480) {
    let before = "";
    for (let i = 0; i < 20; i++) {
      const now = JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".dv-groupview")].map((g) => g.getBoundingClientRect().toJSON())));
      if (now === before) break;
      before = now;
      await frames(page);
    }
  }
  await mapPlaced(page);
}

/** Whether the page scrolls, down or sideways. */
const pageScrolls = (page) => page.evaluate(() => ({ down: document.documentElement.scrollHeight > innerHeight, sideways: document.documentElement.scrollWidth > innerWidth }));

/** The remembered layout's text, waited for until it is not what it was (it is saved a moment after a change). */
const savedAfter = (page, was) =>
  page.waitForFunction(([key, old]) => (localStorage.getItem(key) ?? null) !== old && localStorage.getItem(key), [LAYOUT_KEY, was]).then(() => page.evaluate((key) => localStorage.getItem(key), LAYOUT_KEY));
const savedNow = (page) => page.evaluate((key) => localStorage.getItem(key), LAYOUT_KEY);

/** Drag a panel's tab, as a hand does, to a point; done once the layout has changed. */
async function dragTab(page, id, to) {
  const before = JSON.stringify(await groupsOf(page));
  const tab = await page.locator(`.dv-tab[data-panel="${id}"]`).boundingBox();
  const from = { x: tab.x + tab.width / 2, y: tab.y + tab.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
  // The drop places show over the group once the drag has crossed into it.
  await page.waitForFunction(() => !!document.querySelector(".dv-drop-target-anchor, .dv-drop-target-dropzone"), null, { timeout: 5000 }).catch(() => undefined);
  await page.mouse.up();
  await page.waitForFunction((was) => JSON.stringify(window.debriefLayout().groups.map((g) => `${g.place}:${g.panels.join(",")}`)) !== was, before);
  await mapPlaced(page);
}
/** A group's box, by a panel in it. */
const groupBox = (page, id) => page.locator(".dv-groupview", { has: page.locator(`.dv-tab[data-panel="${id}"]`) }).boundingBox();
/** Move a panel from its tab's menu, by the keyboard. */
async function moveByMenu(page, id, item) {
  await page.locator(`.dv-tab[data-panel="${id}"]`).focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: item, exact: true }).click();
  await page.waitForFunction((tab) => document.activeElement?.dataset?.panel === tab, id);
  await mapPlaced(page);
}

/**
 * The default layout at a size: every tab there, each group's first panel in front, the walkthroughs
 * alone on the right, nothing scrolling the page and no tab strip overflowing; the map half the width
 * or more from 1280 px; the strip under it 22% of the centre's height; Time and the Tote whole; the
 * Outline's track tools in sight without scrolling (panel review, 23 Oct 2026).
 */
async function defaultAt(page, width, height) {
  await resizeTo(page, width, height);
  assert.deepEqual(await groupsOf(page), DEFAULT, `the default layout at ${width} × ${height}`);
  for (const id of DOCKED_PANELS) assert.equal(await page.locator(`.dv-tab[data-panel="${id}"]`).count(), 1, `${id} has a tab`);
  const inView = await page.evaluate((ids) => ids.filter((id) => document.querySelector(`.dv-tab[data-panel="${id}"]`)?.getAttribute("aria-selected") === "true"), DOCKED_PANELS);
  assert.deepEqual(inView.sort(), IN_FRONT, `at ${width} × ${height} each group's first panel in front`);
  assert.deepEqual(await pageScrolls(page), { down: false, sideways: false }, `at ${width} × ${height} the page does not scroll`);
  assert.equal(await page.locator(".dv-tabs-overflow-dropdown-default:visible").count(), 0, `at ${width} × ${height} no tab strip overflows`);
  const main = await page.locator("#main").boundingBox();
  if (width >= 1280) assert.ok(main.width >= width * 0.5, `the map keeps half the width or more at ${width} px: ${main.width}`);
  const strip = await groupBox(page, "panel-timeline");
  const centre = main.height + strip.height;
  assert.ok(Math.abs(strip.height / centre - 0.22) <= 0.03, `Timeline and Coverage about 22% of the centre's height at ${width} × ${height}: ${(strip.height / centre).toFixed(2)}`);
  for (const id of ["panel-time", "panel-tote"]) {
    const [scroll, client] = await page.locator(`#${id}`).evaluate((s) => [s.parentElement.scrollHeight, s.parentElement.clientHeight]);
    assert.ok(scroll <= client + 1, `${id} without a scroll inside it at ${width} × ${height}: ${scroll} in ${client}`);
  }
  const hidden = await page.evaluate(() => {
    const panel = document.getElementById("panel-outline").parentElement.getBoundingClientRect();
    return ["colour", "find-jumps", "smooth-track", "track-frequencies"].filter((id) => {
      const b = document.getElementById(id).getBoundingClientRect();
      return b.top < panel.top - 1 || b.bottom > panel.bottom + 1;
    });
  });
  assert.deepEqual(hidden, [], `at ${width} × ${height} the track tools in sight in the Outline`);
  // The Outline's group takes the rest of the left column (product owner, 24 Oct 2026): its list
  // shows several rows, all the sample's on a large screen.
  const rows = await page.evaluate(() => {
    const list = document.getElementById("outline");
    const box = list.getBoundingClientRect();
    const all = [...list.children];
    return { all: all.length, seen: all.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= box.top - 1 && b.bottom <= box.bottom + 1; }).length };
  });
  const enough = height >= 1000 ? rows.all : height >= 768 ? 6 : 4;
  assert.ok(rows.seen >= enough, `at ${width} × ${height} the Outline shows ${enough} rows or more: ${rows.seen} of ${rows.all}`);
  return { width: Math.round(main.width), height: Math.round(main.height), share: main.width / width, rows: rows.seen };
}

/**
 * The layout, played in fresh browser contexts (nothing remembered), dark unless said: see the
 * module's head. The screenshots: the default at 1366 dark and light, at 1280 × 720, rearranged, a
 * tool's form at 1024, and narrow at 390.
 */
export async function playDock(browser, base, shot, ready, errors) {
  // The default as a first visit makes it, at each size (a window resized later scales its layout).
  const sizes = {};
  for (const [width, height] of [[1280, 720], [1024, 768], [1920, 1080]]) {
    const fresh = await browser.newContext({ viewport: { width, height }, colorScheme: "dark" });
    const at = await fresh.newPage();
    at.on("pageerror", (e) => errors.push(String(e)));
    await at.goto(`${base}/index.html`);
    await at.locator("#tote .tote-hint").waitFor();
    await at.locator('#outline li[data-id="track-blue-one"]').waitFor();
    sizes[`${width}×${height}`] = await defaultAt(at, width, height);
    if (width === 1280) {
      await ready(at);
      await at.mouse.move(2, 2);
      await shot("dock-05-default-1280x720", at);
    }
    await fresh.close();
  }
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: "dark" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/index.html`);
  await ready(page);
  sizes["1366×768"] = await defaultAt(page, 1366, 768);
  await page.mouse.move(2, 2);
  await shot("dock-01-default-1366-dark", page);

  // For screen readers (panel review, 23 Oct 2026): one tab list per group, named by where it is and
  // what it holds; one tab panel per panel, named by its tab and holding the panel; no empty regions
  // or tab panels; the map named.
  assert.equal(await page.locator("#main").getAttribute("aria-label"), "Map");
  assert.equal(await page.locator(".dv-groupview[role]").count(), 0, "no group is an empty region");
  assert.equal(await page.locator(".dv-content-container[role]").count(), 0, "no empty tab panel");
  const tabpanels = await page.$$eval("#dock [role=tabpanel]", (all) => all.map((p) => [p.querySelector("section.panel")?.id, document.getElementById(p.getAttribute("aria-labelledby"))?.textContent]));
  assert.deepEqual(tabpanels.map(([id]) => id).sort(), [...DOCKED_PANELS].sort(), "a tab panel for each panel, holding it");
  for (const [id, name] of tabpanels) assert.equal(name, PANEL_TITLES[id], `${id}'s tab panel is named by its tab`);
  for (const id of DOCKED_PANELS) assert.equal(await page.locator(`.dv-tab[data-panel="${id}"]`).getAttribute("aria-controls"), `dock-${id}`);
  const tree = await page.locator("#dock").ariaSnapshot();
  assert.match(tree, /tablist "Panels, left: Outline, Catalogue"/);
  assert.match(tree, /tablist "Panels, right: Walkthroughs"/);
  const timePanel = tree.slice(tree.indexOf('tabpanel "Time"'), tree.indexOf('tabpanel "Tote"'));
  assert.match(timePanel, /slider "Current time"/, `the Time tab panel holds the time controller:\n${timePanel}`);

  // The keyboard's order (WCAG 2.4.3): a group's tab, then what its panel holds, then the next group's tab.
  await page.locator('.dv-tab[data-panel="panel-time"]').focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.closest("section.panel")?.id), "panel-time", "Tab from Time's tab goes into Time");
  let presses = 0;
  while ((await page.evaluate(() => document.activeElement?.closest("section.panel")?.id)) === "panel-time" && presses++ < 40) await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.panel), "panel-tote", "after Time's last control, the Tote's tab");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.closest("section.panel")?.id), "panel-time", "Shift+Tab goes back into Time");
  // Before the first group and after the last, the top bar.
  await page.locator('.dv-tab[data-panel="panel-time"]').focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "reset-layout", "before the first group, the top bar's last button");

  // The drawing note (product owner, 23 Oct 2026): one line, never a block over the top of the map
  // (it was three or four, the top 18% at 1366 px); once a point is placed, the readout instead of
  // how to draw. With the keyboard on the map, the keys' line under it.
  const mapFrame = page.frameLocator(".frame-map");
  await mapFrame.getByRole("toolbar", { name: "Draw an annotation" }).getByRole("button", { name: "Line", exact: true }).click();
  const note = mapFrame.locator(".drawing-status");
  await note.waitFor({ state: "visible" });
  const mapBox = await page.locator(".frame-map").boundingBox();
  const noteBox = async () => (await note.boundingBox());
  const lines = async () => Math.round((await noteBox()).height / 20);
  assert.ok((await lines()) <= 2, `how to draw is one line, the keys another: ${(await noteBox()).height} px`);
  assert.equal(await mapFrame.locator('.drawing-status [role="status"]').evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && getComputedStyle(e).whiteSpace), "nowrap", "never wrapped");
  assert.ok((await noteBox()).y + (await noteBox()).height - mapBox.y <= mapBox.height * 0.1, "it covers less than the top 10% of the map");
  assert.match(await note.getAttribute("title"), /^Line: click to place each position/, "the whole of it in its tooltip");
  await page.mouse.click(mapBox.x + mapBox.width * 0.3, mapBox.y + mapBox.height * 0.6);
  await page.mouse.move(mapBox.x + mapBox.width * 0.4, mapBox.y + mapBox.height * 0.65);
  await mapFrame.locator(".drawing-readout", { hasText: /\S/ }).waitFor();
  assert.ok((await lines()) <= 2, `placing, the readout and the keys: ${(await noteBox()).height} px`);
  assert.ok(await mapFrame.locator('.drawing-status [role="status"]').evaluate((e) => e.getBoundingClientRect().height <= 1), "how to draw collapsed once a point is placed");
  assert.match(await mapFrame.locator('.drawing-status [role="status"]').textContent(), /^Line:/, "how to draw still there for screen readers");
  await page.keyboard.press("Escape");
  await mapFrame.locator("#map.drawing-mode").waitFor({ state: "detached" });

  // A marker in each frame's window, and a step in the open plot's history: what must survive.
  const mapWindow = () => page.frames().find((f) => f.url().includes("frame-map.html"));
  await mapWindow().evaluate(() => (window.debriefMarker = "kept"));
  await page.locator('#outline li[data-id="track-blue-one"]').click();
  await page.selectOption("#colour", { label: "Red" });
  await page.waitForFunction(() => document.getElementById("history")?.textContent?.includes("Colour of BLUE ONE set to red"));
  const steps = await page.evaluate(() => window.debriefStepsOf("serial-1"));
  // A tool's form open beside the map: its frame too.
  await showPanel(page, "tools");
  await page.locator("#tools button", { hasText: "Range rings" }).click();
  await page.frameLocator(".frame-form").getByRole("button", { name: "Run" }).waitFor();
  const formWindow = () => page.frames().find((f) => f.url().includes("frame-form.html"));
  await formWindow().evaluate(() => (window.debriefMarker = "kept"));
  const loads = await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => /frame-(map|form)\.html/.test(r.name)).length);

  // A tool's form never squeezes the map (panel review, 23 Oct 2026): beside the map where its place
  // is 640 px wide or more, under it where it is narrower, the map at least 380 × 160 px either way.
  const formAt = {};
  for (const width of [901, 1024, 1100, 1366]) {
    await resizeTo(page, width, 768);
    await page.frameLocator(".frame-form").getByRole("button", { name: "Run" }).waitFor();
    const [mapAt, form, under] = [await page.locator(".frame-map").boundingBox(), await page.locator(".frame-form").boundingBox(), await page.locator("#main").evaluate((m) => m.classList.contains("form-under"))];
    formAt[width] = `${Math.round(mapAt.width)}×${Math.round(mapAt.height)}${under ? ", form under" : ", form beside"}`;
    assert.ok(mapAt.width >= 380 && mapAt.height >= 160, `at ${width} px with the form open, the map is ${formAt[width]}`);
    if (under) assert.ok(form.y >= mapAt.y + mapAt.height - 1, `at ${width} px the form is under the map`);
    else assert.ok(form.x >= mapAt.x + mapAt.width - 1, `at ${width} px the form is beside the map`);
    if (width === 1024) {
      await page.mouse.move(2, 2);
      await shot("dock-06-form-1024", page);
    }
  }

  // Drag History's tab to the bottom of the Outline's group: a group of its own there.
  const outline = await groupBox(page, "panel-outline");
  await dragTab(page, "panel-history", { x: outline.x + outline.width / 2, y: outline.y + outline.height - 12 });
  assert.ok((await groupsOf(page)).includes("left:panel-history"), (await groupsOf(page)).join(" | "));
  assert.equal(await page.locator("#history").isVisible(), true, "History in view, in its own group");
  // Drag Coverage's tab beside the walkthroughs, as a tab.
  const right = await groupBox(page, "panel-tour");
  await dragTab(page, "panel-coverage", { x: right.x + right.width / 2, y: right.y + right.height / 2 });
  assert.ok((await groupsOf(page)).includes("right:panel-tour,panel-coverage"), (await groupsOf(page)).join(" | "));
  for (const id of ["panel-catalogue", "panel-coverage", "panel-tour", "panel-outline", "panel-tools"]) await showPanel(page, id);
  await page.mouse.move(2, 2);
  await shot("dock-02-rearranged", page);

  // Moved by keyboard: arrows along a strip, Enter to the front, Shift+F10 for the tab's menu.
  await page.locator('.dv-tab[data-panel="panel-coverage"]').focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.panel), "panel-tour", "← moves along the strip");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator('.dv-tab[data-panel="panel-tour"]').getAttribute("aria-selected"), "true", "Enter brings it to the front");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Coverage: move" });
  await menu.waitFor();
  const items = await menu.getByRole("menuitem").allInnerTexts();
  const target = items.indexOf("Move to centre: Timeline, Bearings");
  assert.ok(target >= 0 && items.includes("Reset layout"), items.join(" | "));
  for (let i = 0; i < target; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.debriefLayout().groups.some((g) => g.panels.includes("panel-timeline") && g.panels.includes("panel-coverage")));
  await page.waitForFunction(() => document.activeElement?.dataset?.panel === "panel-coverage");
  // The group's ⋯ opens the same menu; Escape closes it, back to the button.
  const more = page.locator(".dv-groupview", { has: page.locator('.dv-tab[data-panel="panel-time"]') }).locator(".dock-menu-button");
  assert.equal(await more.getAttribute("aria-label"), "Move Time…");
  await more.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu", { name: "Time: move" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("dock-menu-button")), true);
  await page.locator('.dv-tab[data-panel="panel-tools"]').focus();
  await page.keyboard.press("Delete");
  assert.equal(await page.locator('.dv-tab[data-panel="panel-tools"]').count(), 1, "Delete closes no panel");

  // Scroll kept across the narrow layout and Reset (panel review and CI, 23 and 24 Oct 2026): a panel
  // moved in the page forgets its scroll; the Timeline's list, the Outline's list and a docked panel keep theirs.
  await showPanel(page, "timeline");
  await showPanel(page, "history");
  // The Timeline's place is the entry at the top of its list (its rows wrap differently at another width).
  const scrolls = () =>
    page.evaluate(() => {
      const list = document.querySelector("#timeline .tl-scroll");
      const top = list.getBoundingClientRect().top;
      const row = [...list.querySelectorAll(".tl-row[data-id]")].find((r) => r.getBoundingClientRect().bottom > top + 2);
      return { timeline: list.scrollTop > 0 ? row?.dataset.id : "top", outline: document.getElementById("outline").scrollTop };
    });
  // The Outline's list as [scrollTop, clientHeight, scrollHeight] at each step, for a failure's message.
  const outlineAt = {};
  const outlineNow = () => page.evaluate(() => ["scrollTop", "clientHeight", "scrollHeight"].map((k) => document.getElementById("outline")[k]));
  const said = () => `the Outline [scrollTop, clientHeight, scrollHeight] ${JSON.stringify(outlineAt)}`;
  await page.evaluate(() => {
    const list = document.querySelector("#timeline .tl-scroll");
    list.dispatchEvent(new WheelEvent("wheel")); // as a reader scrolls it: it stops following current time
    list.scrollTop = 160;
    document.getElementById("outline").scrollTop = 8;
  });
  await frames(page);
  outlineAt.before = await outlineNow();
  const scrolled = await scrolls();
  assert.ok(scrolled.timeline !== "top" && scrolled.outline === 8, `scrolled: ${JSON.stringify(scrolled)}; ${said()}`);
  await resizeTo(page, 700, 768);
  outlineAt.narrow = await outlineNow();
  assert.deepEqual(await scrolls(), scrolled, `narrow, the lists where they were; ${said()}`);
  // Narrow, the Outline's rows wrap, so its list is taller and scrolls further: scrolled 40 px, more
  // than is left to scroll once the page is laid out at 1366 px with the side column still in place
  // (no rows wrapping; CI's fonts left nothing at all, 24 Oct 2026), and less than it has docked.
  await page.evaluate(() => (document.getElementById("outline").scrollTop = 40));
  await frames(page); // scrolled, then the window resized later, as a reader does
  outlineAt.narrowScrolled = await outlineNow();
  const narrowed = await scrolls();
  assert.equal(narrowed.outline, 40, `narrow, the Outline scrolled 40 px; ${said()}`);
  // As on a slow machine (CI, 23 Oct 2026): Dockview places a panel's content some frames after the
  // layout is made, so a list has nothing to scroll for a while; its scroll still comes back.
  await page.evaluate(() => {
    const frame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      if (!String(callback).includes("pendingUpdates")) return frame(callback);
      window.slowed = (window.slowed ?? 0) + 1;
      let frames = 8;
      const later = (time) => (--frames ? frame(later) : callback(time));
      return frame(later);
    };
    window.slowDock = () => (window.requestAnimationFrame = frame);
    // And the page laid out at the new width as the window resizes, before the panels move, as on CI.
    addEventListener("resize", () => void document.body.offsetHeight, { once: true, capture: true });
  });
  await resizeTo(page, 1366, 768);
  assert.ok(await page.evaluate(() => (window.slowDock(), window.slowed)), "Dockview's placing was slowed");
  // Polled: given back as each list gets its size, however late that is.
  const want = JSON.stringify(narrowed);
  let back;
  for (let i = 0; i < 50 && JSON.stringify((back = await scrolls())) !== want; i++) await frames(page);
  outlineAt.docked = await outlineNow();
  assert.ok(outlineAt.docked[2] - outlineAt.docked[1] >= 40, `docked, the Outline has 40 px or more to scroll; ${said()}`);
  assert.deepEqual(back, narrowed, `docked again, the lists where they were; ${said()}`);

  // The keyboard kept across 900 px (panel review, 23 Oct 2026): a tab becomes its fold button and back;
  // a menu of the top bar closes, back to its button.
  const rearranged = await groupsOf(page);
  await page.locator('.dv-tab[data-panel="panel-tote"]').focus();
  await resizeTo(page, 800, 768);
  assert.equal(await page.evaluate(() => document.activeElement?.matches("#panel-tote button.fold")), true, "the Tote's tab became its fold button");
  await page.locator("#panel-outline button.fold").focus();
  await resizeTo(page, 1366, 768);
  await page.waitForFunction(() => document.activeElement?.dataset?.panel === "panel-outline");
  assert.deepEqual((await groupsOf(page)).sort(), [...rearranged].sort(), "docked again as it was");
  await showPanel(page, "export");
  assert.equal(await page.evaluate(() => document.getElementById("panel-export").contains(document.activeElement)), true);
  await resizeTo(page, 800, 768);
  assert.equal(await page.locator("#panel-export").isHidden(), true, "the menu closed");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "open-export", "back to its button");
  await resizeTo(page, 1366, 768);

  // Reset layout: the default again, the lists where they were.
  await showPanel(page, "timeline");
  const beforeReset = await scrolls();
  await page.locator("#reset-layout").click();
  await mapPlaced(page);
  assert.deepEqual(await groupsOf(page), DEFAULT);
  assert.equal((await scrolls()).timeline, beforeReset.timeline, "Reset keeps the Timeline's place");

  // The frames were never reloaded, and Python kept the plot as it was.
  assert.equal(await mapWindow().evaluate(() => window.debriefMarker), "kept", "the map's frame was not reloaded");
  assert.equal(await formWindow().evaluate(() => window.debriefMarker), "kept", "the form's frame was not reloaded");
  assert.equal(await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => /frame-(map|form)\.html/.test(r.name)).length), loads, "no frame fetched again");
  assert.equal(await page.evaluate(() => window.debriefStepsOf("serial-1")), steps, "the plot's history is as it was");
  assert.match(await page.locator("#history").textContent(), /Colour of BLUE ONE set to red/);
  await page.locator("#side-frame .side-bar button", { hasText: "Close" }).click();
  await page.keyboard.press("Control+z"); // the colour back, so the sample's look is as shipped
  await page.waitForFunction(() => /Colour of BLUE ONE set to red[^]*undone/.test(document.getElementById("history")?.textContent ?? ""));

  // Remembered: a split, kept across a reload; its shape only.
  const was = await savedNow(page);
  const outlineAgain = await groupBox(page, "panel-outline");
  await dragTab(page, "panel-history", { x: outlineAgain.x + outlineAgain.width / 2, y: outlineAgain.y + outlineAgain.height - 12 });
  const split = await groupsOf(page);
  const saved = JSON.parse(await savedAfter(page, was));
  assert.equal(saved.version, 4);
  assert.deepEqual(Object.keys(saved.layout.panels).sort(), ["map", ...DOCKED_PANELS].sort());
  await page.reload();
  await ready(page);
  assert.deepEqual((await groupsOf(page)).sort(), [...split].sort(), "remembered across a reload");

  // A broken remembered layout never breaks the page (panel review, 23 Oct 2026, H1): unreadable, the
  // first round's, its grid holding only the map, the map sharing a group, sizes of 0 or 10,000,000,
  // a panel not rendered always. Each gives the default, comes up Ready, and is forgotten.
  const whole = saved.layout;
  const edit = (change) => {
    const copy = JSON.parse(JSON.stringify(whole));
    change(copy);
    return JSON.stringify({ version: saved.version, layout: copy });
  };
  const leafOf = (node, id) => (node.type === "leaf" ? (node.data.views.includes(id) ? node : undefined) : node.data.map((n) => leafOf(n, id)).find(Boolean));
  const broken = {
    unreadable: "{not json",
    "the first round's": JSON.stringify({ version: 1, layout: whole }),
    "the second round's": JSON.stringify({ version: 2, layout: whole }),
    "only the map in the grid": edit((l) => (l.grid.root = leafOf(l.grid.root, "map"))),
    "the map sharing a group": edit((l) => {
      const map = leafOf(l.grid.root, "map");
      map.data.views.push("panel-time");
      const time = leafOf(l.grid.root, "panel-time");
      if (time !== map) time.data.views = time.data.views.filter((v) => v !== "panel-time");
    }),
    "a size of 0": edit((l) => (l.grid.root.data[0].size = 0)),
    "a size of 10,000,000": edit((l) => (l.grid.root.data[0].size = 1e7)),
    "a panel not rendered always": edit((l) => (l.panels["panel-tote"].renderer = "onlyWhenVisible")),
  };
  for (const [what, text] of Object.entries(broken)) {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [LAYOUT_KEY, text]);
    await page.reload();
    await ready(page);
    assert.deepEqual(await groupsOf(page), DEFAULT, `the default for a layout with ${what}`);
    assert.equal(await savedNow(page), null, `a layout with ${what} is forgotten`);
  }
  assert.deepEqual(errors, [], "no error from any of them");
  await page.locator("#reset-layout").click();
  assert.deepEqual(await groupsOf(page), DEFAULT, "Reset works after");

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
    assert.deepEqual(await page.$$eval("#side > section", (all) => all.map((s) => s.id)), DOCKED_PANELS);
    assert.equal(await page.locator("#panel-time button.fold").isVisible(), true, "folding by the heading, narrow");
    assert.equal(await page.locator("#reset-layout").isHidden(), true, "no layout to reset, narrow");
    assert.equal((await pageScrolls(page)).sideways, false, `at ${width} px the page does not scroll sideways`);
    narrow.push(width);
    if (width === 390) {
      await page.mouse.move(2, 2);
      await shot("dock-04-narrow-390", page);
    }
  }
  // Narrow, a menu of the top bar closes when the page scrolls (it would stay put while its button
  // scrolled away), and anywhere when the keyboard tabs out of it (panel review, 23 Oct 2026).
  await resizeTo(page, 390, 844);
  await showPanel(page, "try");
  await page.evaluate(() => scrollTo(0, 300));
  await page.locator("#panel-try").waitFor({ state: "hidden" });
  await page.evaluate(() => scrollTo(0, 0));
  await resizeTo(page, 900, 800);
  await showPanel(page, "export");
  await page.locator("#find-id-go").focus();
  await page.keyboard.press("Tab");
  await page.locator("#panel-export").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#panel-time button.fold").isVisible(), false, "no fold buttons docked: tabs replace them");
  await context.close();

  // By touch, from 900 px (product owner, 23 Oct 2026): docked, with targets of 24 px or more, the
  // sashes a wide grip, and panels moved from the ⋯ menu.
  const touch = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const tablet = await touch.newPage();
  tablet.on("pageerror", (e) => errors.push(String(e)));
  await tablet.goto(`${base}/index.html`);
  await tablet.locator(".dv-tab").first().waitFor();
  assert.equal(await tablet.evaluate(() => matchMedia("(pointer: coarse)").matches && document.body.classList.contains("docked")), true, "docked by touch");
  const targets = await tablet.evaluate(() => {
    const box = (el) => el.getBoundingClientRect();
    const sash = document.querySelector(".dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash");
    const grip = getComputedStyle(sash, "::before");
    return {
      more: [...document.querySelectorAll(".dock-menu-button")].filter((b) => b.offsetParent).map((b) => Math.min(box(b).width, box(b).height)), // the map's group has none shown
      tabs: [...document.querySelectorAll(".dv-tab[data-panel]")].filter((t) => t.dataset.panel !== "map").map((t) => box(t).height),
      grip: box(sash).width - parseFloat(grip.left) - parseFloat(grip.right),
    };
  });
  assert.ok(targets.more.every((s) => s >= 24), `⋯ at least 24 px: ${targets.more}`);
  assert.ok(targets.tabs.every((h) => h >= 24), `tabs at least 24 px high: ${targets.tabs}`);
  assert.ok(targets.grip >= 12, `a sash's grip at least 12 px: ${targets.grip}`);
  await tablet.locator('.dv-tab[data-panel="panel-tools"]').tap(); // in front of its group (the Tote's)
  await tablet.locator(".dv-groupview", { has: tablet.locator('.dv-tab[data-panel="panel-tools"]') }).locator(".dock-menu-button").tap();
  await tablet.getByRole("menuitem", { name: "Move to right: Walkthroughs" }).tap();
  await tablet.waitForFunction(() => window.debriefLayout().groups.some((g) => g.panels.join() === "panel-tour,panel-tools"));
  await touch.close();

  // A blog post's demo: a fixed layout from the panels it lists, never remembered.
  const embed = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const post = await embed.newPage();
  post.on("pageerror", (e) => errors.push(String(e)));
  await post.goto(`${base}/index.html?panels=tote,timeline,history,try`);
  await ready(post);
  // The default's groups with only the listed panels: History a tab beside the Tote, as in the default.
  const fixed = ["centre:map", "left:panel-time", "left:panel-tote,panel-history", "left:panel-outline", "centre:panel-timeline"];
  assert.deepEqual(await groupsOf(post), fixed);
  assert.equal(await post.locator("#open-try").isVisible(), true);
  assert.equal(await post.locator("#open-export").isHidden(), true, "Export is not listed");
  const embedTime = await groupBox(post, "panel-time");
  await dragTab(post, "panel-history", { x: embedTime.x + embedTime.width / 2, y: embedTime.y + embedTime.height / 2 });
  await frames(post);
  assert.equal(await savedNow(post), null, "a post's demo remembers no layout");
  await post.reload();
  await ready(post);
  assert.deepEqual(await groupsOf(post), fixed, "the same layout every time");
  await embed.close();
  const size = (s) => `${s.width} × ${s.height} px (${(s.share * 100).toFixed(0)}% of the width; the Outline ${s.rows} rows)`;
  console.log(
    `Docked layout: the default's map at 1366 × 768 ${size(sizes["1366×768"])}, at 1280 × 720 ${size(sizes["1280×720"])}, at 1024 × 768 ${size(sizes["1024×768"])}, at 1920 × 1080 ${size(sizes["1920×1080"])}; no page scroll, no tab overflow, the track tools in sight; tab panels and the keyboard's order; the drawing note one line; with a tool's form open, the map ${Object.entries(formAt).map(([w, s]) => `at ${w} px ${s}`).join(", ")}; dragged, split, moved by keyboard and by touch; scroll and focus kept across 900 px and Reset; the map's and form's frames never reloaded and the plot's ${steps} steps kept; remembered across a reload, and ${Object.keys(broken).length} broken layouts each giving the default, forgotten; narrow at ${narrow.join(", ")} px; a post's fixed layout, never remembered.`,
  );
}
