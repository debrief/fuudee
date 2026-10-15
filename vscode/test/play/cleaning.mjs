// Cleaning tracks in the playground (CAP-01, EXT-14, NFR-13), played as a reader would: GPS
// glitches put into RED ONE; Jumps… finds them, rings them on the map and lists them, all ticked;
// unticking one takes its ring away; Remove takes the rest out as one step, and Undo puts them
// back. Smooth… previews the track dashed on the map with how far fixes would move, and Apply is
// one step. Fixes… lists RED ONE's fixes: one is coloured, labelled and commented on, each one
// step; the label is drawn on the map, the comment shows when pointing at the fix and in the
// Timeline; a right-click on a fix on the map chooses it in the list, and so, on a touch screen,
// does pressing and holding it (a tap or a moving finger does not); the list works from the keyboard.
import { searchTimeline, timelineRow } from "./timelinerows.mjs";
import assert from "node:assert/strict";

export async function playCleaning(page, shot) {
  const mapFrame = page.frameLocator(".frame-map");
  const steps = () => page.locator("#history li").count();
  const latest = () => page.locator("#history li").first().locator(".name").innerText();
  const stepAdded = (count) => page.waitForFunction((c) => document.querySelectorAll("#history li").length > c, count, { timeout: 60000 });
  const dialog = page.locator("dialog.track-form");
  const rings = () => mapFrame.locator("path.fix-check").count();
  const note = mapFrame.locator(".drawing-status");
  const side = page.locator("#side-frame");

  // The whole plot in the window, so every fix of RED ONE is drawn.
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  await page.locator("#timebar .tc-end").focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(500);
  await page.locator(`#outline li[data-id="track-red-one"]`).click();

  // Glitches, as a step of their own by the playground: never mistaken for real data.
  let n = await steps();
  await page.locator("#glitches").click();
  await stepAdded(n);
  assert.equal(await latest(), "GPS glitches put into RED ONE");

  // Closer in, so some of the jumps to come are off the map: finding them brings them all into view.
  const mapBox = await page.locator(".frame-map").boundingBox();
  await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(800);
  await page.mouse.move(2, 2);

  // Jumps…: the threshold offered, then the jumps found, ringed and listed, all ticked. Nothing is removed yet.
  n = await steps();
  await page.locator("#find-jumps").click();
  await dialog.waitFor();
  assert.match(await page.locator("#track-form-threshold").inputValue(), /^\d+\.\d kn$/);
  await page.locator("#track-form-threshold").fill("fast");
  await dialog.getByRole("button", { name: "Find" }).click();
  await page.locator("#track-form-threshold-note", { hasText: "Type a speed" }).waitFor();
  await page.locator("#track-form-threshold").fill("30 kn");
  await page.locator("#track-form-threshold-note", { hasText: "Means faster than 30.0 kn to reach" }).waitFor();
  await dialog.getByRole("button", { name: "Find" }).click();
  const boxes = side.locator(".jump-list input[type=checkbox]");
  await boxes.first().waitFor();
  assert.equal(await boxes.count(), 3);
  await mapFrame.locator("path.fix-check").nth(2).waitFor();
  assert.equal(await rings(), 3);
  await note.getByText("RED ONE: 3 jumps found, each faster than 30.0 kn to reach.").waitFor();
  assert.equal(await steps(), n, "finding jumps changes nothing");
  // Every jump found is in view, the map zooming out if one was off it: none is removed unseen.
  await page.waitForTimeout(500); // the panel beside the map opened, and the map narrowed
  const frame = await page.locator(".frame-map").boundingBox();
  for (let i = 0; i < 3; i++) {
    const ring = await mapFrame.locator("path.fix-check").nth(i).boundingBox();
    const inside = ring && ring.x >= frame.x && ring.y >= frame.y && ring.x + ring.width <= frame.x + frame.width && ring.y + ring.height <= frame.y + frame.height;
    assert.ok(inside, `jump ${i + 1} of 3 is ringed in view`);
  }
  await page.mouse.move(2, 2);
  await page.waitForFunction(() => !document.querySelector("#toasts .toast"), null, { timeout: 15000 }); // the notices gone: the pictures are for the post
  await shot("clean-01-jumps-found");
  // Unticked, a jump is not removed, and its ring goes; ticked again, it comes back.
  await boxes.nth(1).uncheck();
  await page.waitForFunction(() => document.querySelector(".frame-map")?.contentDocument?.querySelectorAll("path.fix-check").length === 2);
  assert.equal(await side.getByRole("button", { name: "Remove 2 jumps" }).count(), 1);
  await boxes.nth(1).check();
  await side.getByRole("button", { name: "Remove 3 jumps" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "RED ONE: 3 jumps removed");
  await side.waitFor({ state: "hidden" });
  assert.equal(await rings(), 0, "the rings go with the panel");
  // Undo puts them back; redo takes them out again.
  await page.locator("#undo").click();
  await page.waitForFunction(() => document.querySelector("#history li .detail")?.textContent?.includes("undone"));
  await page.locator("#redo").click();
  await page.waitForFunction(() => !document.querySelector("#history li .detail")?.textContent?.includes("undone"));
  // Again: none left at that speed, and it says so.
  await page.locator("#find-jumps").click();
  await page.locator("#track-form-threshold").fill("30 kn");
  await dialog.getByRole("button", { name: "Find" }).click();
  await page.locator(".toast", { hasText: "RED ONE: no jumps found faster than 30.0 kn." }).waitFor();

  // Smooth…: previewed, dashed on the map, with how far fixes would move; Cancel changes nothing.
  n = await steps();
  await page.locator("#smooth-track").click();
  await dialog.waitFor();
  await page.locator("#track-form-window").fill("4");
  await page.locator("#track-form-window-note", { hasText: "Type an odd number" }).waitFor();
  await page.locator("#track-form-window").fill("5");
  await page.locator("#track-form-window-note", { hasText: "Means each fix averaged with the 2 either side of it" }).waitFor();
  await dialog.getByRole("button", { name: "Preview" }).click();
  await mapFrame.locator("path.fix-preview").waitFor();
  const said = await side.locator(".clean-panel p").innerText();
  assert.match(said, /^RED ONE smoothed over 5 fixes, if applied: \d+ fix(es)? moved; the most a fix moved: [\d.]+ (nmi|m), at \d\d:\d\d:\d\dZ\./);
  await note.getByText(/RED ONE smoothed over 5 fixes, if applied/).waitFor();
  assert.equal(await steps(), n, "a preview changes nothing");
  await page.mouse.move(2, 2);
  await page.waitForFunction(() => !document.querySelector("#toasts .toast"), null, { timeout: 15000 }); // the notices gone: the pictures are for the post
  await shot("clean-02-smoothing-preview");
  await side.getByRole("button", { name: "Cancel" }).click();
  await mapFrame.locator("path.fix-preview").waitFor({ state: "detached" });
  assert.equal(await steps(), n);
  // Again, and Apply: one step.
  await page.locator("#smooth-track").click();
  await page.locator("#track-form-window").fill("5");
  await dialog.getByRole("button", { name: "Preview" }).click();
  await side.getByRole("button", { name: "Apply" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "RED ONE smoothed over 5 fixes");
  await mapFrame.locator("path.fix-preview").waitFor({ state: "detached" });

  // Fixes…: the fix list; one chosen is ringed on the map; coloured, labelled and commented, each a step.
  await page.locator("#fix-list").click();
  const rows = side.locator(".fix-list li");
  await rows.first().waitFor();
  assert.ok((await rows.count()) > 100, "every fix is listed");
  const row = rows.nth(40);
  await row.click();
  assert.equal(await row.getAttribute("aria-selected"), "true");
  await mapFrame.locator("path.fix-check").first().waitFor();
  const when = (await row.locator(".name").innerText()).trim();
  n = await steps();
  await side.locator(".fix-actions select").selectOption({ label: "Yellow" });
  await stepAdded(n);
  assert.equal(await latest(), `RED ONE fix at ${when} coloured yellow`);
  n = await steps();
  await side.getByRole("button", { name: "Label…" }).click();
  await page.locator("#track-form-text").fill("Turn 1");
  await dialog.getByRole("button", { name: "Save" }).click();
  await stepAdded(n);
  assert.equal(await latest(), `RED ONE fix at ${when} labelled 'Turn 1'`);
  n = await steps();
  await side.getByRole("button", { name: "Comment…" }).click();
  await page.locator("#track-form-text").fill("Wheel over for the second leg");
  await dialog.getByRole("button", { name: "Save" }).click();
  await stepAdded(n);
  assert.equal(await latest(), `RED ONE fix at ${when}: comment added`);
  // The list says the fix's mark; the map draws the label and a dot in the fix's colour.
  assert.match(await side.locator(".fix-list li.selected .detail").innerText(), /coloured yellow · labelled 'Turn 1' · Wheel over for the second leg/);
  await mapFrame.locator(".fix-label", { hasText: "Turn 1" }).last().waitFor(); // the label drawn before fades out
  assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0, "the long fix list scrolls in its panel, not the page");
  const dot = mapFrame.locator('path.fix-mark[fill="#ffd700"]');
  await dot.waitFor();
  // The comment is in the Timeline, at its fix's time.
  const comment = await timelineRow(page, "Wheel over for the second leg", "fix_comment");
  assert.equal(await comment.locator(".tl-source").innerText(), "RED ONE");
  // Pointing at the fix shows its comment.
  const at = await dot.boundingBox();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await mapFrame.locator(".fix-tooltip", { hasText: "Comment: Wheel over for the second leg" }).waitFor();
  await page.waitForFunction(() => !document.querySelector("#toasts .toast"), null, { timeout: 15000 }); // the notices gone: the pictures are for the post
  await shot("clean-03-marked-fix");
  // A right-click on a fix on the map chooses it in the list.
  await side.locator(".side-bar button", { hasText: "Close" }).click();
  // The map widens as the panel closes, and the fix moves with it: right-click where it is once it stays put.
  const settledDot = async () => {
    let here = await dot.boundingBox();
    for (let settled = 0; settled < 3; ) {
      await page.waitForTimeout(150);
      const now = await dot.boundingBox();
      settled = now && here && Math.abs(now.x - here.x) < 0.5 && Math.abs(now.y - here.y) < 0.5 ? settled + 1 : 0;
      here = now;
    }
    return here;
  };
  let here = await settledDot();
  await page.mouse.click(here.x + here.width / 2, here.y + here.height / 2, { button: "right" });
  await side.locator(".fix-list li.selected", { hasText: when }).waitFor();
  // From the keyboard: Down moves along the list, Enter chooses.
  await side.locator(".fix-list li.selected").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction((w) => document.querySelector("#side-frame .fix-list li.selected .name")?.textContent !== w, when);
  await side.locator(".side-bar button", { hasText: "Close" }).click();
  // On a touch screen, with no right button: pressing and holding the fix chooses it, as a
  // right-click does. A tap is not a hold, nor is a finger that moves (a pan).
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y]) => ({ x, y, radiusX: 4, radiusY: 4, force: 1 })) });
  const sidePanel = () => page.evaluate(() => !document.getElementById("side-frame")?.hidden && !!document.querySelector("#side-frame .fix-list"));
  here = await settledDot();
  let [x, y] = [here.x + here.width / 2, here.y + here.height / 2];
  n = await steps();
  await touch("touchStart", [[x, y]]);
  await page.waitForTimeout(150);
  await touch("touchEnd", []);
  await page.waitForTimeout(1200);
  assert.equal(await sidePanel(), false, "a tap on a fix does not open the fix list");
  await touch("touchStart", [[x, y]]);
  for (let i = 1; i <= 5; i++) {
    await touch("touchMove", [[x + 6 * i, y]]);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(900);
  await touch("touchEnd", []);
  await page.waitForTimeout(1200);
  assert.equal(await sidePanel(), false, "a finger held after moving is a pan, not a hold");
  here = await settledDot(); // the map may have moved with the finger
  [x, y] = [here.x + here.width / 2, here.y + here.height / 2];
  await touch("touchStart", [[x, y]]);
  await side.locator(".fix-list li.selected", { hasText: when }).waitFor({ timeout: 5000 }); // while the finger is still down
  await touch("touchEnd", []);
  await page.waitForTimeout(500);
  assert.equal(await side.locator(".fix-list li.selected", { hasText: when }).count(), 1);
  assert.equal(await steps(), n, "choosing a fix changes nothing");
  await side.locator(".side-bar button", { hasText: "Close" }).click();
  // Undo three times: the comment, the label and the colour go, one step each.
  const undone = () => page.evaluate(() => (document.getElementById("history")?.textContent?.match(/undone/g) ?? []).length);
  for (let i = 1; i <= 3; i++) {
    await page.locator("#undo").click();
    await page.waitForFunction((c) => (document.getElementById("history")?.textContent?.match(/undone/g) ?? []).length === c, i);
  }
  await mapFrame.locator(".fix-label").waitFor({ state: "detached" });
  await searchTimeline(page, "Wheel over for the second leg");
  assert.equal(await page.locator('#timeline .tl-row[data-kind="fix_comment"]').count(), 0);
  await searchTimeline(page, "");
  for (let i = 2; i >= 0; i--) {
    await page.locator("#redo").click();
    await page.waitForFunction((c) => (document.getElementById("history")?.textContent?.match(/undone/g) ?? []).length === c, i);
  }
  assert.equal(await undone(), 0);
  await mapFrame.locator(".fix-label", { hasText: "Turn 1" }).last().waitFor();
}
