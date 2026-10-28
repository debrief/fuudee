/**
 * The browser's docked layout (product owner, 23 Oct 2026): the playground's and the web demo's
 * panels in tab groups around the map, which the reader drags to rearrange, with Dockview
 * (dockview-core, plain TypeScript, MIT; pinned and bundled into host.js, never from a CDN).
 * VS Code is unaffected: it has its own sidebar and panels.
 *
 * The default is "A, task-grouped" (panels.mjs): Time, Tote, Outline with Catalogue, and Tools with
 * History down the left; the map in the middle with Timeline and Coverage under it; the
 * Bearings view on the right with the walkthroughs beneath it. The layout is remembered in this browser (its shape only, never
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
import { DEFAULT_GROUPS, type Place } from "./panels.mjs";
import { closeMenu, openMenu } from "./menu.js";

export type { Place };

/** Where the layout is remembered, per browser. */
export const LAYOUT_KEY = "debrief.play.layout";
/** The groups folded to their tabs, with the height each had: remembered beside the layout, so a fold outlives a reload. */
export const COLLAPSED_KEY = "debrief.play.layout.collapsed";
/**
 * Raised whenever the panels or the layout's meaning change: an older layout is then not used.
 * 2: the second round's default (product owner, 23 Oct 2026): walkthroughs alone on the right.
 * 3: three groups on the left (product owner, 24 Oct 2026): Tools and History beside the Tote.
 * 4: the Bearings panel (TMA, CAP-21; 24 Oct 2026), a tab beside the Timeline and Coverage under the map.
 * 5: the Bearings panel tall, right of the map, a tab behind the walkthroughs (product owner, 25 Oct 2026).
 * 6: the right-hand column split: Bearings on top, the walkthroughs beneath (product owner, 25 Oct 2026).
 * 7: Time taller, for its large current time and scrubber (product owner, 28 Oct 2026).
 */
export const LAYOUT_VERSION = 7;
/** The map's place in the layout: an empty slot the map is laid over. */
export const MAP_ID = "map";

/** The parts of browser storage this needs. */
export type LayoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * The height Time needs for the sample, its tab included: no scroll inside it, its window's details
 * folded. Taller since its current time is large (product owner, 28 Oct 2026): 172 px before.
 */
const TIME_HEIGHT = 204;

/**
 * The default's sizes for a dock of this size, in pixels. The side columns take about a fifth of
 * the width each; the Timeline and Coverage under the map 22% of its height (product owner, 23 Oct
 * 2026, second round), so the map keeps more. On the left, Time as tall as it needs, the Tote a
 * quarter of the height and at least what the sample needs at 1280 px (Tools and History as tabs
 * beside it), and the rest to the Outline's group, its list and its track tools (product owner,
 * 24 Oct 2026). On the right, Bearings about 62% of the height and the walkthroughs the rest
 * (product owner, 25 Oct 2026): at 1366 × 768 about 445 px and 270 px, so the plot reads and a
 * walkthrough's step is in sight; never less than 260 px for the walkthroughs.
 */
export function defaultSizes(width: number, height: number): { left: number; right: number; time: number; tote: number; strip: number; bearings: number } {
  const clamp = (value: number, low: number, high: number) => Math.round(Math.max(low, Math.min(high, value)));
  const time = TIME_HEIGHT;
  const tote = clamp(height * 0.25, 188, 230);
  return {
    left: clamp(width * 0.21, 250, 360),
    right: clamp(width * 0.21, 270, 380),
    time,
    tote,
    strip: clamp(height * 0.22, 110, 380),
    bearings: clamp(height * 0.62, 240, Math.max(240, height - 260)),
  };
}

/**
 * The right-hand column's width while a TMA solution is open in Bearings (product owner, 25 Oct
 * 2026): about 40% of the dock, and at least 400 px (two panes of 160 px beside the time axis),
 * the map keeping 40% of it; never narrower than the column was. The rule that the map keeps half
 * the window from 1280 px is relaxed to this only while a solution is open.
 */
export function widenedWidth(width: number, left: number, right: number): number {
  const share = Math.round(width * 0.4);
  return Math.max(right, Math.min(Math.max(share, 400), width - left - share));
}

