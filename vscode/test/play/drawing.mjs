// Drawing and editing annotations on the playground's map (CAP-03, NFR-13), played as
// a reader would: draw an area and a circle with the pointer, name and add each through
// the form, undo; drag a corner (and cancel a drag with Escape); nudge the area with the
// arrow keys; remove a corner from the keyboard; draw an ellipse; place a marker without
// a pointer at all; cancel. Each finished annotation, and each release, is one step.
import assert from "node:assert/strict";

export async function playDrawing(page, shot) {
  const mapFrame = page.frameLocator(".frame-map");
  const form = page.frameLocator(".frame-annotation");
  const history = () => page.locator("#history").innerText();
  const steps = () => page.locator("#history li").count();
  const stepAdded = (count) => page.waitForFunction((c) => document.querySelectorAll("#history li").length > c, count, { timeout: 60000 });
  const historySays = (text) => page.waitForFunction((t) => document.getElementById("history")?.textContent?.includes(t), text, { timeout: 60000 });
  const timeLabel = () => page.locator("#timebar .time-label").innerText();
  const status = mapFrame.locator(".drawing-status");
  const tool = (name) => mapFrame.getByRole("toolbar", { name: "Draw an annotation" }).getByRole("button", { name, exact: true });
  /** A point on the map frame, as fractions of its width and height. */
  const box = async () => (await page.locator(".frame-map").boundingBox());
  const point = async (fx, fy) => {
    const b = await box();
    return { x: b.x + b.width * fx, y: b.y + b.height * fy };
  };
  const click = async (fx, fy, options) => {
    const p = await point(fx, fy);
    await page.mouse.click(p.x, p.y, options);
  };
  const centreOf = async (locator) => {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const handle = (role, index = 0) => mapFrame.locator(`.edit-handle[data-role="${role}"][data-index="${index}"]`);

  // The toolbar: a named toolbar of buttons, Cancel off until something is being drawn.
  const before = await timeLabel();
  assert.equal(await tool("Cancel").isDisabled(), true);
  await page.locator("#selected-count").click();
  await page.mouse.move(2, 2);
  await shot("draw-01-toolbar");

  // An area, by pointer: click each corner, the map saying the leg, the range and bearing
  // from the start and the area so far; a double-click finishes.
  await tool("Area").click();
  assert.equal(await tool("Area").getAttribute("aria-pressed"), "true");
  assert.equal(await tool("Cancel").isDisabled(), false);
  await mapFrame.locator("#map.drawing-mode").waitFor();
  await status.getByText("Area: click to place each corner").waitFor();
  await click(0.5, 0.3);
  await click(0.72, 0.36);
  await click(0.7, 0.62);
  const fourth = await point(0.52, 0.6);
  await page.mouse.move(fourth.x, fourth.y, { steps: 4 });
  await mapFrame.locator(".drawing-readout", { hasText: /^3 corners placed · leg .* nmi \d{3}\.\d°T · from start .* · area .* nmi²$/ }).waitFor();
  await shot("draw-02-area-readout");
  await page.mouse.dblclick(fourth.x, fourth.y);
  // The form opens with the corners filled in, at the name; nothing is saved yet.
  await form.locator("#field-name input").waitFor();
  assert.equal((await form.locator("#field-positions textarea").inputValue()).split("\n").length, 4);
  assert.equal(await mapFrame.locator("#map.drawing-mode").count(), 0);
  const stepsBefore = await steps();
  await form.locator("#field-name input").fill("Patrol box");
  await form.getByRole("button", { name: "Add" }).click();
  await historySays("Area 'Patrol box' added");
  assert.equal(await steps(), stepsBefore + 1, "one step for the finished area");
  // Added, it is selected, with handles at its corners, between them, and one to move it all.
  await handle("vertex", 3).waitFor();
  assert.equal(await mapFrame.locator(".edit-handle").count(), 9);
  assert.match(await handle("vertex", 0).getAttribute("aria-label"), /^Area 'Patrol box': corner 1 of 4; drag it, or use the arrow keys; Delete removes it$/);
  await shot("draw-03-area-handles");

  // Undo takes it away; redo brings it back.
  await page.locator("#selected-count").click();
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => /Area 'Patrol box' added[^]*undone/.test(document.getElementById("history")?.textContent ?? ""));
  await page.keyboard.press("Control+y");
  await page.waitForFunction(() => !/Area 'Patrol box' added[^]*undone/.test(document.getElementById("history")?.textContent ?? ""));
  await page.locator(`#outline li[data-id="annotation-patrol-box"]`).click();
  await handle("vertex", 1).waitFor();

  // Drag a corner: it follows live; letting go is one step.
  let n = await steps();
  const corner = await centreOf(handle("vertex", 1));
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 30, corner.y - 40, { steps: 6 });
  await status.getByText(/Area 'Patrol box': corner 2 at .* · area .* nmi²/).waitFor();
  await page.mouse.up();
  await historySays("Area 'Patrol box' reshaped");
  assert.equal(await steps(), n + 1, "one step for one release");

  // Escape during a drag puts it back: nothing is recorded.
  n = await steps();
  const other = await centreOf(handle("vertex", 2));
  await page.mouse.move(other.x, other.y);
  await page.mouse.down();
  await page.mouse.move(other.x + 50, other.y + 30, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await status.getByText("Not changed.").waitFor();
  await page.waitForTimeout(800);
  assert.equal(await steps(), n);
  const back = await centreOf(handle("vertex", 2));
  assert.ok(Math.abs(back.x - other.x) < 2 && Math.abs(back.y - other.y) < 2, "the corner is where it was");

  // A colleague changes the plot during a drag: the drag is dropped, the map says so
  // plainly, and only the colleague's step is recorded (SUB-28).
  n = await steps();
  const held = await centreOf(handle("vertex", 0));
  await page.mouse.move(held.x, held.y);
  await page.mouse.down();
  await page.mouse.move(held.x - 20, held.y + 20, { steps: 4 });
  await page.evaluate(() => document.getElementById("colleague").click());
  await status.getByText("The plot was changed elsewhere, so your change was not made. Debrief is showing the latest; try again if you still want to.").waitFor({ timeout: 60000 });
  await page.mouse.move(held.x - 40, held.y + 30, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  assert.equal(await steps(), n + 1, "the colleague's step, and nothing of the drag");
  assert.match(await history(), /^Note added by a colleague/);
  const kept = await centreOf(handle("vertex", 0));
  assert.ok(Math.abs(kept.x - held.x) < 2 && Math.abs(kept.y - held.y) < 2, "the corner is where it was");

  // Dragging a midpoint adds a corner there.
  n = await steps();
  const mid = await centreOf(handle("midpoint", 0));
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x - 10, mid.y - 30, { steps: 5 });
  await page.mouse.up();
  await stepAdded(n);
  assert.match(await history(), /^Area 'Patrol box' reshaped/);
  await handle("vertex", 4).waitFor();

  // The keyboard: Tab to the handle that moves it all, and the arrow keys nudge it; the run
  // of presses is one step, named for what it did.
  n = await steps();
  await handle("move").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await stepAdded(n);
  assert.match(await history(), /^Area 'Patrol box' moved/);
  await page.waitForTimeout(1000);
  assert.equal(await steps(), n + 1, "one step for a run of nudges");

  // Delete on a focused corner removes it, down to three and no further.
  await handle("vertex", 4).waitFor();
  n = await steps();
  await handle("vertex", 4).focus();
  await page.keyboard.press("Delete");
  await stepAdded(n);
  await handle("vertex", 4).waitFor({ state: "detached" });
  await page.waitForTimeout(500);
  await handle("vertex", 3).focus();
  await page.keyboard.press("Delete");
  await stepAdded(n + 1);
  await page.waitForTimeout(500);
  await handle("vertex", 0).focus();
  await page.keyboard.press("Delete");
  await status.getByText("An area needs at least 3 corners, so this one can't be removed.").waitFor();
  assert.equal(await steps(), n + 2);

  // A circle: press at the centre and drag out the radius, the map saying it as it goes.
  await tool("Circle").click();
  const centre = await point(0.32, 0.55);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 90, centre.y - 20, { steps: 8 });
  await mapFrame.locator(".drawing-readout", { hasText: /^Radius \d+\.\d\d nmi · bearing \d{3}\.\d°T · area .* nmi²$/ }).waitFor();
  await shot("draw-04-circle-radius");
  const said = await mapFrame.locator(".drawing-readout").innerText();
  await page.mouse.up();
  await form.locator("#field-name input").waitFor();
  // The radius is the one the map said, in the analyst's unit.
  const radius = /^Radius (\d+\.\d\d) nmi/.exec(said)[1];
  assert.equal(await form.locator("#field-radius input").inputValue(), String(Number(radius)));
  await form.locator("#field-name input").fill("Keep clear");
  await form.getByRole("button", { name: "Add" }).click();
  await historySays("Circle 'Keep clear' added");
  await handle("radius").waitFor();
  // Its radius handle resizes it: one step.
  n = await steps();
  const r = await centreOf(handle("radius"));
  await page.mouse.move(r.x, r.y);
  await page.mouse.down();
  await page.mouse.move(r.x + 30, r.y, { steps: 5 });
  await page.mouse.up();
  await historySays("Circle 'Keep clear' resized");
  assert.equal(await steps(), n + 1);

  // An ellipse by clicks: the centre, the end of its longer axis, then its side.
  await tool("Ellipse").click();
  await click(0.62, 0.78);
  await click(0.78, 0.7);
  const side = await point(0.66, 0.66);
  await page.mouse.move(side.x, side.y, { steps: 4 });
  await mapFrame.locator(".drawing-readout", { hasText: /^Semi-major .* nmi · semi-minor .* nmi · orientation \d{3}\.\d°T · area .*$/ }).waitFor();
  await shot("draw-05-ellipse");
  await page.mouse.click(side.x, side.y);
  await form.locator("#field-name input").waitFor();
  assert.notEqual(await form.locator("#field-semiMinor input").inputValue(), "");
  await form.locator("#field-name input").fill("Search box");
  await form.getByRole("button", { name: "Add" }).click();
  await historySays("Ellipse 'Search box' added");

  // Without a pointer: Enter on Marker, Space places it at the cross in the middle of the map.
  // The form opens; Cancel keeps nothing, on the map or in the history.
  n = await steps();
  await tool("Label").focus();
  await page.keyboard.press("ArrowDown"); // along the toolbar, as a toolbar's arrow keys go
  assert.equal(await mapFrame.locator(".draw-button:focus").innerText(), "Marker");
  await page.keyboard.press("Enter");
  await mapFrame.locator(".centre-cross").waitFor({ state: "visible" });
  await mapFrame.locator(".drawing-keys", { hasText: "Space places a point at the cross" }).waitFor({ state: "visible" });
  await page.keyboard.press("ArrowLeft"); // the arrow keys pan the map under the cross
  await page.keyboard.press("Space");
  await form.locator("#field-name input").waitFor();
  assert.notEqual(await form.locator("#field-positions input").inputValue(), "");
  await form.getByRole("button", { name: "Cancel" }).click();
  await page.locator(".frame-annotation").waitFor({ state: "detached" });
  await page.waitForTimeout(500);
  assert.equal(await steps(), n);

  // Escape cancels a drawing part-way; Backspace removes the last point.
  await tool("Line").click();
  await click(0.4, 0.2);
  await click(0.5, 0.25);
  await click(0.6, 0.2);
  await status.getByText(/^3 positions placed/).waitFor();
  await page.keyboard.press("Backspace");
  await status.getByText(/^2 positions placed/).waitFor();
  await page.keyboard.press("Escape");
  await mapFrame.locator("#map.drawing-mode").waitFor({ state: "detached" });
  assert.equal(await tool("Line").getAttribute("aria-pressed"), "false");
  assert.equal(await steps(), n);

  // Drawing never moved current time or the window.
  assert.equal(await timeLabel(), before);
  assert.match(await history(), /Area 'Patrol box' moved/);
}
