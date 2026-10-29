// The Outline's menus in the playground, as a reader uses them (PAR-07): a row's context menu
// (right-click; the menu key and press and hold open the same) and the Outline's toolbar, its
// buttons and its ⋯ menu. Each entry chosen by its title, the action catalogue's.

/** An entry of the menu open, by its title exactly. */
const entry = (page, title) => page.locator(".context-menu").getByText(title, { exact: true });

/** Choose an action on a row's menu: on the row and the rest of the selection, if it is selected. */
export async function fromMenu(page, rowId, title) {
  const row = page.locator(`#outline li[data-id="${rowId}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.click({ button: "right" });
  await entry(page, title).click();
}

/** Choose an action on the selection: from the menu of its first row, as right-clicking it does. */
export async function onSelection(page, title) {
  const first = await page.evaluate(() => window.debriefSelection().picks[0]);
  if (!first) throw new Error(`Nothing selected to choose ${title} on`);
  await fromMenu(page, first, title);
}

/** Choose an action on the Outline's toolbar: its button, or an entry of its ⋯ menu. */
export async function fromToolbar(page, title) {
  const button = page.locator(`#outline-toolbar .obar-button[aria-label="${title}"]`);
  if (await button.count()) return button.click();
  await page.locator("#obar-more").click();
  await entry(page, title).click();
}

/** Whether a toggled entry of the toolbar's ⋯ menu is checked (the menu closed again). */
export async function toolbarChecked(page, title) {
  await page.locator("#obar-more").click();
  const checked = await entry(page, title).getAttribute("aria-checked");
  await page.keyboard.press("Escape");
  return checked === "true";
}
