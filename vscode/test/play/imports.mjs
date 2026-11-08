// Importing in the playground (play.mjs plays it, after collation and export): a legacy .dpf plot, what was
// not imported said and shown; a Debrief plot file with its history; a REP file with no tracks refused.
// Then a narrow page: the tool form under the map, not beside it.
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import { resizeTo, showPanel } from "./dock.mjs";

/** A legacy plot file, a plot file and a junk REP file imported; the form on a narrow page. */
export async function playImports(ctx) {
  const { page, root, shot, text, history } = ctx;
  const mapFrame = page.frameLocator(".frame-map");
  // Import a legacy plot file.
  const dpf = path.resolve("../python/debrief-io/tests/data/shapes.dpf");
  if (existsSync(dpf)) {
    await page.locator("#file").setInputFiles(dpf);
    // What came in is said, with what was not (EXT-14); shown when asked; the plot offered, not opened (PAR-12).
    const said = page.locator(".toast", { hasText: "Some content was not imported." });
    await said.waitFor({ timeout: 60000 });
    assert.deepEqual(await said.locator("button").allInnerTexts(), ["Show what was not imported", "Open plot"]);
    assert.notEqual(await page.locator("#plots").inputValue(), "shapes");
    await said.getByRole("button", { name: "Show what was not imported" }).click();
    await page.locator(".omitted-panel li").first().waitFor();
    // Fixes' own colours, labels and comments are imported, so not listed as left out (EXT-14).
    assert.doesNotMatch(await text(".omitted-panel"), /fix comment|a v4 track has one colour/);
    // Its circles and ellipses are circles and ellipses, drawn as legacy Debrief drew them.
    assert.ok(!(await text(".omitted-panel")).includes("polygons of 72 sides"));
    await page.locator(".side-bar button", { hasText: "Close" }).click();
    // Opened from the Catalogues tree, as VS Code's is (§6 decision 2).
    await showPanel(page, "catalogue");
    await page.locator('#items li[data-key="plot:play:shapes"] > .row').click();
    await page.waitForFunction(() => document.getElementById("plots")?.value === "shapes");
    await showPanel(page, "outline"); // its tab to the front again
    await shot("play-07-imported");
    await mapFrame.locator('path[stroke-dasharray="1 4"]').first().waitFor(); // the dotted circle
    // Closer, on the legacy plot's styled circles.
    const filled = await mapFrame.locator('path[fill-opacity="0.63"]').first().boundingBox();
    await page.mouse.move(filled.x + filled.width / 2, filled.y + filled.height / 2);
    await page.mouse.wheel(0, -150); // about two and a half zoom levels
    await page.waitForTimeout(800);
    await page.mouse.move(2, 2);
    // A label whose place the plot chose (legacy LabelLocation="Left") is shown on a small
    // circle, where one Debrief placed would wait for more room.
    await mapFrame.locator(".annotation-label", { hasText: "solid hairwidth solid fill" }).waitFor({ state: "visible" });
    await shot("annot-05-imported-dpf");
    // Its fixes' own colours, labels and comments came in as marked fixes (EXT-14).
    await page.locator(`#outline li[data-id="track-nel-style"]`).click();
    await mapFrame.getByRole("button", { name: "Zoom to the selection" }).click();
    await page.locator(`#outline li[data-id="track-nel-style"]`).click({ modifiers: ["Control"] }); // the selection's outline off the picture
    await mapFrame.locator(".fix-label", { hasText: "Override label 1" }).last().waitFor({ state: "visible" });
    assert.ok((await mapFrame.locator("path.fix-mark").count()) >= 4, "the fixes in their own colours");
    // Closer, on the labelled fixes at the track's start: drag them to the middle, then zoom in there.
    const labelled = await mapFrame.locator(".fix-label", { hasText: "Override label 2" }).last().boundingBox();
    const mapBox = await page.locator(".frame-map").boundingBox();
    const middle = { x: mapBox.x + mapBox.width / 2, y: mapBox.y + mapBox.height / 2 };
    await page.mouse.move(labelled.x, labelled.y + 120);
    await page.mouse.down();
    await page.mouse.move(middle.x, middle.y + 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(800);
    await page.mouse.move(2, 2);
    await shot("clean-04-imported-dpf-marks");
  }
  // A Debrief plot file, as a colleague would send it: one file, its history included.
  const sent = path.resolve(root, "sample", "serial-1", "plot.geojson");
  await page.locator("#file").setInputFiles(sent);
  const added = page.locator(".toast", { hasText: "with its history" });
  await added.waitFor({ timeout: 60000 });
  await added.getByRole("button", { name: "Open plot" }).click();
  await page.waitForFunction(() => document.getElementById("plots")?.value === "serial-1-2");
  assert.match(await history(), /Added from the plot file plot\.geojson/);
  assert.match(await history(), /step 1/);
  await shot("play-07b-plot-file-added");
  // Back to the plot open before, so what follows starts as it did.
  if (existsSync(dpf)) await page.selectOption("#plots", "shapes");
  // A REP file with no tracks is refused, quoting what it couldn't read.
  await page.locator("#file").setInputFiles({ name: "junk.rep", mimeType: "text/plain", buffer: Buffer.from("this is junk\n") });
  await page.locator(".toast", { hasText: "no tracks could be read" }).waitFor({ timeout: 60000 });
  assert.match(await text("#toasts"), /'this is' is not a date and time/);

  // Narrow: the form goes under the map, not beside it, and fits.
  await resizeTo(page, 400, 800);
  await showPanel(page, "tools");
  await page.selectOption("#plots", "serial-1");
  await page.locator(`#outline li[data-id="track-blue-one"]`).click();
  await page.locator("#tools button", { hasText: "Range rings" }).click();
  await page.frameLocator(".frame-form").getByRole("button", { name: "Run" }).waitFor();
  // Its time field starts at current time, as the analyst reads it.
  assert.match(await page.frameLocator(".frame-form").locator("#p-at input").inputValue(), /^\d{1,2} [A-Z][a-z]{2} \d{4} \d\d:\d\d:\d\dZ$/);
  const [mapAt, formAt] = [await page.locator(".frame-map").boundingBox(), await page.locator(".frame-form").boundingBox()];
  assert.ok(formAt.y >= mapAt.y + mapAt.height - 1, "form is under the map");
  assert.ok(formAt.width <= 400, "form fits the width");
  assert.equal(await page.frameLocator(".frame-form").locator("html").evaluate((html) => html.scrollWidth <= html.clientWidth), true, "form doesn't scroll sideways");
  await page.locator(".side-frame").scrollIntoViewIfNeeded();
  await shot("play-08-narrow-form");
  await resizeTo(page, 1400, 820);
  await shot("play-08b-form-current-time");
}

export const plays = [{ name: "imports", after: "export", cost: 10, play: playImports }];
