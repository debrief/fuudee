// Moving, rotating, splitting and merging tracks in the playground (CAP-01, CAP-02, NFR-13),
// played as a reader would: drag BLUE ONE's move handle and rotate handle, each release one
// step named by what it did; Escape puts a drag back; undo and redo; the same from the
// keyboard, a run of presses one step; only the fixes in the time window, the joins jumping;
// a colleague's change during a drag; split at current time and merge again; overlapping
// tracks refused; and the Move… and Rotate… forms.
import assert from "node:assert/strict";

export async function playTracks(page, shot) {
  const mapFrame = page.frameLocator(".frame-map");
  const steps = () => page.locator("#history li").count();
  const latest = () => page.locator("#history li").first().locator(".name").textContent();
  const stepAdded = (count) => page.waitForFunction((c) => document.querySelectorAll("#history li").length > c, count, { timeout: 60000 });
  const status = mapFrame.locator(".drawing-status");
  const handle = (role) => mapFrame.locator(`.track-handle[data-role="${role}"]`);
  const centreOf = async (locator) => {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const selected = () => page.$$eval("#outline li.selected .name", (rows) => rows.map((r) => r.textContent));
  const timeLabel = () => page.locator("#timebar .time-label").innerText();
  /** Press on a handle, move by (dx, dy) as a hand would, and leave the button down. */
  const grab = async (role, dx, dy) => {
    const at = await centreOf(handle(role));
    // On the map, where a hand can reach it: a press beyond the map's edge would grab nothing.
    const frame = await page.locator(".frame-map").boundingBox();
    assert.ok(at.x > frame.x && at.x < frame.x + frame.width && at.y > frame.y && at.y < frame.y + frame.height, `the ${role} handle is on the map, at ${Math.round(at.x)}, ${Math.round(at.y)}`);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + dx, at.y + dy, { steps: 8 });
    await page.waitForTimeout(100);
  };

  // The whole plot in the window, current time at its start: what follows starts the same each time.
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  await page.locator("#timebar .tc-end").focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(500);

  // BLUE ONE selected alone: a move handle, a rotate handle and the pivot, each named for a screen
  // reader; the control says the whole track moves.
  await page.locator(`#outline li[data-id="track-blue-one"]`).click();
  await handle("move").waitFor();
  // And two ends, to shear or stretch it (shear.mjs).
  assert.equal(await mapFrame.locator(".track-handle:not(.track-handle-fix)").count(), 5);
  assert.equal(await handle("move").getAttribute("aria-label"), "BLUE ONE: move; drag it, or use the arrow keys");
  assert.match(await handle("rotate").getAttribute("aria-label"), /^BLUE ONE: rotate about the pivot; drag it round, or use the arrow keys/);
  assert.match(await handle("pivot").getAttribute("aria-label"), /^BLUE ONE: pivot for rotating/);
  assert.equal(await mapFrame.getByRole("button", { name: "Whole track", exact: true }).getAttribute("aria-pressed"), "true");
  await status.getByText("BLUE ONE: drag the move or rotate handle, or an end to shear it; or Tab to one and use the arrow keys.").waitFor();
  const timeBefore = await timeLabel();
  await page.mouse.move(2, 2);
  await shot("tracks-01-handles");

  // Drag the move handle: the track follows, dashed where it was, and the map says by how much,
  // geodesically; letting go is one step, named as the map said it.
  let n = await steps();
  await grab("move", 90, -60);
  const said = await status.innerText();
  const [, range, bearing] = said.match(/^BLUE ONE: moving (\d+\.\d\d nmi) (\d{3}\.\d°T)$/) ?? [];
  assert.ok(range && bearing, said);
  assert.equal(await mapFrame.locator("path.track-before").count(), 1, "the track as it was, dashed beneath");
  await shot("tracks-02-dragging");
  await page.mouse.up();
  await stepAdded(n);
  assert.equal(await latest(), `BLUE ONE moved ${range} ${bearing}`);
  assert.equal(await steps(), n + 1, "one step for one release");
  assert.deepEqual(await selected(), ["BLUE ONE"], "still selected");
  assert.equal(await timeLabel(), timeBefore, "current time unchanged");

  // Escape during a drag puts it back: nothing is recorded.
  n = await steps();
  const before = await centreOf(handle("move"));
  await grab("move", -50, 40);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await status.getByText("Not changed.").waitFor();
  await page.waitForTimeout(900);
  assert.equal(await steps(), n);
  const after = await centreOf(handle("move"));
  assert.ok(Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2, "the handle is where it was");

  // Undo takes the move back; redo makes it again.
  await page.locator("#selected-count").click();
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => /BLUE ONE moved[^]*undone/.test(document.getElementById("history")?.textContent ?? ""));
  await page.keyboard.press("Control+y");
  await page.waitForFunction(() => !/BLUE ONE moved[^]*undone/.test(document.getElementById("history")?.textContent ?? ""));

  // Drag the rotate handle round the pivot: the map says the angle and the pivot.
  await handle("rotate").waitFor();
  n = await steps();
  await grab("rotate", 30, 110);
  assert.match(await status.innerText(), /^BLUE ONE: rotating \d+\.\d° (anti)?clockwise about \d\d°\d\d\.\d{3}'N \d{3}°\d\d\.\d{3}'W$/);
  await shot("tracks-03-rotating");
  await page.mouse.up();
  await stepAdded(n);
  assert.match(await latest(), /^BLUE ONE rotated \d+\.\d° (anti)?clockwise$/);

  // From the keyboard: Tab to the move handle; a run of arrow keys is one step.
  n = await steps();
  await handle("move").focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowUp");
  await status.getByText(/^BLUE ONE: moving \d+\.\d\d nmi \d{3}\.\d°T$/).waitFor();
  await stepAdded(n);
  await page.waitForTimeout(1200);
  assert.equal(await steps(), n + 1, "one step for the run of presses");
  assert.match(await latest(), /^BLUE ONE moved/);
  // The rotate handle turns 10° with Shift and an arrow; Enter sends it at once.
  n = await steps();
  await handle("rotate").focus();
  await page.keyboard.press("Shift+ArrowRight");
  await status.getByText(/^BLUE ONE: rotating 10\.0° clockwise about/).waitFor();
  await page.keyboard.press("Enter");
  await stepAdded(n);
  assert.equal(await latest(), "BLUE ONE rotated 10.0° clockwise");

  // Only the fixes in the time window: the window narrowed to 09:40-10:20, "Time window" chosen.
  await page.locator("#timebar .tc-start").focus();
  for (let i = 0; i < 2; i++) await page.keyboard.press("PageUp");
  await page.locator("#timebar .tc-end").focus();
  for (let i = 0; i < 2; i++) await page.keyboard.press("PageDown");
  await page.waitForTimeout(500);
  assert.equal(await page.locator("#timebar .tc-summary").innerText(), "09:40–10:20Z");
  await mapFrame.getByRole("button", { name: "Time window", exact: true }).click();
  assert.equal(await mapFrame.getByRole("button", { name: "Time window", exact: true }).getAttribute("aria-pressed"), "true");
  await status.getByText(/^BLUE ONE, fixes in the time window: drag the move or rotate handle/).waitFor();
  n = await steps();
  await grab("move", 70, 70);
  assert.match(await status.innerText(), /^BLUE ONE: moving .* only the fixes in the time window move, so the track jumps where they meet the rest$/);
  await shot("tracks-04-period-joins-jump");
  await page.mouse.up();
  await stepAdded(n);
  assert.match(await latest(), /^BLUE ONE part moved \d+\.\d\d nmi \d{3}\.\d°T$/);
  await mapFrame.getByRole("button", { name: "Whole track", exact: true }).click();

  // A colleague changes the plot during a drag: the drag is dropped, the map says so, and only
  // the colleague's step is recorded (SUB-28).
  n = await steps();
  await grab("move", -40, 30);
  await page.evaluate(() => document.getElementById("colleague").click());
  await status.getByText("The plot was changed elsewhere, so your change was not made. Debrief is showing the latest; try again if you still want to.").waitFor({ timeout: 60000 });
  await page.mouse.move(100, 100, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  assert.equal(await steps(), n + 1, "the colleague's step, and nothing of the drag");

  // Split at current time: the form offers "BLUE ONE (1)" and "BLUE ONE (2)"; one step; both parts selected.
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  await page.locator("#timebar .tc-end").focus();
  await page.keyboard.press("End");
  await page.locator("#timebar .tc-current").focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 2; i++) await page.keyboard.press("PageUp"); // 09:40
  await page.locator(`#outline li[data-id="track-blue-one"]`).click();
  n = await steps();
  await page.locator("#split-track").click();
  const dialog = page.locator("dialog.track-form");
  await dialog.waitFor();
  assert.equal(await dialog.locator("input").nth(0).inputValue(), "BLUE ONE (1)");
  assert.equal(await dialog.locator("input").nth(1).inputValue(), "BLUE ONE (2)");
  await dialog.getByRole("button", { name: "Split" }).click();
  await stepAdded(n);
  assert.match(await latest(), /^BLUE ONE split at \d\d:\d\d:\d\dZ$/);
  // Both parts selected once the plot is shown again (the selection follows the step).
  await page.waitForFunction(() => document.querySelectorAll("#outline li.selected").length === 2, null, { timeout: 10000 });
  assert.deepEqual(await selected(), ["BLUE ONE (1)", "BLUE ONE (2)"]);
  await page.mouse.move(2, 2);
  // The colleague's notice gone first: the pictures are for the post.
  await page.waitForFunction(() => !document.querySelector("#toasts .toast"), null, { timeout: 15000 });
  await shot("tracks-05-split");

  // Merge them again: the form offers the track's own name back; one step.
  n = await steps();
  await page.locator("#merge-tracks").click();
  await dialog.waitFor();
  assert.equal(await page.locator("#track-form-name").inputValue(), "BLUE ONE");
  assert.equal(await dialog.locator(".form-warning").count(), 0, "nothing would be lost");
  await dialog.getByRole("button", { name: "Merge", exact: true }).click();
  await stepAdded(n);
  assert.equal(await latest(), "BLUE ONE (1) and BLUE ONE (2) merged");
  assert.deepEqual(await selected(), ["BLUE ONE"]);
  assert.equal(await page.locator(`#outline li[data-id="track-blue-one-2"]`).count(), 0);
  await shot("tracks-06-merged");
  // Tracks that overlap in time are refused, the message saying where.
  n = await steps();
  await page.locator(`#outline li[data-id="track-red-one"]`).click({ modifiers: ["Control"] });
  await page.locator("#merge-tracks").click();
  await dialog.getByRole("button", { name: "Merge", exact: true }).click();
  await page.locator(".toast", { hasText: /The tracks were not merged: they overlap in time \(.* from \d\d:\d\d:\d\dZ to \d\d:\d\d:\d\dZ\)/ }).waitFor();
  assert.equal(await steps(), n);
  await shot("tracks-07-overlap-refused");

  // The Move… form: what moves, the distance with what it means, the bearing.
  await page.locator(`#outline li[data-id="track-red-one"]`).click();
  n = await steps();
  await page.locator("#move-track").click();
  await dialog.waitFor();
  await page.locator("#track-form-distance").fill("2 km");
  await page.locator("#track-form-distance-note", { hasText: "Means 1.08 nmi" }).waitFor();
  await page.locator("#track-form-bearing").fill("nowhere");
  await dialog.getByRole("button", { name: "Move" }).click();
  await page.locator("#track-form-bearing-note", { hasText: "Type a bearing in degrees true" }).waitFor();
  await page.locator("#track-form-bearing").fill("090");
  await shot("tracks-08-move-form");
  await dialog.getByRole("button", { name: "Move" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "RED ONE moved 1.08 nmi 090.0°T");
  // The Rotate… form: about the first fix, 15° anticlockwise.
  n = await steps();
  await page.locator("#rotate-track").click();
  await dialog.waitFor();
  await page.locator("#track-form-pivot").selectOption("first");
  await page.locator("#track-form-angle").fill("15 anticlockwise");
  await page.locator("#track-form-angle-note", { hasText: "Means 15.0° anticlockwise" }).waitFor();
  await dialog.getByRole("button", { name: "Rotate" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "RED ONE rotated 15.0° anticlockwise");
  // Cancel sends nothing.
  n = await steps();
  await page.locator("#move-track").click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(await steps(), n);
}
