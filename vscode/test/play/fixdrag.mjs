// Moving a single fix in the playground (CAP-01, NFR-13), played as an analyst tidying one bad
// fix would: zoomed out, RED ONE's fixes are too close to grab, and the map says to zoom in;
// zoomed in, each fix in view has a ring of its own. Dragging one moves that fix alone, the map
// saying how far, which way and the speeds it now implies; letting go is one step, and Undo
// puts it back. Escape puts a drag back. The same from the keyboard (Tab to the ring, a run of
// arrow keys one step), by touch (a finger dragging the ring), and through the fix list's
// Move… form, with the position typed. Then Plot as dead reckoning (DR…), one step, undone.
import assert from "node:assert/strict";

export async function playFixDrag(page, shot) {
  const mapFrame = page.frameLocator(".frame-map");
  const steps = () => page.locator("#history li").count();
  const latest = () => page.locator("#history li").first().locator(".name").innerText();
  const stepAdded = (count) => page.waitForFunction((c) => document.querySelectorAll("#history li").length > c, count, { timeout: 60000 });
  const status = mapFrame.locator(".drawing-status");
  const rings = mapFrame.locator(".track-handle-fix");
  const handle = (role) => mapFrame.locator(`.track-handle[data-role="${role}"]`);
  const ring = (time) => mapFrame.locator(`.track-handle-fix[data-time="${time}"]`);
  const button = (name) => mapFrame.getByRole("button", { name, exact: true });
  const dialog = page.locator("dialog.track-form");
  const side = page.locator("#side-frame");
  const centreOf = async (locator) => {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const noToasts = () => page.waitForFunction(() => !document.querySelector("#toasts .toast"), null, { timeout: 15000 });
  const READOUT = /^RED ONE fix at (\d\d:\d\d:\d\dZ): moving (\d+\.\d\d nmi) (\d{3}\.\d°T); \d+\.\d kn from \d\d:\d\d:\d\dZ, \d+\.\d kn on to \d\d:\d\d:\d\dZ/;

  // The whole plot in the window; RED ONE selected alone, the map fitted to it.
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  await page.locator("#timebar .tc-end").focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(500);
  await page.locator(`#outline li[data-id="track-red-one"]`).click();
  await handle("move").waitFor();
  await button("Zoom to the selection").click();
  await page.waitForTimeout(800);
  // Its 241 fixes, a minute apart, are too close together to grab one: no rings, and the note says to zoom in.
  assert.equal(await rings.count(), 0);
  await status.getByText("Zoom in to move a single fix.").waitFor();

  // Zoom in on the pivot (on a fix) until the fixes are far enough apart for rings of their own.
  const pivot = await centreOf(handle("pivot"));
  for (let i = 0; i < 10 && (await rings.count()) === 0; i++) {
    await page.mouse.move(pivot.x, pivot.y);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(700);
  }
  const count = await rings.count();
  assert.ok(count > 0 && count <= 60, `${count} rings in view`);
  await status.getByText("Drag a fix's ring to move that fix alone.").waitFor();
  const first = rings.first();
  assert.match(await first.getAttribute("aria-label"), /^RED ONE: fix at \d\d:\d\d:\d\dZ; drag it, or use the arrow keys, to move this fix alone$/);
  // The track's own handles are still there, above the rings.
  for (const role of ["move", "rotate", "pivot", "start", "end"]) assert.equal(await handle(role).count(), 1, role);

  /** A ring in view, clear of the track's other handles and the map's controls, nearest the middle of those: one to drag. */
  const clearRing = async (skip = []) => {
    const time = await page.locator(".frame-map").evaluate((frame, skipped) => {
      const doc = frame.contentDocument;
      const [w, h] = [doc.documentElement.clientWidth, doc.documentElement.clientHeight];
      const centre = (e) => {
        const r = e.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2];
      };
      const others = [...doc.querySelectorAll(".track-handle:not(.track-handle-fix)")].map(centre);
      const rings = [...doc.querySelectorAll(".track-handle-fix")];
      const free = rings.filter((ring) => {
        const [x, y] = centre(ring);
        if (skipped.includes(ring.dataset.time) || x < 10 || y < 80 || x > w - 80 || y > h - 80) return false;
        // Nothing over it, and room to drag it without touching another handle.
        return doc.elementFromPoint(x, y) === ring && others.every(([ox, oy]) => Math.hypot(ox - x, oy - y) > 40);
      });
      free.sort((a, b) => Math.abs(rings.indexOf(a) - rings.length / 2) - Math.abs(rings.indexOf(b) - rings.length / 2));
      return free[0]?.dataset.time;
    }, skip);
    if (time) return time;
    const why = await page.locator(".frame-map").evaluate((frame) => {
      const doc = frame.contentDocument;
      const box = doc.getElementById("map");
      const r = [...doc.querySelectorAll(".track-handle-fix")].map((e) => e.getBoundingClientRect()).map((b) => `${Math.round(b.x)},${Math.round(b.y)}`);
      return `scroll ${box.scrollLeft},${box.scrollTop}; rings at ${r.join(" ")}`;
    });
    assert.fail(`no ring clear of the other handles and the map's controls (${why})`);
  };

  // Drag a fix's ring: that fix alone goes, the map saying how far, which way and the speeds it now implies.
  const time = await clearRing();
  const neighbours = await rings.evaluateAll((list, t) => {
    const i = list.findIndex((r) => r.dataset.time === t);
    return [list[i - 1]?.dataset.time, list[i + 1]?.dataset.time].filter(Boolean);
  }, time);
  const where = async (t) => centreOf(ring(t));
  const before = await where(time);
  const neighboursBefore = await Promise.all(neighbours.map(where));
  let n = await steps();
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x + 90, before.y - 60, { steps: 8 });
  await page.waitForTimeout(150);
  const said = await status.innerText();
  const [, when, distance, bearing] = said.match(READOUT) ?? [];
  assert.ok(when && distance && bearing, said);
  assert.match(said, /as a jump would be$/, "a fix pulled that far in a minute is as fast as a jump, and the map says so");
  assert.equal(await mapFrame.locator("path.track-before").count(), 1, "the track as it was, dashed beneath");
  await shot("fixdrag-01-dragging");
  await page.mouse.up();
  await stepAdded(n);
  assert.equal(await latest(), `RED ONE fix at ${when} moved ${distance} ${bearing}`);
  assert.equal(await steps(), n + 1, "one step for one release");
  // Its neighbours stayed where they were; it is where it was let go.
  const after = await where(time);
  assert.ok(Math.hypot(after.x - before.x - 90, after.y - before.y + 60) < 3, "the fix is where it was let go");
  for (const [i, t] of neighbours.entries()) {
    const now = await where(t);
    assert.ok(Math.hypot(now.x - neighboursBefore[i].x, now.y - neighboursBefore[i].y) < 1, "a neighbour stays");
  }
  await page.mouse.move(2, 2);
  await noToasts();
  await shot("fixdrag-02-moved");

  // Escape during a drag puts it back: nothing is recorded.
  n = await steps();
  const again = await where(time);
  await page.mouse.move(again.x, again.y);
  await page.mouse.down();
  await page.mouse.move(again.x + 30, again.y + 30, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await status.getByText("Not changed.").waitFor();
  await page.waitForTimeout(900);
  assert.equal(await steps(), n);
  const escaped = await where(time);
  assert.ok(Math.hypot(escaped.x - after.x, escaped.y - after.y) < 1, "back where it was");

  // Undo puts the fix back.
  await page.locator("#selected-count").click();
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => /RED ONE fix at [^]*undone/.test(document.getElementById("history")?.textContent ?? ""));
  await page.waitForTimeout(500);
  const undone = await where(time);
  assert.ok(Math.hypot(undone.x - before.x, undone.y - before.y) < 1, "undo puts the fix back");

  // From the keyboard: Tab from the last of the track's handles reaches the fixes' rings; the arrow
  // keys nudge one, and a run of presses is one step.
  await handle("end").focus();
  for (let i = 0; i < 80; i++) {
    if (await page.locator(".frame-map").evaluate((f) => f.contentDocument?.activeElement?.dataset.role === "fix")) break;
    await page.keyboard.press("Tab");
  }
  const focused = await page.locator(".frame-map").evaluate((f) => f.contentDocument?.activeElement?.dataset.time);
  assert.ok(focused, "Tab reaches a fix's ring");
  const keyed = await clearRing();
  await ring(keyed).focus();
  n = await steps();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  const nudged = await status.innerText();
  const [, keyedWhen, keyedDistance, keyedBearing] = nudged.match(READOUT) ?? [];
  assert.ok(keyedWhen, nudged);
  await shot("fixdrag-03-keyboard");
  await stepAdded(n);
  await page.waitForTimeout(1200);
  assert.equal(await steps(), n + 1, "one step for the run of presses");
  assert.equal(await latest(), `RED ONE fix at ${keyedWhen} moved ${keyedDistance} ${keyedBearing}`);

  // By touch: a finger drags a fix's ring, as a mouse does; one step.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y]) => ({ x, y, radiusX: 4, radiusY: 4, force: 1 })) });
  const touched = await clearRing([keyed]);
  const t0 = await where(touched);
  n = await steps();
  await touch("touchStart", [[t0.x, t0.y]]);
  for (let i = 1; i <= 8; i++) {
    await touch("touchMove", [[t0.x + 5 * i, t0.y - 3 * i]]);
    await page.waitForTimeout(30);
  }
  await status.getByText(READOUT).waitFor();
  await touch("touchEnd", []);
  await stepAdded(n);
  assert.match(await latest(), /^RED ONE fix at \d\d:\d\d:\d\dZ moved \d+\.\d\d nmi \d{3}\.\d°T$/);
  const t1 = await where(touched);
  assert.ok(Math.hypot(t1.x - t0.x - 40, t1.y - t0.y + 24) < 4, "the fix went where the finger took it");

  // The form: right-click a fix's ring for its menu (the fix list), then Move…, the position typed.
  const formed = await clearRing([keyed, touched]);
  const f0 = await where(formed);
  await page.mouse.click(f0.x, f0.y, { button: "right" });
  await side.locator(".fix-list li.selected").waitFor();
  n = await steps();
  await side.getByRole("button", { name: "Move…" }).click();
  await dialog.waitFor();
  const position = page.locator("#track-form-position");
  const offered = await position.inputValue();
  const [, deg, min, rest] = offered.match(/^(\d+)°(\d+\.\d+)'N (.*)$/) ?? [];
  assert.ok(deg, offered);
  await position.fill("somewhere");
  await page.locator("#track-form-position-note.problem").waitFor();
  await position.fill(`${deg}°${(Number(min) + 0.1).toFixed(3).padStart(6, "0")}'N ${rest}`);
  await page.locator("#track-form-position-note", { hasText: /moves 0\.10 nmi (00\d|35\d)\.\d°T; \d+\.\d kn from/ }).waitFor();
  await page.mouse.move(2, 2);
  await shot("fixdrag-04-form");
  await dialog.getByRole("button", { name: "Move" }).click();
  await stepAdded(n);
  assert.match(await latest(), /^RED ONE fix at \d\d:\d\d:\d\dZ moved 0\.10 nmi (00\d|35\d)\.\d°T$/);
  await side.locator(".side-bar button", { hasText: "Close" }).click();

  // Plot as dead reckoning (DR…): one step, its positions worked out from its first fix by course and speed; undone.
  n = await steps();
  await page.locator("#dead-reckon").click();
  await dialog.waitFor();
  await dialog.getByText("Undo puts them back").waitFor();
  await dialog.getByRole("button", { name: "Plot as DR" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "RED ONE plotted by dead reckoning");
  await page.locator("#selected-count").click();
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => /RED ONE plotted by dead reckoning[^]*undone/.test(document.getElementById("history")?.textContent ?? ""));
}
