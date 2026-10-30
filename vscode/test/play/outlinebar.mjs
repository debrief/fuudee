// The Outline's toolbar (product owner, 28 Oct 2026), played on serial 1 as an analyst would:
// - compact icon buttons above the tree, one tab stop (a toolbar, roving tabindex), each with a
//   tooltip, a name and its state (aria-pressed for Hidden on map);
// - the hint line gone, the selection's count said to a screen reader in a live region;
// - two tracks hidden (one step, counted), a third shown beside them making the button mixed,
//   pressing it showing all three (one step);
// - three tracks and a sensor coloured from the popover's palette by the keyboard, undone and
//   redone; a custom colour typed; nothing with a colour selected: the button says why;
// - Select all (every row listed, as Ctrl+A), Select children on a sensor (its cuts, its branch
//   opened), and Clear selection;
// - at 390 px and in a narrow docked column, the toolbar whole and nothing scrolling sideways.
import assert from "node:assert/strict";
import { resizeTo, showPanel } from "./dock.mjs";

// Close-ups of the Outline, beside the screenshots of every step.
const closeUps = process.env.DEBRIEF_SCREENSHOTS_ON === "failure" ? undefined : process.env.DEBRIEF_SCREENSHOTS;

export async function playOutlineBar(page, shot) {
  const row = (id) => page.locator(`#outline li[data-id="${id}"]`);
  const bar = page.locator("#outline-toolbar");
  const button = (id) => page.locator(`#obar-${id}`);
  const said = () => page.locator("#selection-said").textContent();
  const steps = () => page.locator("#history li").count();
  const latest = () => page.locator("#history li").first().locator(".name").textContent();
  const stepAdded = (count) => page.waitForFunction((c) => document.querySelectorAll("#history li").length > c, count, { timeout: 60000 });
  const saidIs = (text) => page.waitForFunction((t) => document.getElementById("selection-said")?.textContent === t, text, { timeout: 30000 });
  const stateIs = (state) => page.waitForFunction((s) => document.getElementById("obar-visibility")?.dataset.state === s, state, { timeout: 60000 });
  const picture = async (name) => {
    await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));
    await shot(name);
  };

  await page.selectOption("#plots", "serial-1");
  await page.waitForFunction(() => document.getElementById("plot-title")?.textContent === "Serial 1", null, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("#outline li[data-id='sensor-blue-one-towed-array']"));
  await showPanel(page, "outline");
  // Clicked in the page, so a selection the plot's switch cleared meanwhile is no race (a disabled button does nothing).
  await button("clear-selection").evaluate((b) => b.click());
  await saidIs("Nothing selected");

  // The hint line is gone; the count is in a live region a screen reader hears.
  assert.equal(await page.locator("#selected-count").count(), 0, "the hint line is gone");
  assert.doesNotMatch(await page.locator("#body-outline").innerText(), /Ctrl-click|Shift-click/);
  const live = page.locator("#selection-said");
  assert.equal(await live.getAttribute("role"), "status");
  assert.equal(await live.getAttribute("aria-live"), "polite");
  assert.ok(await live.evaluate((e) => e.getBoundingClientRect().width <= 1 && e.getBoundingClientRect().height <= 1), "said, not shown");

  // A toolbar of icon buttons: named, a tooltip each, one tab stop.
  assert.equal(await bar.getAttribute("role"), "toolbar");
  // The buttons and names of VS Code's title bar for the Outline, from the action catalogue (PAR-07); ⋯ for its overflow menu.
  const ids = ["visibility", "colour", "select-all", "select-children", "clear-selection", "add-annotation", "more"];
  assert.deepEqual(await bar.locator("button.obar-button").evaluateAll((b) => b.map((x) => x.dataset.action)), ids);
  assert.deepEqual(await bar.locator("button.obar-button").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label"))), [
    "Hide selected on map (all shown; legs and positions left as they are)",
    "Colour selected… (tracks, solutions, sensors, cuts and annotations)",
    "Select all in the Outline (every row listed)",
    "Select children (a track's sensors, a sensor's cuts, a solution's legs, a leg's positions)",
    "Clear selection",
    "Add annotation…",
    "More actions",
  ]);
  for (const id of ids) {
    assert.ok((await button(id).getAttribute("title"))?.length > 5, `${id} has a tooltip`);
    assert.equal(await button(id).locator("svg").count(), 1, `${id} is an icon`);
    assert.equal((await button(id).innerText()).trim(), "", `${id} has no text`);
  }
  assert.equal(await bar.locator('button[tabindex="0"]').count(), 1, "one tab stop");
  // Nothing selected: the buttons that need a selection say why, and stay reachable.
  for (const id of ["visibility", "colour", "select-children", "clear-selection"]) assert.equal(await button(id).getAttribute("aria-disabled"), "true", id);
  assert.match(await button("colour").getAttribute("title"), /^Colour: Select something with a colour first/);
  assert.equal(await button("select-all").getAttribute("aria-disabled"), "false");
  // A row's context menu is the action catalogue's, as VS Code's (PAR-07): a track's edits, then its presentation, then the Tote.
  await row("track-blue-one").click({ button: "right" });
  const rowMenu = page.locator(".context-menu");
  await rowMenu.waitFor();
  const entries = await rowMenu.locator("button").allInnerTexts();
  assert.equal(entries[0], "Move track…");
  for (const title of ["Find and remove jumps…", "Plot over the ground or by dead reckoning…", "Change colour…", "Hide on map", "Set as Tote primary"]) assert.ok(entries.includes(title), `${title} on a track's menu: ${entries.join(" | ")}`);
  assert.equal(await rowMenu.locator("button.group-start").count(), 2, "three groups, divided");
  await page.keyboard.press("Escape");
  await rowMenu.waitFor({ state: "detached" });
  // Undo and Redo: the catalogue's titles, disabled with its reason when they cannot act (PAR-08).
  assert.match(await page.locator("#undo").getAttribute("title"), /^Undo last change to plot(: There is nothing to undo\.)?$/);
  assert.equal(await page.locator("#undo").isDisabled(), (await page.locator("#undo").getAttribute("title")).includes("nothing to undo"));

  // The keyboard: Tab into the row, the arrows, Home and End along it, wrapping; Tab out.
  await button("visibility").focus();
  const focused = () => page.evaluate(() => document.activeElement?.dataset.action);
  await page.keyboard.press("ArrowRight");
  assert.equal(await focused(), "colour");
  await page.keyboard.press("End");
  assert.equal(await focused(), "more", "End: the last, the ⋯ menu");
  await page.keyboard.press("ArrowRight");
  assert.equal(await focused(), "visibility", "wraps");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await focused(), "more");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  assert.equal(await focused(), "select-all");
  assert.equal(await button("select-all").getAttribute("tabindex"), "0", "the tab stop moves with the keyboard");
  assert.ok(await button("select-all").evaluate((b) => b.matches(":focus-visible") && getComputedStyle(b).outlineStyle !== "none"), "focus shows");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "treeitem", "Tab goes on to the tree");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await focused(), "select-all", "Shift+Tab back lands where the keyboard was in the toolbar");
  await picture("outline-toolbar-01-keyboard");

  // Hide two tracks: one step, counted; the button pressed, the closed eye.
  await row("track-blue-one").click();
  await row("track-red-one").click({ modifiers: ["Control"] });
  await saidIs("2 tracks selected");
  assert.equal(await button("visibility").getAttribute("aria-pressed"), "false");
  assert.equal(await button("visibility").getAttribute("data-icon"), "eye");
  assert.equal(await button("visibility").getAttribute("title"), "Shown on the map: hide 2 tracks.");
  let n = await steps();
  await button("visibility").click();
  await stepAdded(n);
  assert.equal(await latest(), "BLUE ONE and RED ONE hidden on the map");
  await page.locator(".toast", { hasText: "Hid 2 tracks." }).waitFor();
  await stateIs("hidden");
  assert.equal(await button("visibility").getAttribute("aria-pressed"), "true");
  assert.equal(await button("visibility").getAttribute("data-icon"), "eye-closed");
  assert.match(await row("track-blue-one").locator(".detail").innerText(), /^selected · hidden on map · /);

  // A shown track added: mixed, its own icon; pressing shows all three, one step.
  const ais = await page.locator('#outline li[data-id^="track-ais-"]').first().getAttribute("data-id");
  await row(ais).click({ modifiers: ["Control"] });
  await saidIs("3 tracks selected");
  await stateIs("mixed");
  assert.equal(await button("visibility").getAttribute("aria-pressed"), "mixed");
  assert.equal(await button("visibility").getAttribute("data-icon"), "eye-mixed");
  assert.equal(await button("visibility").getAttribute("title"), "2 of 3 tracks hidden on the map: show them all.");
  await page.mouse.move(2, 2);
  await picture("outline-toolbar-02-mixed");
  const outlineBox = await page.locator("#panel-outline").boundingBox();
  if (closeUps) await page.screenshot({ path: `${closeUps}/outline-toolbar-mixed.png`, clip: outlineBox });
  n = await steps();
  await button("visibility").click();
  await stepAdded(n);
  assert.equal(await latest(), "3 tracks shown on the map");
  await stateIs("visible");

  // Colour three tracks and a sensor from the palette, by the keyboard: one step; undone, redone.
  await row("sensor-blue-one-towed-array").click({ modifiers: ["Control"] });
  await saidIs("3 tracks and 1 sensor selected");
  assert.equal(await button("colour").getAttribute("aria-disabled"), "false");
  assert.equal(await button("colour").getAttribute("title"), "Colour 3 tracks and 1 sensor…");
  await button("colour").focus();
  await page.keyboard.press("Enter");
  const popover = page.locator("#obar-colour-popover");
  await popover.waitFor();
  assert.equal(await popover.getAttribute("role"), "dialog");
  assert.equal(await button("colour").getAttribute("aria-expanded"), "true");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("obar-swatch")), true, "the keyboard on a swatch");
  assert.deepEqual(await popover.locator(".obar-swatch").evaluateAll((s) => s.map((x) => x.getAttribute("aria-label"))), ["Red", "Blue", "Green", "Purple", "Teal", "Grey"]);
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Green");
  await picture("outline-toolbar-03-colour-popover");
  if (closeUps) await page.screenshot({ path: `${closeUps}/outline-toolbar-colour.png`, clip: await page.locator("#panel-outline").boundingBox() });
  n = await steps();
  await page.keyboard.press("Enter");
  await stepAdded(n);
  assert.equal(await latest(), "Colour of 3 tracks and 1 sensor set to green");
  await popover.waitFor({ state: "detached" });
  assert.equal(await focused(), "colour", "the keyboard back on the button");
  const green = "#00a000";
  const colourOf = (id) => page.evaluate((f) => {
    const feature = window.debriefOutline.flat.find((r) => r.key === f)?.node.data.feature;
    return feature?.properties.style?.colour ?? feature?.properties.colour;
  }, id);
  await page.waitForFunction(() => document.getElementById("obar-colour")?.getAttribute("aria-disabled") === "false");
  assert.equal(await colourOf("track-red-one"), green);
  assert.equal(await colourOf("sensor-blue-one-towed-array"), green);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => /Colour of 3 tracks and 1 sensor set to green[^]*undone/.test(document.getElementById("history")?.textContent ?? ""), null, { timeout: 60000 });
  await page.waitForFunction((g) => window.debriefOutline.flat.find((r) => r.key === "track-red-one")?.node.data.feature.properties.style?.colour !== g, green, { timeout: 60000 });
  await page.keyboard.press("Control+y");
  await page.waitForFunction(() => !document.getElementById("history")?.textContent?.includes("undone"), null, { timeout: 60000 });
  await page.waitForFunction((g) => window.debriefOutline.flat.find((r) => r.key === "track-red-one")?.node.data.feature.properties.style?.colour === g, green, { timeout: 60000 });
  // A colour of the analyst's own, typed; Escape closes without colouring.
  await button("colour").click();
  await popover.waitFor();
  await page.keyboard.press("Escape");
  await popover.waitFor({ state: "detached" });
  await button("colour").click();
  await popover.locator("#obar-custom-hex").fill("nope");
  await popover.locator(".obar-apply").click();
  assert.match(await popover.locator("#obar-custom-problem").innerText(), /#rrggbb/);
  n = await steps();
  await popover.locator("#obar-custom-hex").fill("#1F6E8C");
  await page.keyboard.press("Enter");
  await stepAdded(n);
  assert.equal(await latest(), "Colour of 3 tracks and 1 sensor set to #1f6e8c");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => document.getElementById("history")?.textContent?.includes("undone"), null, { timeout: 60000 });
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => (document.getElementById("history")?.textContent?.match(/undone/g) ?? []).length === 2, null, { timeout: 60000 });

  // Select all: every row listed, as Ctrl+A in the tree.
  await button("select-all").click();
  // The rows that select something: not the headings, the narrative or the files.
  const listed = await page.evaluate(() => window.debriefOutline.flat.filter((r) => ["feature", "cut", "leg", "fix"].includes(r.node.data.kind)).length);
  await page.waitForFunction((k) => window.debriefSelection().picks.length === k, listed);
  assert.equal(await page.locator('#outline li[aria-selected="false"]:not(.section, .group, .narrative, .file, .empty)').count(), 0, "every row selected");
  assert.match(await said(), /^\d+ tracks, 2 sensors and \d+ annotations? selected$/);
  await row("track-blue-one").focus();
  await page.keyboard.press("Control+a");
  await page.waitForFunction((k) => window.debriefSelection().picks.length === k, listed);

  // Select children: a sensor's cuts, its branch opened, the first in sight.
  await row("sensor-blue-one-towed-array").click();
  assert.match(await button("select-children").getAttribute("title"), /^Select children: \d+ cuts, in place of what is selected$/);
  const cuts = Number((await button("select-children").getAttribute("title")).match(/(\d+) cuts/)[1]);
  await button("select-children").click();
  await saidIs(`${cuts} cuts selected`);
  assert.equal(await row("sensor-blue-one-towed-array").getAttribute("aria-expanded"), "true");
  assert.equal(await row("sensor-blue-one-towed-array").getAttribute("aria-selected"), "false", "the sensor itself is not");
  assert.equal(await page.locator('#outline li.cut[aria-selected="true"]').count(), cuts);
  assert.equal(await button("select-children").getAttribute("aria-disabled"), "true", "a cut has no children");
  assert.match(await button("select-children").getAttribute("title"), /cuts have no children/);
  // Hiding them all from the toolbar: the Tools' Hide cuts, named as cuts.
  n = await steps();
  await button("visibility").click();
  await stepAdded(n);
  assert.match(await latest(), new RegExp(`^${cuts} Towed array cuts \\d\\d:\\d\\d:\\d\\dZ–\\d\\d:\\d\\d:\\d\\dZ hidden on the map$`));
  await stateIs("hidden");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  await stateIs("visible");
  // A track's children are its sensors.
  await row("track-blue-one").click();
  await button("select-children").click();
  await saidIs("2 sensors selected");

  // Clear selection.
  await button("clear-selection").click();
  await saidIs("Nothing selected");
  assert.equal(await page.locator("#outline li.selected").count(), 0);
  assert.equal(await button("clear-selection").getAttribute("aria-disabled"), "true");
  await row("sensor-blue-one-towed-array").locator(".twisty").click();
  assert.equal(await row("sensor-blue-one-towed-array").getAttribute("aria-expanded"), "false");

  // Narrow: a phone at 390 px, and a narrow docked column; the toolbar whole, nothing sideways.
  const whole = () =>
    page.evaluate(() => {
      const bar = document.getElementById("outline-toolbar").getBoundingClientRect();
      const panel = document.getElementById("panel-outline").getBoundingClientRect();
      const buttons = [...document.querySelectorAll("#outline-toolbar .obar-button")].map((b) => b.getBoundingClientRect());
      return {
        sideways: document.documentElement.scrollWidth > innerWidth,
        inside: buttons.every((b) => b.left >= panel.left - 0.5 && b.right <= panel.right + 0.5 && b.right <= innerWidth),
        oneRow: new Set(buttons.map((b) => Math.round(b.top))).size === 1,
        barScrolls: document.getElementById("outline-toolbar").scrollWidth > Math.ceil(bar.width),
        size: buttons.map((b) => [Math.round(b.width), Math.round(b.height)]),
      };
    });
  const before = page.viewportSize();
  await resizeTo(page, 390, 844);
  await showPanel(page, "outline");
  await row("track-blue-one").click();
  await button("colour").click();
  await page.locator("#obar-colour-popover").waitFor();
  let w = await whole();
  assert.ok(!w.sideways && w.inside && w.oneRow && !w.barScrolls, `at 390 px: ${JSON.stringify(w)}`);
  assert.ok(await page.locator("#obar-colour-popover").evaluate((p) => p.getBoundingClientRect().right <= innerWidth), "the popover fits");
  assert.ok(w.size.every(([bw, bh]) => bw >= 24 && bh >= 24), `targets at least 24 px: ${JSON.stringify(w.size)}`);
  await picture("outline-toolbar-04-phone");
  await page.keyboard.press("Escape");
  await resizeTo(page, 960, 640);
  await showPanel(page, "outline");
  w = await whole();
  assert.ok(!w.sideways && w.inside && !w.barScrolls, `a narrow docked column: ${JSON.stringify(w)}`);
  await picture("outline-toolbar-05-narrow-column");
  await resizeTo(page, before.width, before.height);
  await button("clear-selection").click();
}
