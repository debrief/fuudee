// The browser's docked layout (product owner, 23 Oct 2026): a remembered layout is used only when
// it is this version's and holds exactly this page's panels; anything else gives the default.
// The layout itself is played in test/play/dock.mjs.
import { describe, expect, it } from "vitest";
import { defaultSizes, LAYOUT_VERSION, layoutText, placeOf, readLayout } from "../../play/dock.js";

const PANELS = ["panel-time", "panel-tote", "panel-outline"];
const layout = (ids: string[]) => ({ grid: { root: {}, width: 1000, height: 700, orientation: "HORIZONTAL" }, panels: Object.fromEntries(ids.map((id) => [id, { id, title: id }])) });

describe("reading a remembered layout", () => {
  it("uses this version's layout of exactly these panels and the map", () => {
    const saved = layout(["map", ...PANELS]);
    expect(readLayout(JSON.stringify({ version: LAYOUT_VERSION, layout: saved }), PANELS)).toEqual(saved);
  });
  it("round-trips what it writes", () => {
    const saved = layout(["map", ...PANELS]) as unknown as Parameters<typeof layoutText>[0];
    expect(readLayout(layoutText(saved), PANELS)).toEqual(saved);
  });
  it("gives the default for nothing, or what is not JSON", () => {
    expect(readLayout(null, PANELS)).toBeUndefined();
    expect(readLayout("", PANELS)).toBeUndefined();
    expect(readLayout("{not json", PANELS)).toBeUndefined();
    expect(readLayout("[]", PANELS)).toBeUndefined();
  });
  it("gives the default for another version's layout", () => {
    expect(readLayout(JSON.stringify({ version: LAYOUT_VERSION - 1, layout: layout(["map", ...PANELS]) }), PANELS)).toBeUndefined();
    expect(readLayout(JSON.stringify({ layout: layout(["map", ...PANELS]) }), PANELS)).toBeUndefined();
  });
  it("gives the default when a panel is missing, unknown or the map is not there", () => {
    expect(readLayout(JSON.stringify({ version: LAYOUT_VERSION, layout: layout(["map", "panel-time"]) }), PANELS)).toBeUndefined();
    expect(readLayout(JSON.stringify({ version: LAYOUT_VERSION, layout: layout(["map", ...PANELS, "panel-plot"]) }), PANELS)).toBeUndefined();
    expect(readLayout(JSON.stringify({ version: LAYOUT_VERSION, layout: layout(PANELS) }), PANELS)).toBeUndefined();
  });
  it("gives the default for a layout without its grid", () => {
    expect(readLayout(JSON.stringify({ version: LAYOUT_VERSION, layout: { panels: {} } }), PANELS)).toBeUndefined();
  });
});

describe("the default's sizes", () => {
  it("leaves the map half the width or more at a laptop's 1366 px, and the strip under it 30% of the height", () => {
    const sizes = defaultSizes(1366, 712);
    expect(1366 - sizes.left - sizes.right).toBeGreaterThanOrEqual(683);
    expect(sizes.strip).toBe(Math.round(712 * 0.3));
  });
  it("keeps the side columns usable on a small screen and bounded on a large one", () => {
    expect(defaultSizes(900, 500).left).toBe(250);
    expect(defaultSizes(3000, 1600).right).toBe(380);
  });
});

describe("where a group is", () => {
  const dock = { left: 0, width: 1200 };
  it("is the third of the dock its middle is in", () => {
    expect(placeOf({ left: 0, width: 280 }, dock)).toBe("left");
    expect(placeOf({ left: 280, width: 640 }, dock)).toBe("centre");
    expect(placeOf({ left: 920, width: 280 }, dock)).toBe("right");
  });
});
