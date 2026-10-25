// The browser's panels, in one table (product owner, 23 Oct 2026): each panel's section id and name,
// where the default docked layout puts it, and the side column's order when narrow. host.ts,
// dock.ts and the playground tests all read it, so they cannot drift apart. Node runs it as it is.

/** Every panel with a tab of its own when docked, in the side column's order when narrow. */
export const PANELS = [
  { id: "panel-tour", title: "Walkthroughs" },
  { id: "panel-time", title: "Time" },
  { id: "panel-tote", title: "Tote" },
  { id: "panel-outline", title: "Outline" },
  { id: "panel-timeline", title: "Timeline" },
  { id: "panel-catalogue", title: "Catalogue" },
  { id: "panel-coverage", title: "Coverage" },
  { id: "panel-bearings", title: "Bearings" },
  { id: "panel-tools", title: "Tools" },
  { id: "panel-history", title: "History" },
];

/** Each panel's name, its tab's text. */
export const PANEL_TITLES = Object.fromEntries(PANELS.map((p) => [p.id, p.title]));

/**
 * The default docked layout, "A, task-grouped", group by group: where it goes and its panels as tabs,
 * the first in front. The walkthroughs alone on the right, so a step's words are never hidden behind
 * another tab (product owner, 23 Oct 2026, second round). On the left, three groups (product owner,
 * 24 Oct 2026): Time; the Tote with Tools and History as tabs, the Tote in front; and the Outline with
 * the Catalogue, taking the rest of the height, so the Outline shows about a dozen rows at 1366 × 768.
 * While playing, the Tote is one tab away, and its lines still show on the map. The Bearings view
 * (product owner, 25 Oct 2026) is a tall panel right of the map, a tab behind the walkthroughs, as
 * legacy's Stacked Dots stood tall beside the plot: its time runs up the panel, so it wants height,
 * and as a tab it costs the map no width (still half or more from 1280 px). It comes in front when
 * a solution is made or chosen in it; the walkthroughs stay in front until then.
 */
export const DEFAULT_GROUPS = [
  { place: "left", panels: ["panel-time"] },
  { place: "left", panels: ["panel-tote", "panel-tools", "panel-history"] },
  { place: "left", panels: ["panel-outline", "panel-catalogue"] },
  { place: "centre", panels: ["panel-timeline", "panel-coverage"] },
  { place: "right", panels: ["panel-tour", "panel-bearings"] },
];

/** The side column's first panels, whatever a blog's demo lists; the rest follow in the order it lists them. */
export const SIDE_FIRST = ["panel-tour", "panel-time", "panel-tote", "panel-outline"];
