/**
 * The playground's Outline as a tree (product owner, 27 Oct 2026): a TMA solution opens to its
 * legs and each leg to its positions, a sensor to its cuts, a track to its sensors. The tree is
 * virtualised: only the rows in sight (and some either side, and the one with the keyboard) are
 * in the page, the rest stood in for by spacers, so a sensor's thousands of cuts scroll as easily
 * as a dozen tracks. Each row keeps its level, its place and how many share it (aria-level,
 * aria-posinset, aria-setsize), so the tree reads the same to a screen reader whatever is drawn.
 *
 * The keyboard is the WAI-ARIA tree's (webview/outlinetree.ts): one tab stop, the arrow keys to
 * move and to open and close, Shift with them to extend the selection, Enter or Space to select,
 * Ctrl to add, Shift+F10 or the menu key for a row's menu. Click, Shift-click a range, Ctrl-click
 * to add. What the rows say and what a selection means are the host's.
 */
import { flatten, rowsInWindow, treeClick, treeKey, type FlatRow, type TreeMove, type TreeNode } from "../webview/outlinetree.js";

export interface OutlineTreeHost<T> {
  /** The tree's top rows, their children made as they open. */
  roots(): TreeNode<T>[];
  /** Fill a row's element with what it says (its name, its details, its tags). */
  fill(row: FlatRow<T>, element: HTMLLIElement): void;
  /** The analyst chose rows (a click, a key): the host selects what they stand for. */
  chose(keys: string[]): void;
  /** A row's menu: right-click, press and hold, Shift+F10 or the menu key. */
  menu?(key: string, x: number, y: number, element: HTMLElement): void;
}

/** A row's height before one is measured: one line of the panel's text. */
const ROW_GUESS_PX = 22;

export class OutlineTree<T> {
  /** The branches open, by key. */
  readonly open = new Set<string>();
  private rows: FlatRow<T>[] = [];
  private selected: string[] = [];
  private focusKey?: string;
  private anchorKey?: string;
  private rowPx = ROW_GUESS_PX;
  private shown = "";
  private pending = false;
  private readonly elements = new Map<string, HTMLLIElement>();

  constructor(
    private readonly list: HTMLElement,
    private readonly host: OutlineTreeHost<T>,
  ) {
    list.setAttribute("role", "tree");
    list.setAttribute("aria-multiselectable", "true");
    list.addEventListener("scroll", () => this.soon());
    list.addEventListener("keydown", (e) => this.key(e));
    list.addEventListener("click", (e) => this.click(e));
    list.addEventListener("contextmenu", (e) => {
      const element = (e.target as HTMLElement).closest<HTMLLIElement>("li[data-id]");
      if (!element || !this.host.menu) return;
      e.preventDefault();
      this.host.menu(element.dataset.id!, e.clientX, e.clientY, element);
    });
    new ResizeObserver(() => this.soon()).observe(list);
  }

  /** The keys selected. */
  get selection(): readonly string[] {
    return this.selected;
  }

  /** The rows of the open branches, as listed: for tests and the host. */
  get flat(): readonly FlatRow<T>[] {
    return this.rows;
  }

  /** Everything listed again (a plot read, a step saved): the selection and the branches open kept where they still are. */
  refresh(): void {
    this.rows = flatten(this.host.roots(), this.open);
    const keys = new Set(this.rows.map((r) => r.key));
    for (const key of [...this.elements.keys()]) if (!keys.has(key)) this.elements.delete(key);
    if (this.focusKey && !keys.has(this.focusKey)) this.focusKey = undefined;
    this.shown = "";
    this.draw();
  }

  /**
   * A selection made elsewhere (the map, Bearings, a command), or by the host: those rows selected,
   * the branches above them opened (ancestors, outermost first) and the last brought into sight.
   */
  select(keys: string[], ancestors: string[] = []): void {
    let opened = false;
    for (const key of ancestors) {
      if (!this.open.has(key)) {
        this.open.add(key);
        opened = true;
      }
    }
    this.selected = [...keys];
    if (opened) this.rows = flatten(this.host.roots(), this.open);
    const last = keys[keys.length - 1];
    const index = last ? this.rows.findIndex((r) => r.key === last) : -1;
    if (index >= 0) {
      this.focusKey = last;
      this.anchorKey ??= last;
    }
    this.shown = "";
    this.draw();
    if (index >= 0) this.bringIntoSight(index, true);
  }

  /** The selection alone, as the host has it now (no branch opened, nothing scrolled). */
  mark(keys: string[]): void {
    this.selected = [...keys];
    this.shown = "";
    this.draw();
  }

  /** A branch opened or closed: the keyboard kept on the row it was on, or on the branch if it was inside it. */
  setOpen(key: string, open: boolean): void {
    if (open === this.open.has(key)) return;
    if (open) this.open.add(key);
    else {
      this.open.delete(key);
      const focus = this.rows.findIndex((r) => r.key === this.focusKey);
      const branch = this.rows.findIndex((r) => r.key === key);
      if (focus > branch && this.isInside(focus, branch)) this.focusKey = key;
    }
    this.refresh();
  }

  private isInside(index: number, branch: number): boolean {
    for (let i = this.rows[index].parent; i >= 0; i = this.rows[i].parent) if (i === branch) return true;
    return false;
  }

  /**
   * A row brought into sight in the list (never the page, nor a docked panel): centred, or just
   * into sight. A row not in the page yet is reached by its estimated place first.
   */
  private bringIntoSight(index: number, centre: boolean): void {
    let element = this.elements.get(this.rows[index].key);
    if (!element?.isConnected) {
      this.list.scrollTop = Math.max(0, index * this.rowPx - this.list.clientHeight / 2);
      this.shown = "";
      this.draw();
      element = this.elements.get(this.rows[index].key);
    }
    if (!element?.isConnected) return;
    const list = this.list.getBoundingClientRect();
    const row = element.getBoundingClientRect();
    if (row.top >= list.top && row.bottom <= list.bottom) return;
    if (centre) this.list.scrollTop += row.top - list.top - (list.height - row.height) / 2;
    else this.list.scrollTop += row.top < list.top ? row.top - list.top : row.bottom - list.bottom;
    this.soon();
  }

