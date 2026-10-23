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
  { id: "panel-tools", title: "Tools" },
  { id: "panel-history", title: "History" },
];

/** Each panel's name, its tab's text. */
export const PANEL_TITLES = Object.fromEntries(PANELS.map((p) => [p.id, p.title]));

/**
 * The default docked layout, "A, task-grouped", group by group: where it goes and its panels as tabs,
 * the first in front (product owner, 23 Oct 2026, second round). The walkthroughs alone on the right,
 * so a step's words are never hidden behind another tab; Tools and History on the left, below the
 * Outline and Catalogue: four tabs in one group would overflow the left column at 1280 and 1366 px.
 */
export const DEFAULT_GROUPS = [
  { place: "left", panels: ["panel-time"] },
  { place: "left", panels: ["panel-tote"] },
  { place: "left", panels: ["panel-outline", "panel-catalogue"] },
  { place: "left", panels: ["panel-tools", "panel-history"] },
  { place: "centre", panels: ["panel-timeline", "panel-coverage"] },
  { place: "right", panels: ["panel-tour"] },
];

/** The side column's first panels, whatever a blog's demo lists; the rest follow in the order it lists them. */
export const SIDE_FIRST = ["panel-tour", "panel-time", "panel-tote", "panel-outline"];
