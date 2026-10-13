// The playground's annotations (CAP-03 to CAP-05), played as a reader would: add a
// circle through the form, restyle it, undo, add an ellipse, an area and a label,
// show the north arrow, and move current time from the Timeline. Shared by play.mjs
// and, while working on it, explore.mjs.
import assert from "node:assert/strict";

/** Choose an option of one of the form's lists, by its label. */
async function choose(form, field, label) {
  await form.locator(`#field-${field} button`).first().click();
  await form.locator(`#field-${field} [aria-selected]`, { hasText: label }).first().click();
}

export async function playAnnotations(page, shot) {
  const history = () => page.locator("#history").innerText();
  const mapFrame = page.frameLocator(".frame-map");
  const historySays = (text) => page.waitForFunction((t) => document.getElementById("history")?.textContent?.includes(t), text, { timeout: 60000 });
  const form = page.frameLocator(".frame-annotation");
  // Somewhere inside the sample exercise's area, in the notations an analyst types.
  const at = (dLat, dLon) => `${(37.0 + dLat).toFixed(4)}, ${(-75.5 + dLon).toFixed(4)}`;

  // Add a circle: the form opens beside the map, a circle in the middle of the map.
  await page.locator("#add-annotation").click();
  await form.locator("#field-name input").fill("Exclusion zone");
  await form.locator("#field-positions input").fill("37°00.000'N 075°30.000'W");
  await form.locator(".field-echo", { hasText: "Means 37°00.000'N 075°30.000'W" }).waitFor();
  await form.locator("#field-radius input").fill("4");
  await choose(form, "unit", "km");
  await choose(form, "colour", "Red");
  await shot("annot-01-add-form");
  // A problem is said beside its field, and nothing is saved.
  await form.locator("#field-radius input").fill("0");
  await form.getByRole("button", { name: "Add" }).click();
  await form.locator(".field-problem", { hasText: "Give the radius, a number more than zero." }).waitFor();
  await form.locator("#field-radius input").fill("4");
  await form.getByRole("button", { name: "Add" }).click();
  await historySays("Circle 'Exclusion zone' added");
  await page.locator(".frame-annotation").waitFor({ state: "detached" });
  const red = "#e01c3e";
  const circle = mapFrame.locator(`path[stroke="${red}"][stroke-dasharray="6 5"]`);
  await circle.first().waitFor();

  // Restyle it: solid, filled, a wider line. One step, named as a change of style.
  await page.locator(`#outline li[data-id="annotation-exclusion-zone"]`).click();
  await page.locator("#edit-annotation").click();
  assert.equal(await form.locator("#field-name input").inputValue(), "Exclusion zone");
  assert.equal(await form.locator("#field-radius input").inputValue(), "4");
  await choose(form, "lineStyle", "Solid");
  await form.locator("#field-lineWidth input").fill("3");
  await choose(form, "fillColour", "Red");
  await form.locator("#field-fillOpacity input").fill("20");
  await form.getByRole("button", { name: "Save changes" }).click();
  await historySays("Style of Circle 'Exclusion zone' changed");
  const solid = mapFrame.locator(`path[stroke="${red}"][fill-opacity="0.2"]:not([stroke-dasharray])`);
  await solid.first().waitFor();
  await shot("annot-02-restyled-circle");

  // Undo: the style goes back as it was; redo brings it again.
  await page.locator("#selected-count").click();
  await page.keyboard.press("Control+z");
  await circle.first().waitFor();
  assert.match(await history(), /Style of Circle 'Exclusion zone' changed[^]*undone/);
  await page.keyboard.press("Control+y");
  await solid.first().waitFor();

  // An ellipse, an area and a label, each styled, so the picture shows them all.
  await page.locator("#add-annotation").click();
  await choose(form, "shape", "Ellipse");
  await form.locator("#field-name input").fill("Search area");
  await form.locator("#field-positions input").fill(at(-0.13, -0.18));
  await form.locator("#field-semiMajor input").fill("5");
  await form.locator("#field-semiMinor input").fill("2");
  await form.locator("#field-orientation input").fill("060");
  await choose(form, "colour", "Blue");
  await choose(form, "lineStyle", "Dotted");
  await form.getByRole("button", { name: "Add" }).click();
  await historySays("Ellipse 'Search area' added");

  await page.locator("#add-annotation").click();
  await choose(form, "shape", "Area");
  await form.locator("#field-name input").fill("Transit lane");
  await form.locator("#field-positions textarea").fill([at(0.05, -0.3), at(0.1, -0.05), at(0.02, 0.05), at(-0.03, -0.25)].join("\n"));
  await choose(form, "colour", "Green");
  await choose(form, "fillColour", "Green");
  await form.locator("#field-fillOpacity input").fill("10");
  await choose(form, "labelPosition", "Below");
  await form.getByRole("button", { name: "Add" }).click();
  await historySays("Area 'Transit lane' added");

  await page.locator("#add-annotation").click();
  await choose(form, "shape", "Label");
  await form.locator("#field-name input").fill("Datum buoy");
  await form.locator("#field-text textarea").fill("Datum buoy D7");
  await form.locator("#field-positions input").fill("N36 52.2 W75 21.0");
  await form.locator("#field-labelSize input").fill("15");
  await form.getByRole("button", { name: "Add" }).click();
  await historySays("Label 'Datum buoy' added");
  await mapFrame.locator(".annotation-label", { hasText: "Datum buoy D7" }).waitFor();

  // Chart furniture: the north arrow, shown as one more step.
  await page.locator("#north-arrow").click();
  await historySays("North arrow added");
  await mapFrame.locator(".north-arrow:not([hidden])").waitFor();
  assert.equal(await page.locator("#north-arrow").getAttribute("aria-pressed"), "true");
  await page.locator("#selected-count").click();
  await shot("annot-03-styled-on-the-map");

  // The Timeline: notes in time order; choosing one moves current time to it.
  const rows = page.locator("#timeline li[data-id]");
  assert.ok((await rows.count()) > 3, "the sample's narrative is in the Timeline");
  const target = rows.filter({ hasText: "Closest approach of BLUE ONE" });
  const when = (await target.locator(".when").innerText()).trim();
  await target.locator("button").click();
  await page.waitForFunction((w) => document.querySelector("#timebar .time-label")?.textContent?.includes(w), when);
  await page.waitForFunction(() => document.querySelector("#timeline li.current") !== null);
  assert.equal(await page.locator("#timeline li.current").getAttribute("data-id"), await target.getAttribute("data-id"));
  await page.locator("#panel-timeline").scrollIntoViewIfNeeded();
  await page.mouse.move(2, 2);
  await shot("annot-04-timeline");

  // A note added through the form goes into the Timeline at its time.
  await page.locator("#add-annotation").click();
  await choose(form, "shape", "Note");
  await form.locator("#field-name input").fill("Contact gained");
  await form.locator("#field-text textarea").fill("Contact gained on the towed array.");
  await form.locator("#field-time input").fill("10:15Z");
  await form.locator(".field-echo", { hasText: "Means 15 Jun 2023 10:15:00Z" }).waitFor();
  await form.getByRole("button", { name: "Add" }).click();
  await historySays("Note 'Contact gained' added");
  await page.locator("#timeline li", { hasText: "Contact gained" }).waitFor();

  // Delete the label: one step; undo brings it back.
  await page.locator(`#outline li[data-id="annotation-datum-buoy"]`).click();
  await page.locator("#delete-annotation").click();
  await historySays("Label 'Datum buoy' deleted");
  await mapFrame.locator(".annotation-label", { hasText: "Datum buoy D7" }).waitFor({ state: "detached" });
  await page.locator("#selected-count").click();
  await page.keyboard.press("Control+z");
  await mapFrame.locator(".annotation-label", { hasText: "Datum buoy D7" }).waitFor();
}
