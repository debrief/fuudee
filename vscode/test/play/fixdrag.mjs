// Moving a single fix in the playground (CAP-01, NFR-13), played as an analyst tidying one bad
// fix would: zoomed out, RED ONE's fixes are too close to grab, and the map says to zoom in;
// zoomed in, each fix in view has a ring of its own. Dragging one moves that fix alone, the map
// saying how far, which way and the speeds it now implies; letting go is one step, and Undo
// puts it back. Escape puts a drag back. The same from the keyboard (Tab to the ring, a run of
// arrow keys one step), by touch (a finger dragging the ring), and through the fix list's
// Move… form, with the position typed. Then Plot as dead reckoning (DR…), one step; on the DR track
// a fix dragged changes the leg into it and every later fix follows, and a rotation turns its
// courses (product owner, 14 Oct 2026); over the ground again asks first; all undone.
import { showPanel } from "./dock.mjs";
import assert from "node:assert/strict";

export async function playFixDrag(page, shot) {
  const mapFrame = page.frameLocator(".frame-map");
  const steps = () => page.locator("#history li").count();
  const latest = () => page.locator("#history li").first().locator(".name").textContent();
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
  await page.evaluate(() => document.activeElement?.blur());
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

  // OTG/DR…: the track plotted by dead reckoning, one step, and tagged DR beside its name in the outline and on the map.
  // DR is the first of the row's tags, as in VS Code's (the Outline panel model's order).
  const drTagged = async () => /^DR( · |$)/.test(await page.locator(`#outline li[data-id="track-red-one"] .detail`).innerText());
  assert.equal(await drTagged(), false);
  n = await steps();
  await page.locator("#plotting-mode").click();
  await dialog.waitFor();
  // What the form explains is said in the neutral style, not as a warning.
  await dialog.locator(".form-info", { hasText: "Undo takes it back" }).waitFor();
  assert.equal(await dialog.locator(".form-warning").count(), 0);
  await page.locator("#track-form-mode").selectOption("dr");
  await shot("fixdrag-05-plot-as-dr");
  await dialog.getByRole("button", { name: "Plot" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "RED ONE plotted by dead reckoning");
  assert.equal(await drTagged(), true);
  await mapFrame.locator(".track-label", { hasText: "RED ONE (DR)" }).waitFor();
  await page.waitForTimeout(500);

  // On the DR track a fix dragged changes the leg into it, so dead reckoning puts it where it is let go,
  // and every later fix follows, its ring with it, while the fixes before stay (product owner, 14 Oct 2026).
  const drTime = await clearRing();
  const order = await rings.evaluateAll((list) => list.map((r) => r.dataset.time));
  const k = order.indexOf(drTime);
  const [earlierTime, laterTime] = [order[k - 1], order[k + 2] ?? order[k + 1]];
  assert.ok(earlierTime && laterTime, "rings either side of the one dragged");
  const [drFrom, earlierFrom, laterFrom] = [await where(drTime), await where(earlierTime), await where(laterTime)];
  n = await steps();
  await page.mouse.move(drFrom.x, drFrom.y);
  await page.mouse.down();
  await page.mouse.move(drFrom.x + 60, drFrom.y - 40, { steps: 8 });
  await page.waitForTimeout(150);
  const drSaid = await status.innerText();
  const [, drWhen, drLeg] = drSaid.match(/^RED ONE \(DR\) fix at (\d\d:\d\d:\d\dZ): moving \d+\.\d\d nmi \d{3}\.\d°T; leg into it now (\d{3}\.\d°T \d+\.\d kn) \(was \d{3}\.\d°T \d+\.\d kn\); the fixes after follow/) ?? [];
  assert.ok(drWhen, drSaid);
  const laterNow = await where(laterTime);
  assert.ok(Math.hypot(laterNow.x - laterFrom.x - 60, laterNow.y - laterFrom.y + 40) < 4, "a later fix follows while dragging, as dead reckoning puts it");
  assert.ok((await mapFrame.locator("path.track-moved-fix").count()) > 2, "the fixes that follow are marked");
  await shot("dr-01-fix-dragging");
  await page.mouse.up();
  await stepAdded(n);
  assert.equal(await latest(), `RED ONE (DR) leg into ${drWhen} now ${drLeg}`);
  assert.equal(await steps(), n + 1, "one step for one release");
  await page.waitForTimeout(500);
  const [drTo, earlierTo, laterTo] = [await where(drTime), await where(earlierTime), await where(laterTime)];
  assert.ok(Math.hypot(drTo.x - drFrom.x - 60, drTo.y - drFrom.y + 40) < 3, "the fix is where it was let go");
  assert.ok(Math.hypot(earlierTo.x - earlierFrom.x, earlierTo.y - earlierFrom.y) < 1, "the fix before stays");
  assert.ok(Math.hypot(laterTo.x - laterFrom.x - 60, laterTo.y - laterFrom.y + 40) < 4, "a later fix followed");
  await page.mouse.move(2, 2);
  await noToasts();
  await shot("dr-02-fix-dragged");

  // A rotation turns the DR track's courses; from the keyboard, a run of presses is one step.
  n = await steps();
  await handle("rotate").focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await status.getByText(/^RED ONE \(DR\): rotating 3\.0° clockwise about /).waitFor();
  await stepAdded(n);
  assert.equal(await latest(), "RED ONE (DR) rotated 3.0° clockwise");
  await page.waitForTimeout(500);
  // Plotted over the ground again would lose that rotation: Debrief asks first (panel finding 7).
  await page.locator("#plotting-mode").click();
  await dialog.waitFor();
  await page.locator("#track-form-mode").selectOption("otg");
  await dialog.getByRole("button", { name: "Plot" }).click();
  await dialog.locator(".form-warning", { hasText: /^RED ONE was changed while plotted by dead reckoning \((its first fix is [\d.]+ nmi from where it was logged|its course and speed at \d\d:\d\d:\d\dZ are [^)]*)\)/ }).waitFor();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "detached" });

  // Changed while plotted by dead reckoning: moved 1 nmi east.
  n = await steps();
  await page.locator("#move-track").click();
  await dialog.waitFor();
  await page.locator("#track-form-distance").fill("1 nmi");
  await page.locator("#track-form-bearing").fill("090");
  await dialog.getByRole("button", { name: "Move" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "RED ONE (DR) moved 1.00 nmi 090.0°T");
  // Over the ground again loses that change: the reader is warned and confirms first (product owner, 14 Oct 2026).
  const toOtg = async () => {
    await page.locator("#plotting-mode").click();
    await dialog.waitFor();
    assert.equal(await page.locator("#track-form-mode option:checked").innerText(), "Dead reckoning (DR), as now");
    await page.locator("#track-form-mode").selectOption("otg");
    await dialog.getByRole("button", { name: "Plot" }).click();
    await page.waitForFunction(() => document.querySelector("dialog.track-form h2")?.textContent === "Plot RED ONE over the ground?");
    await dialog.locator(".form-warning", { hasText: /^RED ONE was changed while plotted by dead reckoning \(its first fix is \d+\.\d\d nmi from where it was logged\)\. Plotted over the ground, each fix goes back where it was logged, with its course and speed as logged, and the changes made while plotted by dead reckoning are lost/ }).waitFor();
  };
  n = await steps();
  await toOtg();
  await page.mouse.move(2, 2);
  await shot("fixdrag-06-dr-changes-lost");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.waitForTimeout(500);
  assert.equal(await steps(), n, "not confirmed: nothing changed");
  assert.equal(await drTagged(), true);
  await toOtg();
  await dialog.getByRole("button", { name: "Plot over the ground" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "RED ONE plotted over the ground");
  assert.equal(await steps(), n + 1, "one step");
  assert.equal(await drTagged(), false);
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 5; i++) await page.keyboard.press("Control+z");
  await page.waitForFunction(() => /RED ONE plotted by dead reckoning[^]*undone/.test(document.getElementById("history")?.textContent ?? ""));

  // Importing a REP file asks how each track is plotted, as legacy Debrief did; "use this choice for
  // future imports" is the reader's own setting (not the plot's), said in the import's notes and cleared by Ask again.
  const rep = new URL("../integration/demo.rep", import.meta.url).pathname;
  await page.locator("#file").setInputFiles(rep);
  await dialog.waitFor();
  assert.equal(await dialog.locator("h2").innerText(), "How is NELSON plotted? (1 of 3)");
  // As legacy Debrief asked: OTG or DR, and apart from that a box to tick; what it explains, in the neutral style.
  assert.deepEqual(await page.locator("#track-form-mode option").allInnerTexts(), ["Over the ground (OTG)", "Dead reckoning (DR)"]);
  const remember = dialog.getByRole("checkbox", { name: "Use this choice for future track imports" });
  assert.equal(await remember.isChecked(), false);
  await dialog.locator(".form-info", { hasText: "Tick the box to be asked no more" }).waitFor();
  assert.equal(await dialog.locator(".form-warning").count(), 0);
  await page.locator("#track-form-mode").selectOption({ label: "Dead reckoning (DR)" });
  await shot("fixdrag-07-import-asks");
  await dialog.getByRole("button", { name: "Import" }).click();
  await page.waitForFunction(() => document.querySelector("dialog.track-form h2")?.textContent === "How is BLUE plotted? (2 of 3)");
  await page.locator("#track-form-mode").selectOption({ label: "Over the ground (OTG)" });
  await dialog.getByRole("checkbox", { name: "Use this choice for future track imports" }).check();
  await dialog.getByRole("button", { name: "Import" }).click();
  const notes = page.locator(".omitted-panel .import-notes");
  await notes.getByText("Track 'NELSON' plotted by dead reckoning (DR).").waitFor({ timeout: 60000 });
  await notes.getByText("Track 'BLUE' plotted over the ground (OTG).").waitFor();
  await notes.getByText(/^Track '"?TRAWLER.*plotted over the ground \(OTG\)\.$/).waitFor();
  await showPanel(page, "import"); // Import, a menu in the top bar
  await page.locator("#import-mode-text", { hasText: "plotted over the ground (OTG), as you chose for future imports" }).waitFor();
  assert.equal(await page.locator("#ask-again").isVisible(), true);
  await page.keyboard.press("Escape"); // the menu closed, from the keyboard, back to its button
  await page.locator("#panel-import").waitFor({ state: "hidden" });
  // Remembered: the next import asks nothing, and its notes say how to be asked again.
  await page.locator(".side-bar button", { hasText: "Close" }).click();
  await page.locator("#file").setInputFiles(rep);
  await notes.getByText("Tracks were plotted over the ground (OTG) as you chose for future imports. To be asked again for each track, choose Ask again under Import.").waitFor({ timeout: 60000 });
  assert.equal(await dialog.count(), 0, "not asked");
  await page.locator(".side-bar button", { hasText: "Close" }).click();
  await showPanel(page, "import");
  await page.locator("#ask-again").click();
  await page.locator("#ask-again").waitFor({ state: "hidden" });
  assert.match(await page.locator("#import-mode-text").textContent(), /^Debrief asks, for each track/);
  // Asked again, and stopping imports nothing.
  await page.locator("#file").setInputFiles(rep);
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.locator(".toast", { hasText: "Nothing was imported." }).waitFor();
}
