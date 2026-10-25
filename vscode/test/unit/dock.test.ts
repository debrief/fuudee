// The browser's docked layout (product owner, 23 Oct 2026): a remembered layout is used only when
// it is this version's and would come out whole: exactly this page's panels, each in one group
// once, the map alone in its own, sizes a screen could have, every panel rendered always. Anything
// else gives the default (panel review, 23 Oct 2026: an incomplete layout once broke the page).
// The layout itself is played in test/play/dock.mjs.
import { describe, expect, it } from "vitest";
import { defaultSizes, LAYOUT_VERSION, layoutProblem, layoutText, placeOf, readLayout } from "../../play/dock.js";
import { DEFAULT_GROUPS, PANELS, PANEL_TITLES, SIDE_FIRST } from "../../play/panels.mjs";

const PANEL_IDS = ["panel-time", "panel-tote", "panel-outline"];
const leaf = (views: string[], size = 200, id = views[0]) => ({ type: "leaf", data: { views, activeView: views[0], id }, size });
/** A whole layout: Time and Tote on the left, the map, the Outline on the right. */
const whole = () => ({
  grid: {
    root: { type: "branch", data: [{ type: "branch", data: [leaf(["panel-time"]), leaf(["panel-tote"])], size: 300 }, leaf(["map"], 700), leaf(["panel-outline"], 300)], size: 700 },
    width: 1300,
    height: 700,
    orientation: "HORIZONTAL",
  },
  panels: Object.fromEntries(["map", ...PANEL_IDS].map((id) => [id, { id, contentComponent: id, title: id }])),
  activeGroup: "map",
});
const saved = (layout: unknown) => JSON.stringify({ version: LAYOUT_VERSION, layout });

describe("reading a remembered layout", () => {
  it("uses this version's whole layout of exactly these panels and the map", () => {
    expect(layoutProblem(whole(), PANEL_IDS)).toBeUndefined();
    expect(readLayout(saved(whole()), PANEL_IDS)).toEqual(whole());
  });
  it("round-trips what it writes", () => {
    const layout = whole() as unknown as Parameters<typeof layoutText>[0];
    expect(readLayout(layoutText(layout), PANEL_IDS)).toEqual(layout);
  });
  it("gives the default for nothing, or what is not JSON", () => {
    for (const text of [null, "", "{not json", "[]", "null"]) expect(readLayout(text, PANEL_IDS)).toBeUndefined();
  });
  it("gives the default for another version's layout, the first round's included", () => {
    expect(readLayout(JSON.stringify({ version: LAYOUT_VERSION - 1, layout: whole() }), PANEL_IDS)).toBeUndefined();
    expect(readLayout(JSON.stringify({ version: 1, layout: whole() }), PANEL_IDS)).toBeUndefined();
    expect(readLayout(JSON.stringify({ layout: whole() }), PANEL_IDS)).toBeUndefined();
  });
  it("gives the default when a panel is missing, unknown or the map is not there", () => {
    const missing = whole();
    delete (missing.panels as Record<string, unknown>)["panel-outline"];
    expect(layoutProblem(missing, PANEL_IDS)).toBeDefined();
    const unknown = whole();
    (unknown.panels as Record<string, unknown>)["panel-plot"] = { id: "panel-plot" };
    expect(layoutProblem(unknown, PANEL_IDS)).toBeDefined();
    expect(layoutProblem(whole(), [...PANEL_IDS, "panel-tools"])).toBeDefined();
  });
  // Panel review, 23 Oct 2026 (H1): a layout whose panels are listed but whose grid holds fewer.
  it("gives the default when the grid holds fewer panels than are listed (the map's leaf alone)", () => {
    const truncated = whole();
    truncated.grid.root = leaf(["map"], 700) as unknown as typeof truncated.grid.root;
    expect(layoutProblem(truncated, PANEL_IDS)).toBe("the grid's panels");
  });
  it("gives the default when a panel is in the grid twice", () => {
    const twice = whole();
    (twice.grid.root.data as unknown[]).push(leaf(["panel-time"], 100, "again"));
    expect(layoutProblem(twice, PANEL_IDS)).toBe("the grid's panels");
  });
  it("gives the default when the map shares a group", () => {
    const shared = whole();
    shared.grid.root = { type: "branch", data: [leaf(["map", "panel-time"], 700), leaf(["panel-tote"]), leaf(["panel-outline"])], size: 700 };
    expect(layoutProblem(shared, PANEL_IDS)).toBe("the map shares a group");
  });
  it("gives the default for sizes no screen has: 0, huge, not a number", () => {
    for (const size of [0, 1e7, null, -5, "300"]) {
      const odd = whole();
      ((odd.grid.root.data as { size?: unknown }[])[1] as { size?: unknown }).size = size;
      expect(layoutProblem(odd, PANEL_IDS), String(size)).toBe("a size");
    }
    for (const width of [0, 1e7, null]) {
      const odd = whole();
      (odd.grid as { width: unknown }).width = width;
      expect(layoutProblem(odd, PANEL_IDS), String(width)).toBe("the grid's size");
    }
  });
  it("gives the default for a panel not rendered always, or a floating group", () => {
    const rendered = whole();
    (rendered.panels as Record<string, { renderer?: string }>)["panel-tote"].renderer = "onlyWhenVisible";
    expect(layoutProblem(rendered, PANEL_IDS)).toMatch(/not rendered always/);
    const floating = { ...whole(), floatingGroups: [{}] };
    expect(layoutProblem(floating, PANEL_IDS)).toBe("a floating or popped-out group");
  });
  it("gives the default for a group with no panels, or an empty branch", () => {
    const empty = whole();
    (empty.grid.root.data as unknown[]).push(leaf([], 100, "none"));
    expect(layoutProblem(empty, PANEL_IDS)).toBe("a group without panels");
    const branch = whole();
    (branch.grid.root.data as unknown[]).push({ type: "branch", data: [], size: 100 });
    expect(layoutProblem(branch, PANEL_IDS)).toBe("an empty branch");
  });
});

