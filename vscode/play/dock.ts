/**
 * The browser's docked layout (product owner, 23 Oct 2026): the playground's and the web demo's
 * panels in tab groups around the map, which the reader drags to rearrange, with Dockview
 * (dockview-core, plain TypeScript, MIT; pinned and bundled into host.js, never from a CDN).
 * VS Code is unaffected: it has its own sidebar and panels.
 *
 * The default is "A, task-grouped": Time, Tote, and Outline with Catalogue down the left; the map
 * in the middle with Timeline and Coverage under it; Walkthroughs, Tools and History on the right,
 * the walkthroughs in front. The layout is remembered in this browser (its shape only, never
 * anything from a plot), unless the page is a blog's demo, which always starts from a layout made
 * from the panels it lists.
 *
 * Nothing that holds a frame is ever moved in the page: moving an iframe reloads it. The map and
 * the tool form beside it stay where host.ts put them, laid over the map's place in the layout (an
 * empty slot), so dragging, tab switching, splitting and Reset layout never reload them; and every
 * panel is rendered always (renderer "always"), only hidden when its tab is not in front, so its
 * controls, its scroll and what it shows stay as they were.
 */
import { createDockview, type DockviewApi, type DockviewGroupPanel, type IContentRenderer, type IDockviewPanel, type SerializedDockview } from "dockview-core";

/** Where the layout is remembered, per browser. */
export const LAYOUT_KEY = "debrief.play.layout";
/** Raised whenever the panels or the layout's meaning change: an older layout is then not used. */
export const LAYOUT_VERSION = 1;
/** The map's place in the layout: an empty slot the map is laid over. */
export const MAP_ID = "map";

/** The parts of browser storage this needs. */
export type LayoutStorage = Pick<Storage, "getItem" | "setItem">;

/** The default layout, group by group: where it goes, and its panels as tabs, the first in front. */
export type Place = "left" | "centre" | "right";
export const DEFAULT_GROUPS: { place: Place; panels: string[] }[] = [
  { place: "left", panels: ["panel-time"] },
  { place: "left", panels: ["panel-tote"] },
  { place: "left", panels: ["panel-outline", "panel-catalogue"] },
  { place: "centre", panels: ["panel-timeline", "panel-coverage"] },
  { place: "right", panels: ["panel-tour", "panel-tools", "panel-history"] },
];

/**
 * The default's sizes for a dock of this size, in pixels. The side columns take about a fifth of
 * the width each, so at 1366 px the map keeps more than half; the Timeline and Coverage under the
 * map take 30% of its height. Time and Tote are as tall as the sample needs (no scroll inside them
 * at 768 px high), Outline and Catalogue the rest.
 */
export function defaultSizes(width: number, height: number): { left: number; right: number; time: number; tote: number; strip: number } {
  const clamp = (value: number, low: number, high: number) => Math.round(Math.max(low, Math.min(high, value)));
  return {
    left: clamp(width * 0.21, 250, 360),
    right: clamp(width * 0.21, 270, 380),
    time: clamp(height * 0.24, 150, 190),
    tote: clamp(height * 0.27, 150, 230),
    strip: clamp(height * 0.3, 140, 420),
  };
}

/** The panel ids a serialised layout holds, or undefined if it is not one. */
function panelIdsOf(layout: unknown): string[] | undefined {
  if (!layout || typeof layout !== "object") return undefined;
  const { grid, panels } = layout as { grid?: unknown; panels?: unknown };
  if (!grid || typeof grid !== "object" || !panels || typeof panels !== "object" || Array.isArray(panels)) return undefined;
  return Object.keys(panels);
}

/**
 * A remembered layout, if it can be used: this version's, holding exactly the panels this page
 * has (and the map). Anything else, unreadable, from an older version or with a panel missing or
 * unknown, is not used: the default is (product owner, 23 Oct 2026).
 */
export function readLayout(text: string | null | undefined, panels: readonly string[]): SerializedDockview | undefined {
  if (!text) return undefined;
  try {
    const saved = JSON.parse(text) as { version?: unknown; layout?: unknown };
    if (!saved || saved.version !== LAYOUT_VERSION) return undefined;
    const ids = panelIdsOf(saved.layout);
    const expected = new Set([MAP_ID, ...panels]);
    if (!ids || ids.length !== expected.size || !ids.every((id) => expected.has(id))) return undefined;
    return saved.layout as SerializedDockview;
  } catch {
    return undefined;
  }
}

