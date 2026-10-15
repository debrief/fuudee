// Finding a row of the Timeline, which draws only the rows in sight (NFR-06): scroll the
// list, as a reader would, until the row is drawn. Shared by the playground tests.

/** The Timeline's row holding text, scrolled into the list's view; on is the page or a demo's frame. */
export async function timelineRow(on, text, kind) {
  const scroller = on.locator("#timeline .tl-scroll");
  const rows = on.locator("#timeline .tl-row[data-id]", { hasText: text });
  const found = () => (kind ? rows.and(on.locator(`#timeline .tl-row[data-kind="${kind}"]`)) : rows).first();
  await scroller.evaluate((el) => (el.scrollTop = 0));
  for (let i = 0; i < 400; i++) {
    if (await found().count()) {
      await found().evaluate((row) => {
        const list = row.closest(".tl-scroll");
        const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
        if (top < 0 || top > list.clientHeight - row.offsetHeight) list.scrollTop += top - list.clientHeight / 3;
      });
      await on.waitForTimeout?.(50);
      return found();
    }
    const moved = await scroller.evaluate((el) => {
      const before = el.scrollTop;
      el.scrollTop += el.clientHeight * 0.8;
      return el.scrollTop !== before;
    });
    if (!moved) break;
    // A frame for the rows now in sight to be drawn.
    await scroller.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  throw new Error(`No Timeline row says ${JSON.stringify(text)}`);
}

/** Search the Timeline (empty to show everything again), and wait for the list to follow. */
export async function searchTimeline(on, text) {
  const search = on.locator("#timeline .tl-search");
  await search.fill(text);
  // The search waits a moment for typing to stop.
  await search.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
}
