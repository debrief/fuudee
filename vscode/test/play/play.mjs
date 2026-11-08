// Plays the blog's playground in Chromium as a reader would: Python starts in
// the page, tools run, undo replays, a crash mid-save is recovered, a file is
// imported. Screenshots go to $DEBRIEF_SCREENSHOTS: one of every step, or with
// DEBRIEF_SCREENSHOTS_ON=failure only the page as it failed.
// Usage: node test/play/play.mjs <built playground folder> [built site folder]
// With a built site, it also starts demos from blog posts, as a reader would.
//
// The plays are the `plays` each module here exports (shards.mjs says how): each unit, a play that
// starts and those after it, on a fresh page with Python started anew. Which units play:
//   DEBRIEF_PLAY=basics,tma        the units holding these plays (`node test/play/shards.mjs` lists them)
//   DEBRIEF_PLAY_PART=2            part 2 of the parts CI plays side by side (DEBRIEF_PLAY_PARTS of them,
//                                  by default as many as shards.mjs makes; part numbers move as plays are added)
//   neither                        every unit, one after another
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openOnFirstLoad } from "./onboarding.mjs";
import { mapPlaced, showPanel } from "./dock.mjs";
import { discover, partsFor, shareOut, unitsOf } from "./shards.mjs";

// The plays, and which this run plays, settled before anything starts.
const units = unitsOf(await discover());
/** What this run plays, and how it was chosen. */
const { chosen, said } = (() => {
  const only = process.env.DEBRIEF_PLAY?.split(",").map((s) => s.trim()).filter(Boolean);
  if (only?.length) {
    const unknown = only.filter((name) => !units.some((u) => u.plays.some((p) => p.name === name)));
    assert.deepEqual(unknown, [], `DEBRIEF_PLAY names plays no module has; there are ${units.flatMap((u) => u.plays.map((p) => p.name)).join(", ")}`);
    return { chosen: units.filter((u) => u.plays.some((p) => only.includes(p.name))), said: `DEBRIEF_PLAY=${only.join(",")}` };
  }
  if (!process.env.DEBRIEF_PLAY_PART) return { chosen: units, said: "every play" };
  const of = process.env.DEBRIEF_PLAY_PARTS ? Number(process.env.DEBRIEF_PLAY_PARTS) : partsFor(units);
  const part = Number(process.env.DEBRIEF_PLAY_PART);
  assert.ok(Number.isInteger(of) && of >= 1, `DEBRIEF_PLAY_PARTS is a whole number, not ${process.env.DEBRIEF_PLAY_PARTS}`);
  assert.ok(Number.isInteger(part) && part >= 1 && part <= of, `DEBRIEF_PLAY_PART is 1 to ${of}, not ${process.env.DEBRIEF_PLAY_PART}`);
  return { chosen: shareOut(units, of)[part - 1].units, said: `part ${part} of ${of}` };
})();

const root = path.resolve(process.argv[2] ?? "../site/docs/play");
const site = process.argv[3] ? path.resolve(process.argv[3]) : undefined;
const screenshots = process.env.DEBRIEF_SCREENSHOTS;
const shots = process.env.DEBRIEF_SCREENSHOTS_ON === "failure" ? undefined : screenshots;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".py": "text/plain", ".whl": "application/octet-stream", ".geojson": "application/json", ".svg": "image/svg+xml" };
function serve(folder) {
  return createServer(async (req, res) => {
    let file = path.join(folder, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (file.endsWith(path.sep) || file.endsWith("/")) file = path.join(file, "index.html");
    if (!file.startsWith(folder) || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
  }).listen(0);
}
const server = serve(root);
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}`;

// Behind an HTTPS proxy (as in some CI and sandboxes), the CDN goes through it; this server never does.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: proxy ? [`--proxy-server=https=${new URL(proxy).host}`, "--proxy-bypass-list=<-loopback>"] : [],
});
const errors = [];
let page;
async function freshPage() {
  await page?.context().close();
  page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  // Every page under its Content-Security-Policy (product owner, 17 Oct 2026): anything it refuses is a failure.
  page.on("console", (m) => /Content Security Policy|Refused to (load|connect|execute|apply|create|frame)/.test(m.text()) && errors.push(`refused by the page's policy: ${m.text()}`));
  // Every message from a component is checked, as VS Code checks it (PAR-13): one refused is a failure.
  page.on("console", (m) => m.text().startsWith("webview_message_refused") && errors.push(m.text()));
}
const shot = async (name, on = page) => shots && (await on.waitForTimeout(800), await on.screenshot({ path: path.join(shots, `${name}.png`) }));
const text = (selector) => page.locator(selector).innerText();
const timeLabel = () => text("#timebar .time-label");
const selected = () => page.$$eval("#outline li.selected .name", (rows) => rows.map((r) => r.textContent));
// Its text whether or not History's tab is in front (innerText is empty for what is hidden).
const history = () => page.locator("#history").textContent();
const ready = (on = page) => on.waitForFunction(() => document.getElementById("status")?.textContent?.startsWith("Ready"), null, { timeout: 240000 });