describe("the default's sizes", () => {
  // Product owner, 23 Oct 2026, second round: the strip under the map 22% of the centre's height.
  it("leaves the map more than half the width at a laptop's 1366 px, and the strip under it 22% of the height", () => {
    const sizes = defaultSizes(1366, 712);
    expect(1366 - sizes.left - sizes.right).toBeGreaterThanOrEqual(683);
    expect(sizes.strip).toBe(Math.round(712 * 0.22));
  });
  it("keeps the side columns usable on a small screen and bounded on a large one", () => {
    expect(defaultSizes(900, 500).left).toBe(250);
    expect(defaultSizes(3000, 1600).right).toBe(380);
  });
  it("gives Bearings most of the right-hand column and the walkthroughs a readable rest, at a laptop's sizes", () => {
    for (const height of [666, 714, 1030]) {
      const { bearings } = defaultSizes(1366, height);
      expect(bearings / height).toBeGreaterThan(0.55);
      expect(height - bearings).toBeGreaterThanOrEqual(220);
    }
  });
});

describe("the panels' one table", () => {
  it("puts every panel in exactly one default group, Bearings on the right with the walkthroughs beneath", () => {
    const grouped = DEFAULT_GROUPS.flatMap((g) => g.panels);
    expect(grouped.sort()).toEqual(PANELS.map((p) => p.id).sort());
    // Product owner, 25 Oct 2026: the right-hand column split, Bearings on top, the walkthroughs beneath, both in sight.
    expect(DEFAULT_GROUPS.filter((g) => g.place === "right")).toEqual([
      { place: "right", panels: ["panel-bearings"] },
      { place: "right", panels: ["panel-tour"] },
    ]);
    expect(DEFAULT_GROUPS.find((g) => g.place === "centre")?.panels).toEqual(["panel-timeline", "panel-coverage"]);
    expect(DEFAULT_GROUPS.every((g) => g.panels.length <= 3)).toBe(true); // no tab overflow in a side column
  });
  // Product owner, 24 Oct 2026: three groups on the left; the Outline's last, so it has the rest.
  it("puts Time, then the Tote with Tools and History, then the Outline with the Catalogue on the left", () => {
    expect(DEFAULT_GROUPS.filter((g) => g.place === "left").map((g) => g.panels)).toEqual([
      ["panel-time"],
      ["panel-tote", "panel-tools", "panel-history"],
      ["panel-outline", "panel-catalogue"],
    ]);
  });
  it("names every panel, and starts the side column with the walkthroughs and the time controller", () => {
    for (const p of PANELS) expect(PANEL_TITLES[p.id]).toBe(p.title);
    expect(SIDE_FIRST.slice(0, 2)).toEqual(["panel-tour", "panel-time"]);
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
