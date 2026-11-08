// The geodesic demo (play.mjs plays it): drag B and the two answers change; the arrow keys move a pin too.
import assert from "node:assert/strict";

/** The geodesic demo, a page of its own; no Python. */
export async function playGeodesic(ctx) {
  const { page, BASE, shot, text } = ctx;
  // The geodesic demo: drag B and the two answers change; the arrow keys move a pin too.
  await page.goto(`${BASE}/geodesic.html`);
  const start = await text("#diff-range");
  const pinB = page.locator(".pin").nth(1);
  const box = await pinB.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 12, y + i * 8); // a hand's drag, not a jump
  await page.mouse.up();
  const dragged = await text("#diff-range");
  assert.notEqual(dragged, start);
  assert.match(await text("#v4-range"), /nmi/);
  await page.locator(".pin").first().focus();
  const a = await text("#a");
  await page.keyboard.press("ArrowUp");
  assert.notEqual(await text("#a"), a);
  await shot("play-09-geodesic");
}

export const plays = [{ name: "geodesic", start: "blank", cost: 2, play: playGeodesic }];
