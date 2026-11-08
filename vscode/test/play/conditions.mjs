// The playground under other conditions (play.mjs plays them), each on pages of its own: context tracks
// on a dark theme before Python starts; Python's CDN blocked, or its WebAssembly refused by a proxy.
import assert from "node:assert/strict";

/** Context tracks on a dark theme: visible, as the map draws them before Python starts. */
export async function contextOnDark(ctx) {
  const { browser, errors, BASE, shot } = ctx;
  const dark = await browser.newPage({ viewport: { width: 1400, height: 820 }, colorScheme: "dark" });
  dark.on("pageerror", (e) => errors.push(String(e)));
  await dark.goto(`${BASE}/index.html`);
  const map = dark.frameLocator(".frame-map");
  await map.locator(".track-label").first().waitFor({ timeout: 60000 });
  await dark.locator("#timebar .tc-start").focus();
  for (const key of ["PageUp", "PageUp", "PageUp"]) await dark.keyboard.press(key); // shown, not saved before Python
  const visible = () => map.locator('path[stroke-width="1.5"][stroke-opacity="0.6"]').count();
  for (let i = 0; i < 30 && (await visible()) < 10; i++) await dark.waitForTimeout(100);
  assert.ok((await visible()) >= 10, "visible context tracks on a dark theme");
  await shot("context-02-visible-dark", dark);
  await dark.close();
}

/** With the CDN blocked, the page says so plainly; the map still works. */
export async function cdnBlocked(ctx) {
  const { browser, BASE, shot } = ctx;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route(/cdn\.jsdelivr\.net/, (route) => route.abort("blockedbyclient"));
  const blocked = await context.newPage();
  await blocked.goto(`${BASE}/index.html`);
  await blocked.locator("#status", { hasText: "cdn.jsdelivr.net" }).waitFor({ timeout: 60000 });
  assert.match(await blocked.locator("#status").innerText(), /^Python couldn't be downloaded: cdn\.jsdelivr\.net could not be reached; your network may block it\. The map still works; tools, history and import need Python\. Try again$/);
  assert.equal(await blocked.locator("#status").getByRole("button", { name: "Try again" }).count(), 1);
  // Tools and History say why, as VS Code's do when the tool service could not start (§5).
  assert.match(await blocked.locator("#tools").textContent(), /^Python couldn't be downloaded: cdn\.jsdelivr\.net could not be reached/);
  // Once the sample shows (Python may fail first), History says what VS Code's does with no tool service.
  await blocked.locator("#history", { hasText: "History needs the tool service." }).waitFor({ state: "attached", timeout: 30000 }); // its tab may be behind another
  assert.equal(await blocked.locator("#crash").isDisabled(), true);
  await blocked.locator(`#outline li[data-id="track-blue-one"]`).click();
  assert.equal(await blocked.locator("#outline li.selected .name").innerText(), "BLUE ONE");
  await shot("play-10-cdn-blocked", blocked);
  await context.close();
  // A proxy that lets the CDN through but refuses Python's WebAssembly, as some organisations' do: the file and the answer named.
  const filtering = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await filtering.route(/pyodide\.asm\.wasm/, (route) => route.fulfill({ status: 403, body: "Blocked by policy" }));
  const filtered = await filtering.newPage();
  await filtered.goto(`${BASE}/index.html`);
  await filtered.locator("#status", { hasText: "answered" }).waitFor({ timeout: 120000 });
  assert.match(await filtered.locator("#status").innerText(), /^Python couldn't be downloaded: cdn\.jsdelivr\.net answered 403 for pyodide\.asm\.wasm; your network may block it\. The map still works/);
  await filtering.close();
}

export const plays = [
  { name: "context-on-dark", start: "blank", cost: 5, play: contextOnDark },
  { name: "cdn-blocked", start: "blank", cost: 5, play: cdnBlocked },
];
