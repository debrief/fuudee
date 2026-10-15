// Labels, symbols and arrows at intervals in the playground (CAP-32), played as a reader would:
// BLUE ONE and RED ONE selected together; Frequencies… sets labels every 10 min and arrows
// every 5 min as one step for both, named for what it did; the map labels the times on the
// :00, :10, :20 to port of each track and draws the arrows on the line; zoomed out, it thins
// them and says so. Tracks set apart then show Mixed, left as they are unless changed; an
// interval typed ("90 s", "1h30") says what it means, or what is wrong. Undo takes a change
// back. A single fix always showing its time label and symbol (force on only, product
// owner, 15 Oct 2026), from the fix list. The form fits a phone, and down to 210 px.
import assert from "node:assert/strict";

export async function playFrequencies(page, shot) {
  const mapFrame = page.frameLocator(".frame-map");
  const steps = () => page.locator("#history li").count();
  const latest = () => page.locator("#history li").first().locator(".name").innerText();
  const stepAdded = (count) => page.waitForFunction((c) => document.querySelectorAll("#history li").length > c, count, { timeout: 60000 });
  const dialog = page.locator("dialog.freq-form");
  const labels = () => mapFrame.locator(".fix-time-text").allInnerTexts();
  const row = (id) => page.locator(`#outline li[data-id="${id}"]`);
  const chooser = (field) => page.locator(`#freq-${field}`);
  /** Out (positive) or in (negative) by whole zoom levels, with the map's own buttons (half a level a press). */
  const zoomBy = async (levels) => {
    const button = mapFrame.locator(levels > 0 ? ".leaflet-control-zoom-out" : ".leaflet-control-zoom-in");
    for (let i = 0; i < Math.abs(levels) * 2; i++) {
      await button.click();
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(600);
    await page.mouse.move(2, 2);
  };

  // The sample, the whole of it in the window; BLUE ONE and RED ONE selected, as the map's Ctrl-click or the outline's.
  await page.selectOption("#plots", "serial-1");
  await page.waitForFunction(() => document.querySelector("#outline li[data-id='track-blue-one']"));
  await page.locator("#timebar .tc-start").focus();
  await page.keyboard.press("Home");
  await page.locator("#timebar .tc-end").focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(500);
  await row("track-blue-one").click();
  await row("track-red-one").click({ modifiers: ["Control"] });
  await mapFrame.getByRole("button", { name: "Zoom to the selection" }).click();
  await page.waitForTimeout(600);
  assert.equal((await labels()).length, 0, "no time labels by default");
  const ticksBefore = await mapFrame.locator(".tick").count();
  // Before, with nothing selected, so the picture shows the tracks as the reader sees them.
  await mapFrame.locator("#map").focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#outline li.selected"));
  await page.mouse.move(2, 2);
  await shot("freq-01-before");
  await row("track-blue-one").click();
  await row("track-red-one").click({ modifiers: ["Control"] });

  // Frequencies…: what the two have now (labels and symbols off, arrows the default), then labels
  // every 10 min and arrows every 5 min, as one step for both.
  let n = await steps();
  await page.locator("#track-frequencies").click();
  await dialog.waitFor();
  assert.equal(await dialog.locator("h2").innerText(), "Labels, symbols and arrows");
  assert.equal(await dialog.locator(".freq-tracks").innerText(), "BLUE ONE, RED ONE");
  assert.equal(await chooser("label_interval").inputValue(), "off");
  assert.equal(await chooser("symbol_interval").inputValue(), "off");
  assert.equal(await chooser("arrow_interval").inputValue(), "default");
  await chooser("label_interval").selectOption({ label: "Every 10 min" });
  await chooser("arrow_interval").selectOption({ label: "Every 5 min" });
  await shot("freq-02-form");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await stepAdded(n);
  assert.equal(await steps(), n + 1, "one step for both tracks");
  assert.equal(await latest(), "Labels every 10 min, arrows every 5 min on BLUE ONE and RED ONE");
  // On the map: times on the clock's tens, to port of each track, and more arrows than the default few.
  await mapFrame.locator(".fix-time-text").first().waitFor();
  const shown = await labels();
  assert.ok(shown.length >= 8, `labels drawn: ${shown.length}`);
  for (const label of shown) assert.match(label, /^(\d\d)?\d\d[0-5]0$/, `${label} is on a whole ten minutes`);
  assert.ok(shown.some((l) => /^15\d{4}$/.test(l)), "the first label of the day carries the day");
  assert.ok((await mapFrame.locator(".tick").count()) > ticksBefore, "arrows every 5 min");
  // Held per track, and said in the outline: the intervals set, and all three when pointed at.
  assert.equal(await row("track-blue-one").locator(".freq-detail").innerText(), "Labels every 10 min · Arrows every 5 min");
  assert.match(await row("track-red-one").getAttribute("title"), /Labels every 10 min · Symbols default · Arrows every 5 min$/);
  // The selection's outline and handles off the picture.
  await mapFrame.locator("#map").focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#outline li.selected"));
  await page.mouse.move(2, 2);
  await shot("freq-03-after");

  // Zoomed right out: thinned to round times, and the map says so; zoomed back in, every one again.
  await zoomBy(3);
  const note = mapFrame.locator(".thin-note");
  await note.waitFor({ state: "visible" });
  assert.match(await note.innerText(), /^Labels every \d+ (h|min)( or more)?(, arrows every [^;]+)? at this zoom; zoom in for more$/);
  assert.ok((await labels()).length <= 2 * 100, "never more than the cap per track");
  await shot("freq-04-thinned");
  // Closer, a level at a time, until every one is drawn and the note goes (how close depends on the tracks' speeds on screen).
  await zoomBy(-3);
  for (let level = 0; level < 6 && (await note.isVisible()); level++) await zoomBy(-1);
  await note.waitFor({ state: "hidden" });
  assert.ok((await labels()).length >= 1, "the labels in view drawn");

  // Set apart: BLUE ONE's labels every 30 min. Together again, labels show Mixed and are left alone;
  // symbols typed: "10" says what is missing, "90 s" what it means; then 1h30.
  await row("track-blue-one").click();
  n = await steps();
  await page.locator("#track-frequencies").click();
  await dialog.waitFor();
  await chooser("label_interval").selectOption({ label: "Every 30 min" });
  await dialog.getByRole("button", { name: "Apply" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "Labels every 30 min on BLUE ONE");
  await row("track-red-one").click({ modifiers: ["Control"] });
  n = await steps();
  await page.locator("#track-frequencies").click();
  await dialog.waitFor();
  assert.equal(await chooser("label_interval").inputValue(), "mixed");
  assert.equal(await chooser("label_interval").locator("option:checked").innerText(), "Mixed (unchanged)");
  assert.equal(await chooser("arrow_interval").inputValue(), "300");
  await chooser("symbol_interval").selectOption("other");
  const typed = page.locator("#freq-symbol_interval-other");
  const said = page.locator("#freq-symbol_interval-note");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "freq-symbol_interval-other");
  await typed.fill("10");
  await said.getByText("Say the unit, such as 30 s, 10 min or 1 h 30 min.").waitFor();
  await dialog.getByRole("button", { name: "Apply" }).click();
  assert.equal(await dialog.isVisible(), true, "not sent while the interval is wrong");
  await typed.fill("90 s");
  await said.getByText("Means every 1 min 30 s").waitFor();
  await typed.fill("1h30");
  await said.getByText("Means every 1 h 30 min").waitFor();
  await page.mouse.move(2, 2);
  await shot("freq-05-mixed-and-typed");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await stepAdded(n);
  assert.equal(await latest(), "Symbols every 1 h 30 min on BLUE ONE and RED ONE");
  assert.equal(await row("track-blue-one").locator(".freq-detail").innerText(), "Labels every 30 min · Symbols every 1 h 30 min · Arrows every 5 min");
  assert.equal(await row("track-red-one").locator(".freq-detail").innerText(), "Labels every 10 min · Symbols every 1 h 30 min · Arrows every 5 min");
  await mapFrame.locator("path.fix-symbol").first().waitFor({ state: "attached" }); // drawn near the view, perhaps just outside it

  // Undo takes the last change back, for both tracks at once.
  await page.locator("#undo").click();
  await page.waitForFunction(() => /Symbols every 1 h 30 min[^]*undone/.test(document.getElementById("history")?.textContent ?? ""));
  await mapFrame.locator("path.fix-symbol").first().waitFor({ state: "detached" });
  assert.equal(await row("track-red-one").locator(".freq-detail").innerText(), "Labels every 10 min · Arrows every 5 min");

  // One fix of RED ONE always shows its time label and its symbol, whatever the intervals (force on only).
  await row("track-red-one").click();
  await mapFrame.getByRole("button", { name: "Zoom to the selection" }).click();
  await page.waitForTimeout(600);
  await page.locator("#fix-list").click();
  const fix = page.locator(".fix-list li").nth(13); // 08:13: no label of the track's falls there
  await fix.scrollIntoViewIfNeeded();
  await fix.click();
  n = await steps();
  const forceLabel = page.locator(".fix-actions button", { hasText: "Time label" });
  assert.equal(await forceLabel.getAttribute("aria-pressed"), "false");
  await forceLabel.click();
  await stepAdded(n);
  assert.match(await latest(), /^RED ONE fix at 08:13:00Z: time label always shown$/);
  n = await steps();
  await page.locator(".fix-actions button", { hasText: "Symbol" }).click();
  await stepAdded(n);
  assert.match(await latest(), /symbol always shown$/);
  assert.equal(await page.locator(".fix-actions button", { hasText: "Symbol" }).getAttribute("aria-pressed"), "true");
  assert.match(await page.locator(".fix-list li").nth(13).innerText(), /time label always shown · symbol always shown/);
  // Forced ones are deliberate: never thinned away when zoomed out.
  await page.locator(".side-bar button", { hasText: "Close" }).click();
  await mapFrame.getByRole("button", { name: "Zoom to the selection" }).click();
  await page.waitForTimeout(600);
  await mapFrame.locator(".fix-time-text", { hasText: /^0813$/ }).waitFor();
  await zoomBy(3);
  await mapFrame.locator(".fix-time-text", { hasText: /^0813$/ }).waitFor();
  await zoomBy(-3);

  // On a phone, and down to 210 px: the form fits and never scrolls sideways.
  for (const width of [390, 280, 210]) {
    await page.setViewportSize({ width, height: 844 });
    await row("track-blue-one").click();
    await row("track-red-one").click({ modifiers: ["Control"] });
    await page.locator("#track-frequencies").scrollIntoViewIfNeeded();
    await page.locator("#track-frequencies").click();
    await dialog.waitFor();
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, `the form fits ${width} px: ${Math.round(box.x)} + ${Math.round(box.width)}`);
    assert.equal(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth), true, `no sideways scroll at ${width} px`);
    for (const field of ["label_interval", "symbol_interval", "arrow_interval"]) {
      const select = await chooser(field).boundingBox();
      assert.ok(select.x + select.width <= box.x + box.width, `${field} inside the form at ${width} px`);
    }
    if (width === 390) await shot("freq-06-phone-form");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "detached" });
  }
  await page.setViewportSize({ width: 1400, height: 820 });

  // Back as it was, so what follows starts the same: the fix's marks, then the intervals, undone.
  for (let i = 0; i < 4; i++) {
    await page.locator("#undo").click();
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => !document.querySelector("#outline .freq-detail"), null, { timeout: 30000 });
}
