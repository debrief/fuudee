// Demos started from blog posts in the built site, as a reader would (play.mjs plays them with a built site).
import assert from "node:assert/strict";
import { fromMenu, fromToolbar } from "./menus.mjs";
import { stickyHeadings } from "./tote.mjs";

/** Each post's demo started from its button, one at a time, and what the post describes shown. */
export async function playFromThePost(ctx) {
  const { browser, errors, site, shot, serve } = ctx;
  const siteServer = serve(site);
  const post = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  post.on("pageerror", (e) => errors.push(String(e)));
  await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/11/nothing-lost/`);
  const demos = post.locator(".debrief-demo");
  await demos.first().getByRole("button", { name: "Start the demo" }).click();
  const frame = post.frameLocator(".debrief-demo-frame");
  await frame.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
  await demos.first().scrollIntoViewIfNeeded();
  await shot("play-11-in-the-post", post);
  // Only one demo runs at a time: starting the import demo puts the first back to its button.
  await demos.nth(1).getByRole("button", { name: "Start the demo" }).click();
  assert.equal(await post.locator(".debrief-demo-frame").count(), 1);
  await demos.first().getByRole("button", { name: "Start the demo" }).waitFor();
  assert.equal(await demos.nth(1).locator(".debrief-demo-frame").count(), 1);
  // The annotations post's demo: the Timeline and History beside the map, and the form works.
  await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/13/annotations/`);
  await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
  const annotated = post.frameLocator(".debrief-demo-frame");
  await annotated.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
  await annotated.locator("#timeline .tl-row[data-id]").first().waitFor();
  assert.ok((await annotated.locator("#timeline .tl-row[data-id]").count()) > 3, "the Timeline lists the sample's narrative");
  assert.equal(await annotated.locator("#panel-tools").isHidden(), true);
  await fromToolbar(annotated, "Add annotation…");
  await annotated.frameLocator(".frame-annotation").getByRole("button", { name: "Add" }).waitFor();
  await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
  await shot("annot-06-in-the-post", post);
  // The drawing post's demo: the map's toolbar draws, and the form opens to name it.
  await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/13/drawing-on-the-map/`);
  await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
  const drawn = post.frameLocator(".debrief-demo-frame");
  await drawn.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
  const demoMap = drawn.frameLocator(".frame-map");
  await demoMap.getByRole("toolbar", { name: "Draw an annotation" }).getByRole("button", { name: "Circle", exact: true }).click();
  await demoMap.locator("#map.drawing-mode").waitFor();
  const mapBox = await demoMap.locator("#map").boundingBox();
  await post.mouse.click(mapBox.x + mapBox.width * 0.5, mapBox.y + mapBox.height * 0.5);
  await post.mouse.click(mapBox.x + mapBox.width * 0.6, mapBox.y + mapBox.height * 0.5);
  const named = drawn.frameLocator(".frame-annotation").locator("#field-radius input");
  await named.waitFor();
  assert.notEqual(await named.inputValue(), "");
  await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
  await shot("draw-07-in-the-post", post);
  // The tracks post's demo: select a track, and its move and rotate handles appear.
  await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/14/moving-and-splitting-tracks/`);
  await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
  const moving = post.frameLocator(".debrief-demo-frame");
  await moving.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
  await moving.locator(`#outline li[data-id="track-blue-one"]`).click();
  await moving.frameLocator(".frame-map").locator(".track-handle-rotate").waitFor();
  await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
  await shot("tracks-09-in-the-post", post);
  // The shear post's demo: select a track, and its ends appear, to shear.
  await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/14/shear-and-stretch/`);
  await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
  const shearing = post.frameLocator(".debrief-demo-frame");
  await shearing.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
  await shearing.locator(`#outline li[data-id="track-red-one"]`).click();
  await shearing.frameLocator(".frame-map").locator(".track-handle-end").waitFor();
  await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
  await shot("shear-07-in-the-post", post);
  // The cleaning post's demo: glitches put into RED ONE, and Jumps… finds and rings them.
  await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/14/cleaning-tracks/`);
  await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
  const cleaning = post.frameLocator(".debrief-demo-frame");
  await cleaning.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
  await cleaning.locator(`#outline li[data-id="track-red-one"]`).click();
  await cleaning.locator("#open-try").click(); // Try, a menu in the top bar
  await cleaning.locator("#glitches").click();
  await cleaning.locator("#history li", { hasText: "GPS glitches put into RED ONE" }).waitFor();
  await fromMenu(cleaning, "track-red-one", "Find and remove jumps…");
  await cleaning.getByRole("button", { name: "Find" }).click();
  await cleaning.frameLocator(".frame-map").locator("path.fix-check").nth(2).waitFor();
  await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
  await shot("clean-05-in-the-post", post);
  // The single-fix post's demo: select a track, and its handles appear; the fix list offers Move….
  await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/15/dragging-a-fix/`);
  await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
  const fixing = post.frameLocator(".debrief-demo-frame");
  await fixing.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
  await fixing.locator(`#outline li[data-id="track-red-one"]`).click();
  await fixing.frameLocator(".frame-map").locator(".track-handle-end").waitFor();
  await fromMenu(fixing, "track-red-one", "Fixes: colour, label or comment…");
  await fixing.locator("#move-fix").waitFor();
  await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
  await shot("fixdrag-06-in-the-post", post);
  // The Tote post's demo: the Tote under the time controller; a primary and a secondary give values.
  await post.goto(`http://127.0.0.1:${siteServer.address().port}/blog/2026/10/16/the-tote/`);
  await post.locator(".debrief-demo").first().getByRole("button", { name: "Start the demo" }).click();
  const toting = post.frameLocator(".debrief-demo-frame");
  await toting.locator("#status", { hasText: "Ready" }).waitFor({ timeout: 240000 });
  assert.equal(await toting.locator("#panel-tote").isVisible(), true);
  await toting.locator("#tote .tote-primary").selectOption({ label: "BLUE ONE" });
  await toting.locator("#tote .tote-add").selectOption({ label: "RED ONE" });
  await toting.locator('#tote td[data-track="track-red-one"][data-measure="range"]', { hasText: /^(\d+\.\d\d|\d+ yd)$/ }).waitFor();
  // The demo's side column is narrow: the demo's page never scrolls sideways; where the
  // tracks need more room, they scroll inside the table under row headings that stay put.
  assert.ok(await toting.locator("html").evaluate((e) => e.scrollWidth <= e.clientWidth), "the demo's page does not scroll sideways");
  assert.ok(await toting.locator("#panel-tote").evaluate((e) => e.scrollWidth <= e.clientWidth), "the Tote does not widen the demo's side column");
  const scroll = toting.locator("#tote .tote-scroll");
  if (await scroll.evaluate((e) => e.scrollWidth > e.clientWidth)) await stickyHeadings(scroll, "in the post's demo");
  await post.locator(".debrief-demo").first().scrollIntoViewIfNeeded();
  await shot("tote-06-in-the-post", post);
  siteServer.close();
}

export const plays = [{ name: "from-the-post", start: "blank", site: true, cost: 69, play: playFromThePost }];