/** The most a size may be: larger is not a screen. */
const MOST = 20_000;
const sizeOk = (value: unknown) => value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= MOST);

/**
 * Why a remembered layout cannot be used, or undefined if it can: this version's, holding exactly
 * the panels this page has and the map, each in one group once, the map alone in its own, with sizes
 * a screen could have, nothing floating or popped out, and every panel rendered always.
 */
export function layoutProblem(layout: unknown, panels: readonly string[]): string | undefined {
  if (!layout || typeof layout !== "object") return "not a layout";
  const { grid, panels: states, floatingGroups, popoutGroups } = layout as { grid?: { root?: unknown; width?: unknown; height?: unknown }; panels?: unknown; floatingGroups?: unknown[]; popoutGroups?: unknown[] };
  if (!grid || typeof grid !== "object" || !grid.root) return "no grid";
  if (!sizeOk(grid.width) || !sizeOk(grid.height) || grid.width === undefined || grid.height === undefined) return "the grid's size";
  if (!states || typeof states !== "object" || Array.isArray(states)) return "no panels";
  if (floatingGroups?.length || popoutGroups?.length) return "a floating or popped-out group";
  const expected = new Set([MAP_ID, ...panels]);
  const ids = Object.keys(states);
  if (ids.length !== expected.size || !ids.every((id) => expected.has(id))) return "its panels are not this page's";
  for (const [id, state] of Object.entries(states as Record<string, { id?: unknown; contentComponent?: unknown; renderer?: unknown }>)) {
    if (!state || typeof state !== "object" || state.id !== id) return `panel ${id}`;
    if (state.contentComponent !== undefined && state.contentComponent !== id) return `panel ${id}'s component`;
    if (state.renderer !== undefined && state.renderer !== "always") return `panel ${id} is not rendered always`;
  }
  // The grid: every view in one group once; the map alone in its group.
  const seen: string[] = [];
  let problem: string | undefined;
  const walk = (node: unknown, depth: number): void => {
    if (problem) return;
    if (!node || typeof node !== "object" || depth > 50) return void (problem = "the grid's shape");
    const { type, data, size } = node as { type?: unknown; data?: unknown; size?: unknown };
    if (!sizeOk(size)) return void (problem = "a size");
    if (type === "branch") {
      if (!Array.isArray(data) || !data.length) return void (problem = "an empty branch");
      for (const child of data) walk(child, depth + 1);
    } else if (type === "leaf") {
      const views = (data as { views?: unknown } | undefined)?.views;
      if (!Array.isArray(views) || !views.length || !views.every((v) => typeof v === "string")) return void (problem = "a group without panels");
      if (views.includes(MAP_ID) && views.length > 1) return void (problem = "the map shares a group");
      seen.push(...views);
    } else problem = "the grid's shape";
  };
  walk(grid.root, 0);
  if (problem) return problem;
  if (seen.length !== expected.size || new Set(seen).size !== seen.length || !seen.every((id) => expected.has(id))) return "the grid's panels";
  return undefined;
}

/**
 * A remembered layout, if it can be used (layoutProblem). Anything else, unreadable, from another
 * version, incomplete or absurd, is not used: the default is (product owner, 23 Oct 2026).
 */