/** What is remembered: the version and Dockview's own description of the layout, which names panels by id and title and nothing else. */
export const layoutText = (layout: SerializedDockview): string => JSON.stringify({ version: LAYOUT_VERSION, layout });

/** Where a group sits, from its middle across the dock: the left, centre or right third. */
export function placeOf(group: { left: number; width: number }, dock: { left: number; width: number }): Place {
  const middle = (group.left + group.width / 2 - dock.left) / Math.max(1, dock.width);
  return middle < 1 / 3 ? "left" : middle > 2 / 3 ? "right" : "centre";
}

export interface DockOptions {
  /** The element the layout fills. */
  container: HTMLElement;
  /** The panels on this page, in the default's order: their sections, by id (panel-time...). */
  sections: Map<string, HTMLElement>;
  /** Each panel's name, its tab's text. */
  titles: Record<string, string>;
  /** The map's empty place, which the map is laid over. */
  slot: HTMLElement;
  /** Remember the layout in this browser: not in a blog's demo. */
  remember: boolean;
  storage: () => LayoutStorage | undefined;
  /** A panel came into view, or went out of it (its tab, its group). */
  shown: (id: string, shown: boolean) => void;
  /** The layout changed: the map's slot may have moved. */
  changed: () => void;
  /** A drag began (true) or ended (false). */
  dragging: (on: boolean) => void;
  /** Reset layout was chosen: the host makes the layout again, fresh (see fresh). */
  reset: () => void;
  /** Start from the default, whatever is remembered, and remember it: Reset layout. */
  fresh?: boolean;
}

/**
 * The docked layout. Its panels' sections are moved into it, and moved out again by whoever
 * disposes of it; they never hold a frame.
 */
export class Dock {
  readonly api: DockviewApi;
  private readonly ids: string[];
  private saving: number | undefined;
  private menu: HTMLElement | undefined;
  private menuReturn: HTMLElement | undefined;
  private readonly observer: ResizeObserver;
  private readonly cleanups: (() => void)[] = [];
  private disposed = false;