/**
 * The walkthroughs start open in the playground, as everywhere (product owner, 22 Oct 2026,
 * superseding 17 Oct's folded here): docked, alone on the right (product owner, 23 Oct 2026).
 * This reader wants the map as wide and tall as can be, with Tools and History both in sight
 * while working: from each tab's menu, by the keyboard, Tools and History each get a group of their
 * own (they share the Tote's, product owner, 24 Oct 2026), the walkthroughs join Tools on the left, the Timeline joins them and Coverage and Bearings the Tote; the right
 * column and the strip under the map go, and the map takes their place. The layout is remembered
 * in this browser; onboarding.mjs resets it.
 */
async function arrange() {
  await openOnFirstLoad(page, "the playground");
  const moveByMenu = async (id, item) => {
    await page.locator(`.dv-tab[data-panel="${id}"]`).focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menuitem", { name: item, exact: true }).click();
    await page.waitForFunction((tab) => document.activeElement?.dataset?.panel === tab, id);
  };
  const mapAtFirst = await page.locator("#main").boundingBox();
  await moveByMenu("panel-tools", "Move to a group of its own");
  await moveByMenu("panel-history", "Move to a group of its own");
  await moveByMenu("panel-tour", "Move to left: Tools");
  await moveByMenu("panel-timeline", "Move to left: Tools, Walkthroughs");
  await moveByMenu("panel-coverage", "Move to left: Tote");
  await moveByMenu("panel-bearings", "Move to left: Tote, Coverage");
  for (const id of ["tools", "outline", "tote"]) await showPanel(page, id);
  assert.ok((await page.evaluate(() => window.debriefLayout().groups)).every((g) => g.place === "left" || g.panels.includes("map")), "every panel on the left");
  await mapPlaced(page);
  const mapNow = await page.locator("#main").boundingBox();
  assert.ok(mapNow.width > mapAtFirst.width + 250, `the map takes the right-hand column's place: ${mapAtFirst.width} to ${mapNow.width}`);
  assert.ok(mapNow.height > mapAtFirst.height + 120, `and the strip's under it: ${mapAtFirst.height} to ${mapNow.height}`);
  assert.equal(await page.locator("#history").isVisible(), true);
  assert.equal(await page.locator("#tools").isVisible(), true);
}

/** What a play is given: the browser, the servers, its unit's page (ctx.page) and the helpers on that page. */
const ctx = { browser, errors, BASE, root, site, shots, serve, shot, text, timeLabel, selected, history, ready, arrange };
const played = [];
const skipped = [];
let unit;
try {
  for (unit of chosen) {
    if (unit.site && !site) {
      skipped.push(unit.name);
      continue;
    }
    const started = Date.now();
    await freshPage();
    if (unit.start !== "blank") {
      await page.goto(`${BASE}/index.html`);
      await ready();
      if (unit.start === "arranged") await arrange();
    }
    ctx.page = page;
    const times = [];
    for (const play of unit.plays) {
      const at = Date.now();
      await play.play(ctx);
      times.push(`${play.name} ${Math.round((Date.now() - at) / 1000)} s`);
    }
    played.push(`${unit.name}: ${times.join(", ")} (${Math.round((Date.now() - started) / 1000)} s with its start)`);
  }
  assert.deepEqual(errors, []);
  console.log(`Playground played (${said}):\n  ${played.join("\n  ")}${skipped.length ? `\nNot played, with no built site: ${skipped.join(", ")}.` : ""}`);
} catch (error) {
  if (screenshots && page) await page.screenshot({ path: path.join(screenshots, `play-failed-${unit?.name ?? "start"}.png`) });
  const status = await page?.locator("#status").innerText({ timeout: 1000 }).catch(() => "-");
  console.error("unit:", unit?.name, "| status:", status, "| page:", page?.url());
  // What the pages reported before the failure (refused messages, page errors): a timeout says
  // only what it waited for, and a message a page refused is often why it never came.
  if (errors.length) console.error(`collected before the failure (${errors.length}):\n  ${errors.join("\n  ")}`);
  throw error;
} finally {
  await browser.close();
  server.close();
}