  private soon(): void {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.draw();
    });
  }

  /** The rows in sight, and some either side, in the page; spacers for the rest. */
  private draw(): void {
    const focus = this.focusIndex();
    const wanted = rowsInWindow(this.list.scrollTop, this.list.clientHeight || 400, this.rowPx, this.rows.length, focus);
    const key = `${wanted[0]}:${wanted[wanted.length - 1]}:${focus}:${this.rows.length}`;
    if (key === this.shown) return;
    this.shown = key;
    const hadFocus = this.list.contains(document.activeElement) && document.activeElement !== this.list;
    const children: HTMLElement[] = [];
    const spacer = (rows: number) => {
      const li = document.createElement("li");
      li.className = "tree-spacer";
      li.setAttribute("role", "none");
      li.setAttribute("aria-hidden", "true");
      li.style.height = `${rows * this.rowPx}px`;
      return li;
    };
    let next = 0;
    for (const i of wanted) {
      if (i > next) children.push(spacer(i - next));
      children.push(this.element(i, i === focus));
      next = i + 1;
    }
    if (next < this.rows.length) children.push(spacer(this.rows.length - next));
    this.list.replaceChildren(...children);
    // One row's height, once drawn, so the spacers stand for the rows they replace.
    const sample = children.find((c) => c.matches("li[data-id]:not(.tall)"));
    if (sample && sample.offsetHeight > 0) this.rowPx = sample.offsetHeight;
    if (hadFocus && focus >= 0) this.elements.get(this.rows[focus].key)?.focus({ preventScroll: true });
  }

  private focusIndex(): number {
    const i = this.focusKey ? this.rows.findIndex((r) => r.key === this.focusKey) : -1;
    if (i >= 0) return i;
    const first = this.rows.findIndex((r) => this.selected.includes(r.key));
    return first >= 0 ? first : this.rows.length ? 0 : -1;
  }

  private element(index: number, focus: boolean): HTMLLIElement {
    const row = this.rows[index];
    let li = this.elements.get(row.key);
    if (!li) {
      li = document.createElement("li");
      li.dataset.id = row.key;
      li.setAttribute("role", "treeitem");
      this.elements.set(row.key, li);
    }
    const selected = this.selected.includes(row.key);
    li.tabIndex = focus ? 0 : -1;
    li.setAttribute("aria-level", String(row.level));
    li.setAttribute("aria-setsize", String(row.setsize));
    li.setAttribute("aria-posinset", String(row.posinset));
    li.setAttribute("aria-selected", String(selected));
    if (row.node.branch) li.setAttribute("aria-expanded", String(row.expanded));
    else li.removeAttribute("aria-expanded");
    li.classList.toggle("selected", selected);
    li.style.setProperty("--level", String(row.level - 1));
    li.replaceChildren();
    if (row.node.branch) {
      const twisty = document.createElement("span");
      twisty.className = "twisty";
      twisty.setAttribute("aria-hidden", "true");
      twisty.textContent = row.expanded ? "▾" : "▸";
      li.append(twisty);
    } else {
      const gap = document.createElement("span");
      gap.className = "twisty";
      gap.setAttribute("aria-hidden", "true");
      li.append(gap);
    }
    this.host.fill(row, li);
    return li;
  }

  private apply(move: TreeMove): void {
    this.focusKey = this.rows[move.focus]?.key;
    this.anchorKey = this.rows[move.anchor]?.key;
    if (move.open || move.close) {
      this.setOpen((move.open ?? move.close)!, !!move.open);
    }
    if (move.select) {
      this.selected = move.select;
      this.host.chose(move.select);
    }
    const index = this.focusIndex();
    this.shown = "";
    this.draw();
    if (index >= 0) {
      this.bringIntoSight(index, false);
      this.elements.get(this.rows[index].key)?.focus({ preventScroll: true });
    }
  }

  private key(event: KeyboardEvent): void {
    const element = (event.target as HTMLElement).closest<HTMLLIElement>("li[data-id]");
    if (!element) return;
    if (this.host.menu && (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))) {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      return this.host.menu(element.dataset.id!, box.left + 24, box.bottom, element);
    }
    const index = this.rows.findIndex((r) => r.key === element.dataset.id);
    const anchor = this.anchorKey ? this.rows.findIndex((r) => r.key === this.anchorKey) : -1;
    const page = Math.max(1, Math.floor((this.list.clientHeight || 400) / this.rowPx) - 1);
    const move = treeKey(this.rows, index, anchor, this.selected, { key: event.key, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey }, page);
    if (!move) return;
    event.preventDefault();
    this.apply(move);
  }

  private click(event: MouseEvent): void {
    const element = (event.target as HTMLElement).closest<HTMLLIElement>("li[data-id]");
    if (!element) return;
    const index = this.rows.findIndex((r) => r.key === element.dataset.id);
    if (index < 0) return;
    if ((event.target as HTMLElement).closest(".twisty") && this.rows[index].node.branch) {
      this.focusKey = this.rows[index].key;
      return this.setOpen(this.rows[index].key, !this.rows[index].expanded);
    }
    const anchor = this.anchorKey ? this.rows.findIndex((r) => r.key === this.anchorKey) : -1;
    this.apply(treeClick(this.rows, index, anchor, this.selected, { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey }));
  }
}
