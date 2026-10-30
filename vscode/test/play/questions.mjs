// The shared flows' questions as the playground asks them (PAR-10, docs/panel-parity-srd.md): a
// confirmation or a pick in the dialog (#ask), each choice a button in the flow's order, its default
// focused; several choices, a line of text, where to save a file in small forms (dialog.track-form);
// a file to read in its own dialog (#pick-file). The same questions, in the same order, as VS Code's
// QuickPicks ask them, answered here as a reader would.
import { readFileSync } from "node:fs";
import { showPanel } from "./dock.mjs";

/** The dialog asking now. */
export const asking = (page) => page.locator("dialog#ask[open]");
/** A small form asking now, by its title. */
export const form = (page, title) => page.locator("dialog.track-form[open]", { has: page.locator("h2", { hasText: title }) });
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Answer the dialog's question with the choice whose label this is (its description and detail beneath). */
export async function choose(page, label, timeout = 60000) {
  const dialog = asking(page);
  await dialog.waitFor({ timeout });
  await dialog.locator("#ask-buttons > button").filter({ hasText: new RegExp(`^${escape(label)}`) }).first().click();
}

/** The file to read, chosen in the dialog a flow opened for it. */
export async function upload(page, file) {
  await page.locator("dialog.pick-file[open] #pick-file").setInputFiles(file, { timeout: 60000 });
}

/** Answer every question a flow asks with what Enter would take (the default, or OK), until none is asked. */
export async function acceptAll(page, quiet = 4000) {
  for (;;) {
    const open = page.locator("dialog#ask[open], dialog.track-form[open]").first();
    if (!(await open.waitFor({ timeout: quiet }).then(() => true, () => false))) return;
    const handle = await open.elementHandle();
    await open.locator("button.primary").first().click();
    await page.waitForFunction((d) => !d.open, handle, { timeout: 10000 });
  }
}

/**
 * Export the map as VS Code asks it, in three steps (started: already asked, by a button elsewhere): the size, what it shows (the ID in a corner,
 * light colours), and the file's name and kind; then the download and what was said of it. during,
 * if given, runs while the map draws it.
 */
export async function exportMap(page, { size = "Slide, 1600 × 900", footer = true, light = false, format = "png", started = false } = {}, during) {
  // From the top bar's Export menu, unless something (a walkthrough's button, the map's title bar) started it.
  if (!started) {
    await showPanel(page, "export");
    await page.locator("#export-image").click();
  }
  await choose(page, size);
  const shows = form(page, "Export image (2 of 3): what it shows");
  await shows.waitFor();
  await shows.getByRole("checkbox", { name: /^Image ID in a corner/ }).setChecked(footer);
  await shows.getByRole("checkbox", { name: /^Light colours, for print/ }).setChecked(light);
  await shows.getByRole("button", { name: "OK" }).click();
  const where = form(page, "Export image (3 of 3): where to save it, as PNG or SVG");
  await where.waitFor();
  await where.locator("#track-form-type").selectOption(format);
  // What earlier exports said, put away, so what is read is this one's.
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  const startedAt = Date.now();
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), (async () => (await where.getByRole("button", { name: "Export" }).click(), await during?.()))()]);
  const toast = page.locator(".toast", { hasText: /^Exported / }).last();
  await toast.waitFor({ timeout: 30000 });
  return { data: readFileSync(await download.path()), name: download.suggestedFilename(), said: await toast.locator("span").first().innerText(), toast, ms: Date.now() - startedAt };
}

/** Find source of image, from Catalogues' title bar menu as VS Code places it: by the ID typed, or a file. */
export async function findSource(page, how) {
  await showPanel(page, "catalogue");
  await page.locator("#catalogues-more").click();
  await page.locator(".context-menu [role=menuitem]", { hasText: "Find source of image…" }).click();
  if (how.id !== undefined) {
    await choose(page, "Type the ID from the image's corner…");
    const typed = form(page, "Find source of image");
    await typed.locator("#track-form-text").fill(how.id);
    return typed;
  }
  await choose(page, "Choose an image file…");
  await upload(page, how.file);
  return undefined;
}