  constructor(private readonly options: DockOptions) {
    this.ids = [...options.sections.keys()];
    const { container } = options;
    this.api = createDockview(container, {
      // Every panel kept in the page, shown or not: none is rebuilt, none loses what it shows.
      defaultRenderer: "always",
      // Floating and popped-out groups are not offered: one window, one grid.
      disableFloatingGroups: true,
      // Dockview would announce each panel as the layout is built and reset ("Time opened"): noise.
      // A panel moved from its menu takes the keyboard to its tab, which a screen reader reads out.
      announcements: false,
      theme: { name: "debrief", className: "dockview-theme-debrief", dndOverlayMounting: "absolute", dndPanelOverlay: "group" },
      createComponent: ({ id }) => this.content(id),
      createRightHeaderActionComponent: (group) => this.groupMenuButton(group),
    });
    const layout = options.remember && !options.fresh ? readLayout(this.read(), this.ids) : undefined;
    if (!layout || !this.load(layout)) this.buildDefault();
    this.decorate();
    if (options.fresh) this.save(true);
    this.api.onDidLayoutChange(() => {
      this.decorate();
      options.changed();
      this.save();
    });
    this.api.onDidActivePanelChange(() => queueMicrotask(() => this.decorate()));
    // A group gone (its last panel moved away) leaves its room to its neighbours, in proportion:
    // the side columns would widen and the map narrow. The map takes it instead.
    this.api.onDidRemoveGroup(() => requestAnimationFrame(() => this.keepMapWide()));
    this.api.onWillDragPanel(() => options.dragging(true));
    this.api.onWillDragGroup(() => options.dragging(true));
    // A panel taken out by any means (none is offered) is put back, so none is ever lost.
    this.api.onDidRemovePanel((panel) => queueMicrotask(() => this.restore(panel.id)));
    const ended = () => options.dragging(false);
    for (const type of ["dragend", "drop", "pointerup", "pointercancel"]) {
      window.addEventListener(type, ended, true);
      this.cleanups.push(() => window.removeEventListener(type, ended, true));
    }
    // Delete and Backspace close a tab in Dockview: here every panel stays, so they do nothing.
    // Shift+F10 and the context-menu key open the tab's menu, as a right-click does.
    const keys = (event: KeyboardEvent) => {
      const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>(".dv-tab");
      if (!tab) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const id = tab.dataset.panel;
        const box = tab.getBoundingClientRect();
        if (id) this.openMenu(id, box.left, box.bottom, tab);
      }
    };
    const contextMenu = (event: MouseEvent) => {
      const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>(".dv-tab");
      if (!tab?.dataset.panel) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.openMenu(tab.dataset.panel, event.clientX, event.clientY, tab);
    };
    container.addEventListener("keydown", keys, true);
    container.addEventListener("contextmenu", contextMenu, true);
    // The container outlives this layout (narrow and back, Reset): its listeners go with it.
    this.cleanups.push(() => container.removeEventListener("keydown", keys, true));
    this.cleanups.push(() => container.removeEventListener("contextmenu", contextMenu, true));
    const outside = (event: Event) => void (this.menu && !this.menu.contains(event.target as Node) && this.closeMenu(false));
    document.addEventListener("pointerdown", outside, true);
    this.cleanups.push(() => document.removeEventListener("pointerdown", outside, true));
    // A click in a frame (the map) reaches no listener here: the page losing focus to it closes the menu.
    const blurred = () => setTimeout(() => document.activeElement instanceof HTMLIFrameElement && this.closeMenu(false));
    window.addEventListener("blur", blurred);
    this.cleanups.push(() => window.removeEventListener("blur", blurred));
    this.observer = new ResizeObserver(() => options.changed());
    this.observer.observe(options.slot);
  }

  /** Whether a panel is in view: its tab in front. */
  isShown(id: string): boolean {
    return !!this.api.getPanel(id)?.api.isVisible;
  }

  /** Bring a panel's tab to the front. */
  show(id: string): void {
    this.api.getPanel(id)?.api.setActive();
  }

  /** The panel ids in each group, in order, the one in front first; for the tests and the menu. */
  groups(): { id: string; place: Place; panels: string[]; active: string | undefined }[] {
    const dock = this.options.container.getBoundingClientRect();
    return this.api.groups.map((group) => {
      const box = group.element.getBoundingClientRect();
      return { id: group.id, place: placeOf(box, dock), panels: group.panels.map((p) => p.id), active: group.activePanel?.id };
    });
  }

  /**
   * The default layout again, remembered as the layout from now on. The host disposes of this
   * layout and makes a fresh one: Dockview, cleared and built again in place, can leave a panel
   * drawn where it was.
   */
  reset(): void {
    this.closeMenu(false);
    this.options.reset();
  }

  /** Side columns grown well past the default's width (a group beside them gone) back to it, so the map has the room. */
  private keepMapWide(): void {
    if (this.disposed) return;
    const { width, height } = this.options.container.getBoundingClientRect();
    const sizes = defaultSizes(width, height);
    for (const group of this.api.groups) {
      if (group.panels.some((p) => p.id === MAP_ID)) continue;
      const box = group.element.getBoundingClientRect();
      const place = placeOf(box, this.options.container.getBoundingClientRect());
      const wanted = place === "left" ? sizes.left : place === "right" ? sizes.right : undefined;
      if (wanted && box.width > wanted * 1.3) group.api.setSize({ width: wanted });
    }
  }

  /** Move a panel into another group, as a tab in front; or into a group of its own below its group. */
  moveTo(id: string, target: string | "own"): void {
    const panel = this.api.getPanel(id);
    if (!panel) return;
    if (target === "own") panel.api.moveTo({ group: panel.group, position: "bottom" });
    else {
      const group = this.groupById(target);
      if (group) panel.api.moveTo({ group, position: "center" });
    }
    panel.api.setActive();
    this.focusTab(id);
  }

  /** Put the keyboard on a panel's tab. */
  focusTab(id: string): void {
    queueMicrotask(() => this.tabOf(id)?.focus());
  }

  dispose(): void {
    this.disposed = true;
    this.closeMenu(false);
    // A change not yet written is written now: going narrow and back keeps it.
    if (this.saving !== undefined) this.save(true);
    this.observer.disconnect();
    for (const cleanup of this.cleanups) cleanup();
    this.api.dispose();
    this.options.container.replaceChildren();
  }

  // --- Building ----------------------------------------------------------------------

  private content(id: string): IContentRenderer {
    const element = document.createElement("div");
    // "side": the panel keeps the side column's look, docked or not.
    element.className = id === MAP_ID ? "dock-panel dock-map" : "dock-panel side";
    let disposable: { dispose(): void } | undefined;
    return {
      element,
      init: ({ api }) => {
        if (id === MAP_ID) element.append(this.options.slot);
        else {
          const section = this.options.sections.get(id);
          if (section) element.append(section);
          disposable = api.onDidVisibilityChange(({ isVisible }) => this.options.shown(id, isVisible));
        }
      },
      dispose: () => disposable?.dispose(),
    };
  }

  private add(id: string, position?: Parameters<DockviewApi["addPanel"]>[0]["position"], inactive = false): IDockviewPanel {
    return this.api.addPanel({ id, component: id, title: this.options.titles[id] ?? id, position, inactive });
  }

  /** The default layout ("A, task-grouped"), with the panels this page has. */
  private buildDefault(): void {
    const { width, height } = this.options.container.getBoundingClientRect();
    // Laid out at the dock's size first, so the sizes below hold.
    if (width && height) this.api.layout(width, height);
    const map = this.add(MAP_ID);
    const sizes = defaultSizes(width || 1366, height || 700);
    const groups = DEFAULT_GROUPS.map((g) => ({ ...g, panels: g.panels.filter((id) => this.options.sections.has(id)) })).filter((g) => g.panels.length);
    // Under the map first, so the side columns run the full height beside both.
    let firstLeft: IDockviewPanel | undefined;
    let lastLeft: IDockviewPanel | undefined;
    let right: IDockviewPanel | undefined;
    for (const group of groups) {
      const [first, ...rest] = group.panels;
      let lead: IDockviewPanel;
      if (group.place === "centre") lead = this.add(first, { referencePanel: map, direction: "below" });
      else if (group.place === "left") lead = this.add(first, lastLeft ? { referencePanel: lastLeft, direction: "below" } : { direction: "left" });
      else lead = this.add(first, { direction: "right" });
      for (const id of rest) this.add(id, { referencePanel: lead, direction: "within" }, true);
      lead.api.setActive();
      if (group.place === "left") {
        firstLeft ??= lead;
        lastLeft = lead;
      } else if (group.place === "right") right = lead;
      else lead.group.api.setSize({ height: sizes.strip });
    }
    // Sizes: the columns' widths, then Time's and the Tote's heights (the last left group takes the rest).
    firstLeft?.group.api.setSize({ width: sizes.left });
    right?.group.api.setSize({ width: sizes.right });
    const time = this.api.getPanel("panel-time");
    const tote = this.api.getPanel("panel-tote");
    const leftGroups = groups.filter((g) => g.place === "left").length;
    if (time && leftGroups > 1) time.group.api.setSize({ height: sizes.time });
    if (tote && leftGroups > 2) tote.group.api.setSize({ height: sizes.tote });
    map.api.setActive();
  }

  private load(layout: SerializedDockview): boolean {
    try {
      this.api.fromJSON(layout);
      // Names as this version has them, whatever was remembered.
      for (const panel of this.api.panels) panel.api.setTitle(this.options.titles[panel.id] ?? panel.id);
      return this.ids.every((id) => this.api.getPanel(id)) && !!this.api.getPanel(MAP_ID);
    } catch {
      this.api.clear();
      return false;
    }
  }

  /** A panel that went (it should not) is put back, into the group of the first panel there is beside the map. */
  private restore(id: string): void {
    if (this.disposed || this.api.getPanel(id) || (id !== MAP_ID && !this.options.sections.has(id))) return;
    if (id === MAP_ID) return this.reset();
    const other = this.api.panels.find((p) => p.id !== MAP_ID);
    this.add(id, other ? { referencePanel: other, direction: "within" } : { direction: "right" });
  }

  // --- Remembering -------------------------------------------------------------------

  private read(): string | null {
    try {
      return this.options.storage()?.getItem(LAYOUT_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private save(now = false): void {
    if (!this.options.remember) return;
    window.clearTimeout(this.saving);
    const write = () => {
      try {
        this.options.storage()?.setItem(LAYOUT_KEY, layoutText(this.api.toJSON()));
      } catch {
        // Not remembered: the layout still works, for this visit.
      }
    };
    this.saving = undefined;
    if (now) write();
    else
      this.saving = window.setTimeout(() => {
        this.saving = undefined;
        write();
      }, 250);
  }

  // --- Accessibility -----------------------------------------------------------------

  private tabOf(id: string): HTMLElement | undefined {
    return this.api.getPanel(id)?.view.tab.element.closest<HTMLElement>(".dv-tab") ?? undefined;
  }

  private mapGroup(): DockviewGroupPanel | undefined {
    return this.groupById(this.api.getPanel(MAP_ID)?.group.id);
  }

  private groupById(id: string | undefined): DockviewGroupPanel | undefined {
    return this.api.groups.find((group) => group.id === id);
  }

  /**
   * After every change: the map's group has no tabs and takes no panels as tabs (splitting
   * beside it is allowed); each group is named for screen readers by where it is and what it
   * holds; each tab says which panel it is, for its menu and the tests.
   */
  private decorate(): void {
    const mapGroup = this.mapGroup();
    if (mapGroup) {
      if (!mapGroup.header.hidden) mapGroup.header.hidden = true;
      if (mapGroup.locked !== true) mapGroup.locked = true;
      mapGroup.element.setAttribute("aria-label", "Map");
    }
    for (const group of this.groups()) {
      const element = this.groupById(group.id)?.element;
      if (!element || group.panels.includes(MAP_ID)) continue;
      const titles = group.panels.map((id) => this.options.titles[id] ?? id);
      element.setAttribute("aria-label", `Panels, ${group.place}: ${titles.join(", ")}`);
      element.dataset.place = group.place;
      element.querySelector(".dock-menu-button")?.setAttribute("aria-label", `Move ${this.options.titles[group.active ?? ""] ?? "panel"}…`);
    }
    for (const panel of this.api.panels) {
      const tab = this.tabOf(panel.id);
      if (!tab) continue;
      tab.dataset.panel = panel.id;
      tab.title = `${this.options.titles[panel.id] ?? panel.id}: drag to move; right-click, Shift+F10 or ⋯ for more`;
      const content = this.options.sections.get(panel.id)?.parentElement;
      if (content) {
        content.setAttribute("role", "tabpanel");
        content.setAttribute("aria-labelledby", tab.id);
      }
    }
  }

  // --- The menu: moving a panel without a pointer -------------------------------------

  /** Each group's ⋯ button: the menu for the panel in front, to move it or reset the layout. */
  private groupMenuButton(group: DockviewGroupPanel) {
    const element = document.createElement("div");
    element.className = "dock-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dock-menu-button";
    button.textContent = "⋯";
    const label = () => `Move ${this.options.titles[group.activePanel?.id ?? ""] ?? "panel"}…`;
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-label", label());
    button.title = "Move this panel to another group, or reset the layout";
    button.addEventListener("focus", () => button.setAttribute("aria-label", label()));
    button.addEventListener("pointerdown", (e) => e.stopPropagation()); // not the start of a drag
    button.addEventListener("click", () => {
      const id = group.activePanel?.id;
      if (!id) return;
      const box = button.getBoundingClientRect();
      this.openMenu(id, box.right, box.bottom, button);
    });
    element.append(button);
    return { element, init: () => undefined, dispose: () => element.remove() };
  }

  /** The menu for a panel: move it to each other group, or a group of its own; reset the layout. */
  openMenu(id: string, x: number, y: number, from: HTMLElement): void {
    this.closeMenu(false);
    const panel = this.api.getPanel(id);
    if (!panel || id === MAP_ID) return;
    this.menuReturn = from;
    const title = this.options.titles[id] ?? id;
    const items: [string, () => void][] = [];
    for (const group of this.groups()) {
      if (group.id === panel.group.id || group.panels.includes(MAP_ID)) continue;
      items.push([`Move to ${group.place}: ${group.panels.map((p) => this.options.titles[p] ?? p).join(", ")}`, () => this.moveTo(id, group.id)]);
    }
    if (panel.group.panels.length > 1) items.push(["Move to a group of its own", () => this.moveTo(id, "own")]);
    items.push(["Reset layout", () => this.reset()]);
    const element = document.createElement("div");
    element.className = "context-menu dock-menu";
    element.setAttribute("role", "menu");
    element.setAttribute("aria-label", `${title}: move`);
    const buttons = items.map(([text, act]) => {
      const button = Object.assign(document.createElement("button"), { textContent: text, type: "button" });
      button.setAttribute("role", "menuitem");
      button.tabIndex = -1;
      button.onclick = () => {
        this.closeMenu(false);
        act();
      };
      return button;
    });
    element.append(...buttons);
    element.onkeydown = (e) => {
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "Escape" || e.key === "Tab") {
        e.preventDefault();
        this.closeMenu(true);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        buttons[(at + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length].focus();
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        buttons[e.key === "Home" ? 0 : buttons.length - 1].focus();
      }
    };
    document.body.append(element);
    const box = element.getBoundingClientRect();
    element.style.left = `${Math.max(0, Math.min(x, innerWidth - box.width - 4))}px`;
    element.style.top = `${Math.max(0, Math.min(y, innerHeight - box.height - 4))}px`;
    this.menu = element;
    buttons[0].focus();
  }

  private closeMenu(focus: boolean): void {
    const was = this.menu;
    this.menu = undefined;
    was?.remove();
    if (was && focus && this.menuReturn?.isConnected) this.menuReturn.focus();
  }
}