export function readLayout(text: string | null | undefined, panels: readonly string[]): SerializedDockview | undefined {
  if (!text) return undefined;
  try {
    const saved = JSON.parse(text) as { version?: unknown; layout?: unknown };
    if (!saved || saved.version !== LAYOUT_VERSION) return undefined;
    return layoutProblem(saved.layout, panels) ? undefined : (saved.layout as SerializedDockview);
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

const PLACE_ORDER: Record<Place, number> = { left: 0, centre: 1, right: 2 };
const FOCUSABLE = 'button, input, select, textarea, a[href], iframe, [tabindex]:not([tabindex="-1"])';
/** What the keyboard can reach in an element, in its order: shown, and not switched off. */
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if ((el as HTMLButtonElement).disabled || el.closest("[hidden], [inert]")) return false;
    const check = (el as HTMLElement & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
    return check ? check.call(el, { checkVisibilityCSS: true }) : el.offsetParent !== null;
  });
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
  /** What is laid over the slot (<main>: the map and the form beside it), for the keyboard's order. */
  overSlot: HTMLElement;
  /** Where the keyboard goes before the first group and after the last: the top bar. */
  before: () => HTMLElement | undefined;
  after: () => HTMLElement | undefined;
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
    this.build();
    this.decorate();
    if (options.fresh) {
      this.save(true);
      this.saveFolds();
    }
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
    for (const type of ["dragend", "drop", "pointerup", "pointercancel"]) this.listen(window, type, ended, true);
    // Delete and Backspace close a tab in Dockview: here every panel stays, so they do nothing.
    // Shift+F10 and the context-menu key open the tab's menu, as a right-click does.
    this.listen(
      container,
      "keydown",
      (event: KeyboardEvent) => {
        const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>(".dv-tab");
        if (!tab) return;
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          event.stopImmediatePropagation();
        } else if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
          event.preventDefault();
          event.stopImmediatePropagation();
          const box = tab.getBoundingClientRect();
          if (tab.dataset.panel) this.openMenu(tab.dataset.panel, box.left, box.bottom, tab);
        }
      },
      true,
    );
    this.listen(
      container,
      "contextmenu",
      (event: MouseEvent) => {
        const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>(".dv-tab");
        if (!tab?.dataset.panel) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.openMenu(tab.dataset.panel, event.clientX, event.clientY, tab);
      },
      true,
    );
    // The keyboard's order: each group's tab, then what its panel holds, group by group from the
    // left column down, the map (and the form beside it), under it, then the right (keyboardOrder).
    this.listen(document, "keydown", (event: KeyboardEvent) => this.keyboardOrder(event), true);
    // The reader sizing the right-hand column by its sash: theirs from then on, never widened or put back.
    let before: number | undefined;
    this.listen(
      container,
      "pointerdown",
      (event: PointerEvent) => {
        if ((event.target as HTMLElement | null)?.closest(".dv-sash")) before = this.rightWidth();
      },
      true,
    );
    this.listen(
      window,
      "pointerup",
      () => {
        if (before === undefined) return;
        const now = this.rightWidth();
        if (now !== undefined && Math.abs(now - before) > 2) this.userSized = true;
        before = undefined;
      },
      true,
    );
    let dockWidth = container.getBoundingClientRect().width;
    this.observer = new ResizeObserver(() => {
      options.changed();
      // The window resized while widened (the dock's width changed, not a sash moved): the column
      // kept at its share of the dock, not at the pixels it had.
      const width = container.getBoundingClientRect().width;
      if (Math.abs(width - dockWidth) < 1) return;
      dockWidth = width;
      if (this.widened && !this.userSized && before === undefined) requestAnimationFrame(() => this.rewiden());
    });
    this.observer.observe(options.slot);
  }

  /** A listener that goes with this layout: the container and the page outlive it (narrow and back, Reset). */
  private listen<E extends Event>(target: EventTarget, type: string, handler: (event: E) => void, capture = false): void {
    target.addEventListener(type, handler as EventListener, capture);
    this.cleanups.push(() => target.removeEventListener(type, handler as EventListener, capture));
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

  /** Each group's panel content element, by panel id: for the host, which keeps their scroll. */
  contentOf(id: string): HTMLElement | undefined {
    return this.options.sections.get(id)?.parentElement ?? undefined;
  }

  /**
   * The default layout again, remembered as the layout from now on. The host disposes of this
   * layout and makes a fresh one: Dockview, cleared and built again in place, can leave a panel
   * drawn where it was.
   */
  reset(): void {
    closeMenu(false);
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
      const wanted = place === "left" ? sizes.left : place === "right" ? (this.widened ? widenedWidth(width, this.leftWidth(this.options.container.getBoundingClientRect()), sizes.right) : sizes.right) : undefined;
      if (wanted && box.width > wanted * 1.3) group.api.setSize({ width: wanted });
    }
  }

  /**
   * Whether the right-hand column is widened for a solution now: a state, not a width, so a window
   * resized meanwhile keeps the column at its share of the dock (the panel's M1, 25 Oct 2026).
   */
  private widened = false;
  /** The panel the column was widened for. */
  private widenedFor?: string;
  /** Whether the reader has sized the right-hand column by dragging its sash: only that is their choice. */
  private userSized = false;
  /** Whether the first call has read the layout it was given (remembered widened, or sized by the reader). */
  private layoutRead = false;

  /** The left-hand column's width, as it is. */
  private leftWidth(dock: DOMRect): number {
    const left = this.api.groups.map((g) => g.element.getBoundingClientRect()).filter((b) => placeOf(b, dock) === "left");
    return left.length ? Math.max(...left.map((b) => b.width)) : 0;
  }

  /** The right-hand column's width, as it is, if there is one. */
  private rightWidth(): number | undefined {
    const dock = this.options.container.getBoundingClientRect();
    const right = this.api.groups.map((g) => g.element.getBoundingClientRect()).filter((b) => placeOf(b, dock) === "right");
    return right.length ? Math.max(...right.map((b) => b.width)) : undefined;
  }

  /** The widened column at its share of the dock as it now is. */
  private rewiden(): void {
    if (!this.widened || this.userSized || this.disposed || !this.widenedFor) return;
    const group = this.api.getPanel(this.widenedFor)?.group;
    const dock = this.options.container.getBoundingClientRect();
    if (!group || placeOf(group.element.getBoundingClientRect(), dock) !== "right") return;
    const to = widenedWidth(dock.width, this.leftWidth(dock), defaultSizes(dock.width, dock.height).right);
    if (Math.abs(group.element.getBoundingClientRect().width - to) > 2) group.api.setSize({ width: to });
  }

  /**
   * The column a panel is in, right of the map, widened while a TMA solution is open in it
   * (product owner, 25 Oct 2026), and put back to the default width for the dock as it now is when
   * none is. A column the reader has sized by dragging its sash, before or while widened, is left as
   * they made it; a window resized is not their choice. True if it changed.
   */
  widenFor(id: string, wide: boolean): boolean {
    const group = this.api.getPanel(id)?.group;
    if (!group || this.disposed) return false;
    const dock = this.options.container.getBoundingClientRect();
    const box = group.element.getBoundingClientRect();
    if (placeOf(box, dock) !== "right") return false;
    const sizes = defaultSizes(dock.width, dock.height);
    const to = widenedWidth(dock.width, this.leftWidth(dock), sizes.right);
    if (!this.layoutRead) {
      // A layout remembered: widened (so put back once no solution is open), or sized by the reader.
      this.layoutRead = true;
      if (Math.abs(box.width - to) <= 2 && to > sizes.right + 2) this.widened = true;
      else if (Math.abs(box.width - sizes.right) > 2) this.userSized = true;
    }
    // Don't fight the reader: a column they sized stays as they made it, widened or not.
    if (this.userSized) {
      this.widened = false;
      return false;
    }
    if (wide) {
      this.widenedFor = id;
      if (Math.abs(box.width - to) <= 2 || (!this.widened && to <= box.width + 2)) {
        this.widened = this.widened || Math.abs(box.width - to) <= 2;
        return false;
      }
      this.widened = true;
      group.api.setSize({ width: to });
      return true;
    }
    const was = this.widened;
    this.widened = false;
    if (!was || Math.abs(box.width - sizes.right) <= 2) return false;
    group.api.setSize({ width: sizes.right });
    return true;
  }

  /** Whether a panel's column is widened for a solution now. */
  get isWidened(): boolean {
    return !!this.widened;
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

  /** A panel's tab, if it has one shown. */
  tabOf(id: string): HTMLElement | undefined {
    return this.api.getPanel(id)?.view.tab.element.closest<HTMLElement>(".dv-tab") ?? undefined;
  }

  dispose(): void {
    this.disposed = true;
    closeMenu(false);
    // A change not yet written is written now: going narrow and back keeps it.
    if (this.saving !== undefined) this.save(true);
    this.observer.disconnect();
    for (const cleanup of this.cleanups) cleanup();
    this.api.dispose();
    this.options.container.replaceChildren();
  }

  // --- Building ----------------------------------------------------------------------

  /**
   * The remembered layout, or the default. A remembered layout that cannot be built, whatever is
   * wrong with it, is forgotten and the default built instead: the page always comes up.
   */
  private build(): void {
    const text = this.options.remember && !this.options.fresh ? this.read() : null;
    const layout = readLayout(text, this.ids);
    if (text && !layout) this.forget(); // not this version's, or not whole: never tried again
    if (layout) {
      try {
        this.load(layout);
        this.refold();
        return;
      } catch {
        this.forget();
      }
    }
    this.api.clear();
    this.buildDefault();
    // Built here at the default widths: nothing remembered to read.
    this.layoutRead = true;
  }

  private content(id: string): IContentRenderer {
    const element = document.createElement("div");
    // "side": the panel keeps the side column's look, docked or not.
    element.className = id === MAP_ID ? "dock-panel dock-map" : "dock-panel side";
    element.id = `dock-${id}`;
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
    const lefts: IDockviewPanel[] = [];
    const rights: IDockviewPanel[] = [];
    for (const group of groups) {
      const [first, ...rest] = group.panels;
      let lead: IDockviewPanel;
      const lastLeft = lefts[lefts.length - 1];
      const lastRight = rights[rights.length - 1];
      if (group.place === "centre") lead = this.add(first, { referencePanel: map, direction: "below" });
      else if (group.place === "left") lead = this.add(first, lastLeft ? { referencePanel: lastLeft, direction: "below" } : { direction: "left" });
      else lead = this.add(first, lastRight ? { referencePanel: lastRight, direction: "below" } : { direction: "right" });
      for (const id of rest) this.add(id, { referencePanel: lead, direction: "within" }, true);
      lead.api.setActive();
      if (group.place === "left") lefts.push(lead);
      else if (group.place === "right") rights.push(lead);
      else lead.group.api.setSize({ height: sizes.strip });
    }
    // Sizes: the columns' widths, then each column's groups' heights from the top (the last takes the rest).
    lefts[0]?.group.api.setSize({ width: sizes.left });
    rights[0]?.group.api.setSize({ width: sizes.right });
    const heights: Record<string, number> = { "panel-time": sizes.time, "panel-tote": sizes.tote, "panel-bearings": sizes.bearings };
    // Twice: setting one group's height gives or takes from its neighbours, the ones set before too.
    for (let pass = 0; pass < 2; pass++) {
      for (const lead of [...lefts.slice(0, -1), ...rights.slice(0, -1)]) {
        const height = heights[lead.id];
        if (height) lead.group.api.setSize({ height });
      }
    }
    map.api.setActive();
  }

  /** A remembered layout, checked (readLayout) and built: throws if it does not come out whole. */
  private load(layout: SerializedDockview): void {
    this.api.fromJSON(layout);
    // Names as this version has them, whatever was remembered.
    for (const panel of this.api.panels) panel.api.setTitle(this.options.titles[panel.id] ?? panel.id);
    const map = this.api.getPanel(MAP_ID);
    if (!map || map.group.panels.length !== 1 || !this.ids.every((id) => this.api.getPanel(id))) throw new Error("The remembered layout did not come out whole");
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

  /** A remembered layout that could not be built is forgotten, so the next visit starts well. */
  private forget(): void {
    try {
      this.options.storage()?.removeItem(LAYOUT_KEY);
      this.options.storage()?.removeItem(COLLAPSED_KEY);
    } catch {
      // Nothing to forget where nothing can be remembered.
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

  private mapGroup(): DockviewGroupPanel | undefined {
    return this.groupById(this.api.getPanel(MAP_ID)?.group.id);
  }

  private groupById(id: string | undefined): DockviewGroupPanel | undefined {
    return this.api.groups.find((group) => group.id === id);
  }

  /**
   * After every change: the map's group has no tabs and takes no panels as tabs (splitting beside it
   * is allowed). Screen readers get one tab list per group, named by where it is and what it holds,
   * and one tab panel per panel, named by its tab. Rendered always, a panel's content is not inside
   * its group's element, so the group is no region of its own, and Dockview's own, empty, tab panel
   * is no tab panel.
   */
  private decorate(): void {
    const mapGroup = this.mapGroup();
    if (mapGroup) {
      if (!mapGroup.header.hidden) mapGroup.header.hidden = true;
      if (mapGroup.locked !== true) mapGroup.locked = true;
    }
    for (const group of this.groups()) {
      const element = this.groupById(group.id)?.element;
      if (!element) continue;
      element.removeAttribute("role");
      element.removeAttribute("aria-label");
      element.dataset.place = group.place;
      const empty = element.querySelector<HTMLElement>(".dv-content-container");
      empty?.removeAttribute("role");
      empty?.removeAttribute("aria-labelledby");
      if (group.panels.includes(MAP_ID)) continue;
      const titles = group.panels.map((id) => this.options.titles[id] ?? id);
      element.querySelector('[role="tablist"]')?.setAttribute("aria-label", `Panels, ${group.place}: ${titles.join(", ")}`);
      element.querySelector(".dock-menu-button")?.setAttribute("aria-label", `Move ${this.options.titles[group.active ?? ""] ?? "panel"}…`);
    }
    for (const panel of this.api.panels) {
      const tab = this.tabOf(panel.id);
      if (!tab) continue;
      tab.dataset.panel = panel.id;
      tab.title = `${this.options.titles[panel.id] ?? panel.id}: drag to move; right-click, Shift+F10 or ⋯ for more`;
      const content = this.contentOf(panel.id);
      if (content) {
        content.setAttribute("role", "tabpanel");
        content.setAttribute("aria-labelledby", tab.id);
        tab.setAttribute("aria-controls", content.id);
      }
    }
  }

  /**
   * The keyboard's order through the layout (WCAG 2.4.3). Rendered always, every panel's content
   * comes after every tab strip in the page, so Tab would go through all the tabs before any panel.
   * Instead: a group's tab, then what its panel holds, then the next group's tab, from the left
   * column down, the map (and the form beside it) and what is under it, then the right; before the
   * first and after the last, the top bar. Inside a panel the page's own order holds. From inside
   * the map's frame the browser's order holds: the frame is another page.
   */
  private keyboardOrder(event: KeyboardEvent): void {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || this.disposed) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(".context-menu, .menu-panel, dialog")) return;
    const stops = this.stops();
    const at = stops.findIndex((s) => s.tab === target || s.content.includes(target));
    if (at < 0) return;
    const stop = stops[at];
    const go = (el: HTMLElement | undefined) => {
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      el.focus();
    };
    const firstOf = (s: (typeof stops)[number] | undefined) => s?.tab ?? s?.content[0];
    const lastOf = (s: (typeof stops)[number] | undefined) => (s ? (s.content[s.content.length - 1] ?? s.tab) : undefined);
    if (!event.shiftKey) {
      if (target === stop.tab) go(stop.content[0] ?? firstOf(stops[at + 1]) ?? this.options.after());
      else if (target === stop.content[stop.content.length - 1]) go(firstOf(stops[at + 1]) ?? this.options.after());
    } else {
      if (target === stop.tab) go(lastOf(stops[at - 1]) ?? this.options.before());
      else if (target === stop.content[0]) go(stop.tab ?? lastOf(stops[at - 1]) ?? this.options.before());
    }
  }

  /** Each group in reading order (columns left to right, each top down): its tab in front, and what its panel holds. */
  private stops(): { tab: HTMLElement | undefined; content: HTMLElement[] }[] {
    const dock = this.options.container.getBoundingClientRect();
    return this.api.groups
      .map((group) => {
        const box = group.element.getBoundingClientRect();
        const active = group.activePanel?.id;
        const isMap = active === MAP_ID;
        const content = isMap ? this.options.overSlot : active ? this.contentOf(active) : undefined;
        return { place: placeOf(box, dock), top: box.top, left: box.left, tab: !isMap && active ? this.tabOf(active) : undefined, content: content ? focusables(content) : [] };
      })
      .sort((a, b) => PLACE_ORDER[a.place] - PLACE_ORDER[b.place] || a.top - b.top || a.left - b.left)
      .map(({ tab, content }) => ({ tab, content }));
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
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-label", "Move panel…");
    button.title = "Move this panel to another group, or reset the layout";
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

  /** Groups folded to their tabs, by group id: the height each had, to unfold to. */
  private collapsed = new Map<string, number>();

  /** Whether a group shares its column with another, above or below it. */
  private sharesColumn(group: DockviewGroupPanel): boolean {
    const box = group.element.getBoundingClientRect();
    return this.api.groups.some((other) => {
      if (other === group) return false;
      const b = other.element.getBoundingClientRect();
      return Math.abs(b.left - box.left) < 2 && Math.abs(b.width - box.width) < 2;
    });
  }

  /** Whether a panel's group is folded to its tabs. */
  isCollapsed(id: string): boolean {
    const group = this.api.getPanel(id)?.group;
    return !!group && this.collapsed.has(group.id);
  }

  /** Fold a panel's group to its tabs, or unfold it to the height it had: the others in its column take the room. */
  toggleCollapsed(id: string): void {
    const group = this.api.getPanel(id)?.group;
    if (!group) return;
    const was = this.collapsed.get(group.id);
    if (was === undefined) {
      const strip = Math.ceil(group.element.querySelector(".dv-tabs-and-actions-container")?.getBoundingClientRect().height ?? 35);
      this.collapsed.set(group.id, group.element.getBoundingClientRect().height);
      group.api.setConstraints({ minimumHeight: strip });
      group.api.setSize({ height: strip });
    } else {
      this.collapsed.delete(group.id);
      group.api.setConstraints({ minimumHeight: 100 });
      group.api.setSize({ height: Math.max(was, 160) });
    }
    this.saveFolds();
    this.focusTab(id);
  }

  /** The folds remembered, with the layout. */
  private saveFolds(): void {
    if (!this.options.remember) return;
    try {
      const storage = this.options.storage();
      if (!this.collapsed.size) storage?.removeItem(COLLAPSED_KEY);
      else storage?.setItem(COLLAPSED_KEY, JSON.stringify(Object.fromEntries(this.collapsed)));
    } catch {
      // Not remembered: the fold still works, for this visit.
    }
  }

  /** A remembered layout's folds made again: each group folded still, if it is there and still shares its column. */
  private refold(): void {
    let folds: Record<string, unknown> = {};
    try {
      const text = this.options.storage()?.getItem(COLLAPSED_KEY);
      folds = text ? JSON.parse(text) : {};
    } catch {
      folds = {};
    }
    if (!folds || typeof folds !== "object") return;
    for (const [id, height] of Object.entries(folds)) {
      const group = this.groupById(id);
      if (!group || typeof height !== "number" || !Number.isFinite(height) || height <= 0 || height > MOST) continue;
      const strip = Math.ceil(group.element.querySelector(".dv-tabs-and-actions-container")?.getBoundingClientRect().height || 35);
      this.collapsed.set(id, height);
      group.api.setConstraints({ minimumHeight: strip });
      group.api.setSize({ height: strip });
    }
  }

  /** The menu for a panel: move it to each other group, or a group of its own; reset the layout (menu.ts). */
  openMenu(id: string, x: number, y: number, from: HTMLElement): void {
    const panel = this.api.getPanel(id);
    if (!panel || id === MAP_ID) return;
    const items: { label: string; act: () => void }[] = [];
    for (const group of this.groups()) {
      if (group.id === panel.group.id || group.panels.includes(MAP_ID)) continue;
      items.push({ label: `Move to ${group.place}: ${group.panels.map((p) => this.options.titles[p] ?? p).join(", ")}`, act: () => this.moveTo(id, group.id) });
    }
    if (panel.group.panels.length > 1) items.push({ label: "Move to a group of its own", act: () => this.moveTo(id, "own") });
    // A group sharing its column folds to its tabs, giving the rest of the column to the others (the walkthroughs under Bearings).
    if (this.sharesColumn(panel.group)) items.push({ label: this.collapsed.has(panel.group.id) ? "Expand" : "Collapse to its tabs", act: () => this.toggleCollapsed(id) });
    items.push({ label: "Reset layout", act: () => this.reset() });
    openMenu(items, { label: `${this.options.titles[id] ?? id}: move`, x, y, from, className: "dock-menu" });
  }
}
