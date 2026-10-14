// Shearing and stretching a track in the playground (CAP-21, CAP-01, NFR-13), played as an
// analyst working a TMA leg would: RED ONE's straight leg between 09:40 and 10:20 sheared by
// dragging its end (course and speed together, the start held), then stretched (speed only);
// Escape puts a drag back; the same from the keyboard, a run of presses one step; the Shear…
// and Stretch… forms; and undo.
import assert from "node:assert/strict";

export async function playShear(page, shot) {
  const mapFrame = page.frameLocator(".frame-map");
  const steps = () => page.locator("#history li").count();
  const latest = () => page.locator("#history li").first().locator(".name").innerText();
  const stepAdded = (count) => page.waitForFunction((c) => document.querySelectorAll("#history li").length > c, count, { timeout: 60000 });
  const status = mapFrame.locator(".drawing-status");
  const handle = (role) => mapFrame.locator(`.track-handle[data-role="${role}"]`);
  const centreOf = async (locator) => {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const button = (name) => mapFrame.getByRole("button", { name, exact: true });
  /** Press on a handle, move by (dx, dy) as a hand would, and leave the button down. */
  const grab = async (role, dx, dy) => {
    const at = await centreOf(handle(role));
    const frame = await page.locator(".frame-map").boundingBox();
    assert.ok(at.x > frame.x && at.x < frame.x + frame.width && at.y > frame.y && at.y < frame.y + frame.height, `the ${role} handle is on the map`);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + dx, at.y + dy, { steps: 8 });
    await page.waitForTimeout(100);
  };
  /** Where an end's fix is: its handle is drawn a little beyond it, along the track. */
  const fixOf = async (role) => {
    const c = await centreOf(handle(role));
    const [left, top, width] = await handle(role).evaluate((e) => [parseFloat(e.style.marginLeft), parseFloat(e.style.marginTop), e.offsetWidth]);
    return { x: c.x - (left + width / 2), y: c.y - (top + width / 2) };
  };
  /** The leg's direction on the screen, start to end, as a unit vector. */
  const along = async () => {
    const [a, b] = [await centreOf(handle("start")), await centreOf(handle("end"))];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  };

  // RED ONE's second leg, 250° at 4 kn from 09:22 to 10:28: the window 09:40 to 10:20, only its fixes.
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 2; i++) await page.keyboard.press("PageUp");
  await page.locator("#timebar .tc-end").focus();
  await page.keyboard.press("End");
  for (let i = 0; i < 2; i++) await page.keyboard.press("PageDown");
  await page.waitForTimeout(500);
  assert.match(await page.locator("#timebar").innerText(), /09:40:00Z\s*[–-]\s*10:20:00Z/);
  await page.locator(`#outline li[data-id="track-red-one"]`).click();
  await handle("end").waitFor();
  // Close in on the leg: the map fitted to RED ONE, then one step nearer.
  await button("Zoom to the selection").click();
  await page.waitForTimeout(400);
  await mapFrame.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(600);
  // The notice of the refused merge before this gone first: the pictures are for the post.
  await page.waitForFunction(() => !document.querySelector("#toasts .toast"), null, { timeout: 15000 });
  await button("Time window").click();
  assert.equal(await button("Shear").getAttribute("aria-pressed"), "true", "dragging an end shears, unless the analyst chooses");
  // Two choices on the map, side by side and each named for what it chooses: what the handles change (for a shear as for a move), and what dragging an end does.
  assert.equal(await mapFrame.getByRole("group", { name: "What the handles on the selected track change" }).getByRole("button").count(), 2);
  assert.equal(await mapFrame.getByRole("group", { name: "What dragging an end of the selected track does" }).getByRole("button").count(), 2);
  assert.equal(await mapFrame.locator('[role="group"]:has(button[data-mode])').count(), 1, "Shear and Stretch are not inside the other choice");
  const tops = await mapFrame.locator('.track-extent [role="group"]').evaluateAll((all) => all.map((g) => Math.round(g.getBoundingClientRect().top)));
  assert.deepEqual(tops, [tops[0], tops[0]], "side by side, so the control is short enough for a short map");
  // Under the outline, the track's actions and the annotations' are labelled groups, compact: the track's
  // ten (changing it, cleaning it, then dead reckoning) in at most four rows, the annotations' four in at most two.
  for (const [group, count, most] of [["Track", 10, 4], ["Annotation", 4, 2]]) {
    const buttons = page.getByRole("group", { name: group, exact: true }).getByRole("button");
    assert.equal(await buttons.count(), count, group);
    const rows = new Set(await buttons.evaluateAll((all) => all.map((b) => Math.round(b.getBoundingClientRect().top))));
    assert.ok(rows.size <= most, `${group}: ${rows.size} rows`);
  }
  // Five handles: move, rotate, pivot, and the two ends, each named for a screen reader.
  assert.equal(await mapFrame.locator(".track-handle:not(.track-handle-fix)").count(), 5);
  assert.equal(await handle("end").getAttribute("aria-label"), "RED ONE, fixes in the time window: shear from the end, holding the start; drag it, or use the arrow keys");
  assert.match(await handle("start").getAttribute("aria-label"), /^RED ONE, fixes in the time window: shear from the start, holding the end/);
  await status.getByText("RED ONE, fixes in the time window: drag the move or rotate handle, or an end to shear it; or Tab to one and use the arrow keys.").waitFor();
  await page.mouse.move(2, 2);
  await shot("shear-01-leg-before");

  // Drag the end square off the leg: course and speed change together, the start held; the
  // map says the new course and speed and how far the end went. Letting go is one step.
  let n = await steps();
  const startBefore = await fixOf("start");
  const dir = await along();
  await grab("end", -dir.y * 70, dir.x * 70);
  const said = await status.innerText();
  const [, course, speed] = said.match(/^RED ONE: shearing to (\d{3}\.\d°T) (\d+\.\d kn); end moved \d+\.\d\d nmi \d{3}\.\d°T; only the fixes in the time window change, so the track jumps where they meet the rest$/) ?? [];
  assert.ok(course && speed, said);
  assert.equal(await mapFrame.locator("path.track-before").count(), 1, "the track as it was, dashed beneath");
  await shot("shear-02-dragging");
  await page.mouse.up();
  await stepAdded(n);
  assert.equal(await latest(), `RED ONE part sheared: ${course} ${speed}`);
  assert.equal(await steps(), n + 1, "one step for one release");
  const startAfter = await fixOf("start");
  assert.ok(Math.abs(startAfter.x - startBefore.x) < 2 && Math.abs(startAfter.y - startBefore.y) < 2, "the start is held");
  await page.mouse.move(2, 2);
  await shot("shear-03-leg-after");

  // Escape during a drag of an end puts it back: nothing is recorded.
  n = await steps();
  await grab("end", 40, 40);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await status.getByText("Not changed.").waitFor();
  await page.waitForTimeout(900);
  assert.equal(await steps(), n);

  // Undo takes the shear back.
  await page.locator("#selected-count").click();
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => /RED ONE part sheared[^]*undone/.test(document.getElementById("history")?.textContent ?? ""));

  // Stretch: only how far along the leg the end goes counts; the course stays, the speed changes.
  await button("Stretch").click();
  assert.equal(await button("Stretch").getAttribute("aria-pressed"), "true");
  assert.match(await handle("end").getAttribute("aria-label"), /stretch from the end, holding the start; drag it along the track, or use Up and Down to change speed$/);
  assert.equal(await mapFrame.locator(".track-handle-stretch").count(), 2);
  n = await steps();
  const leg = await along();
  await grab("end", leg.x * 60 - leg.y * 25, leg.y * 60 + leg.x * 25);
  const stretching = await status.innerText();
  const [, faster, was] = stretching.match(/^RED ONE: stretching to (\d+\.\d kn) \(was (\d+\.\d kn)\); only the fixes in the time window change/) ?? [];
  assert.ok(faster && was && Number.parseFloat(faster) > Number.parseFloat(was), stretching);
  await shot("shear-04-stretching");
  await page.mouse.up();
  await stepAdded(n);
  assert.equal(await latest(), `RED ONE part stretched: ${faster}`);

  // From the keyboard: on a stretch handle Up is one step of speed faster; a run of presses is one step.
  n = await steps();
  await handle("start").focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
  await status.getByText(/^RED ONE: stretching to \d+\.\d kn \(was \d+\.\d kn\)/).waitFor();
  await stepAdded(n);
  await page.waitForTimeout(1200);
  assert.equal(await steps(), n + 1, "one step for the run of presses");
  assert.match(await latest(), /^RED ONE part stretched: \d+\.\d kn$/);
  // On a shear handle the arrow keys move the end, as the move handle; Enter sends it at once.
  await button("Shear").click();
  n = await steps();
  await handle("end").focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowUp");
  await status.getByText(/^RED ONE: shearing to \d{3}\.\d°T \d+\.\d kn; end moved/).waitFor();
  await page.keyboard.press("Enter");
  await stepAdded(n);
  await page.waitForTimeout(1200);
  assert.equal(await steps(), n + 1);
  assert.match(await latest(), /^RED ONE part sheared: \d{3}\.\d°T \d+\.\d kn$/);

  // The Shear… form: the whole track, holding its end, to 200°T at 6 kn; each field says what it read.
  await button("Whole track").click();
  const dialog = page.locator("dialog.track-form");
  n = await steps();
  await page.locator("#shear-track").click();
  await dialog.waitFor();
  const offered = async () => [await page.locator("#track-form-course").inputValue(), await page.locator("#track-form-speed").inputValue()];
  const [wholeCourse, wholeSpeed] = await offered();
  assert.match(wholeCourse, /^\d{3}\.\d$/, "offers the course it makes good now");
  // Choosing the fixes in the window offers what they make good, not the whole track's; the labels say it too.
  await page.locator("#track-form-extent").selectOption("window");
  const [windowCourse, windowSpeed] = await offered();
  assert.notDeepEqual([windowCourse, windowSpeed], [wholeCourse, wholeSpeed]);
  assert.equal(await dialog.getByText(`Course made good, true (now ${windowCourse}°T)`).count(), 1);
  assert.equal(await dialog.getByText(`Speed made good (now ${windowSpeed} kn)`).count(), 1);
  await page.locator("#track-form-extent").selectOption("whole");
  assert.deepEqual(await offered(), [wholeCourse, wholeSpeed]);
  await page.locator("#track-form-anchor").selectOption("end");
  await page.locator("#track-form-course").fill("200");
  await page.locator("#track-form-course-note", { hasText: "Means 200.0°T" }).waitFor();
  await page.locator("#track-form-speed").fill("fast");
  await dialog.getByRole("button", { name: "Shear" }).click();
  await page.locator("#track-form-speed-note", { hasText: "Type a speed" }).waitFor();
  await page.locator("#track-form-speed").fill("6");
  await page.locator("#track-form-speed-note", { hasText: "Means 6.0 kn" }).waitFor();
  await shot("shear-05-form");
  await dialog.getByRole("button", { name: "Shear" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "RED ONE sheared: 200.0°T 6.0 kn");
  // The Stretch… form: holding the start, 8 kn on the same course.
  n = await steps();
  await page.locator("#stretch-track").click();
  await dialog.waitFor();
  await page.locator("#track-form-anchor").selectOption("start");
  await page.locator("#track-form-speed").fill("8 kn");
  await dialog.getByRole("button", { name: "Stretch" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "RED ONE stretched: 8.0 kn");
  await page.mouse.move(2, 2);
  await shot("shear-06-stretched-by-form");
  // Both undone, like any step.
  await page.locator("#selected-count").click();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => [...document.querySelectorAll("#history li")].slice(0, 2).every((li) => /undone/.test(li.textContent ?? "")));

  // Back to the whole plot in the window, for what follows.
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  await page.locator("#timebar .tc-end").focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(500);
}
