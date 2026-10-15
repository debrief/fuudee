/**
 * The Timeline's logic, free of the page so it is tested (CAP-05, CAP-20, NFR-06):
 * which entries a filter and a search leave; which entry current time is at; the rows
 * the list shows, a day's heading before each day's first entry; where each row lies
 * in a list of tens of thousands, only those in sight being drawn; and when following
 * current time scrolls the list.
 */
import type { TimelineEntry } from "@debrief/schemas";

export type EntryKind = TimelineEntry["kind"];

/** An entry as the list works with it: its times as numbers, its day and what a search looks in. */
export interface Item {
  entry: TimelineEntry;
  ms: number;
  endMs: number;
  /** Days since 1970, UTC: entries on another day get a heading of their own. */
  day: number;
  /** Lower-cased text, source and type, made when first searched. */
  haystack?: string;
}

const DAY_MS = 86_400_000;

export function prepare(entries: readonly TimelineEntry[]): Item[] {
  return entries.map((entry) => {
    const ms = Date.parse(entry.start);
    return { entry, ms, endMs: entry.end ? Date.parse(entry.end) : ms, day: Math.floor(ms / DAY_MS) };
  });
}

/**
 * What the reader has chosen to see: kinds, sources and types left out (so a source
 * imported later is shown until left out too), and text to find. The reader's own,
 * kept in the page, never in the plot: two analysts reading one narrative want
 * different filters.
 */
export interface Filter {
  kinds: ReadonlySet<EntryKind>;
  sources: ReadonlySet<string>;
  types: ReadonlySet<string>;
  text: string;
}

export const NO_FILTER: Filter = { kinds: new Set(), sources: new Set(), types: new Set(), text: "" };

/** Whether anything is left out. */
export const filtering = (f: Filter) => f.kinds.size > 0 || f.sources.size > 0 || f.types.size > 0 || f.text.trim() !== "";

/** An entry's type as the filter knows it: "" for none. */
export const typeOf = (entry: TimelineEntry) => entry.entry_type ?? "";

function haystack(item: Item): string {
  item.haystack ??= `${item.entry.text ?? ""}\n${item.entry.source}\n${item.entry.entry_type ?? ""}`.toLowerCase();
  return item.haystack;
}

/** The indices of the items the filter leaves, in order. */
export function applyFilter(items: readonly Item[], filter: Filter): number[] {
  const needle = filter.text.trim().toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const { entry } = items[i];
    if (filter.kinds.has(entry.kind)) continue;
    if (filter.sources.has(entry.source)) continue;
    if (filter.types.has(typeOf(entry))) continue;
    if (needle && !haystack(items[i]).includes(needle)) continue;
    out.push(i);
  }
  return out;
}

export interface Facet {
  name: string;
  count: number;
}

/** Each source, type and kind with how many entries it has: most first, then by name. */
export function facets(items: readonly Item[]): { sources: Facet[]; types: Facet[]; kinds: Facet[] } {
  const count = (key: (item: Item) => string) => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
    return [...counts]
      .map(([name, n]) => ({ name, count: n }))
      .sort((a, b) => b.count - a.count || a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || (a.name < b.name ? -1 : 1));
  };
  return { sources: count((i) => i.entry.source), types: count((i) => typeOf(i.entry)), kinds: count((i) => i.entry.kind) };
}

/**
 * The visible entry current time is at: the last at or before it. Where several share
 * that time and the reader chose one of them, it is that one, so choosing an entry
 * marks the entry chosen, not the last of its second. -1 if none has come yet.
 */
export function currentIndex(items: readonly Item[], visible: readonly number[], timeMs: number, chosen?: string): number {
  let low = 0;
  let high = visible.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (items[visible[middle]].ms <= timeMs) low = middle + 1;
    else high = middle;
  }
  let at = low - 1;
  if (at >= 0 && chosen !== undefined && items[visible[at]].ms === timeMs) {
    for (let i = at; i >= 0 && items[visible[i]].ms === timeMs; i--) {
      if (items[visible[i]].entry.id === chosen) {
        at = i;
        break;
      }
    }
  }
  return at;
}

/** A row of the list: a day's heading, or an entry (its index among the items). */
export type Row = { day: number } | { item: number };

/** The list's rows: each visible entry, a day's heading before each day's first. */
export function rowsOf(items: readonly Item[], visible: readonly number[]): Row[] {
  const rows: Row[] = [];
  let day: number | undefined;
  for (const i of visible) {
    if (items[i].day !== day) {
      day = items[i].day;
      rows.push({ day });
    }
    rows.push({ item: i });
  }
  return rows;
}

/** The row an entry is in, or -1. rowOf is built once per list of rows. */
export function rowIndex(rows: readonly Row[]): Map<number, number> {
  const out = new Map<number, number>();
  rows.forEach((row, r) => "item" in row && out.set(row.item, r));
  return out;
}

/**
 * Where each row lies, for a list drawn only where it is seen (NFR-06: sixty thousand
 * entries). Rows not yet drawn have an estimated height; drawn ones their measured
 * height, kept. Offsets are summed again only when a height changes, which for sixty
 * thousand rows takes well under a millisecond.
 */
export class Layout {
  private heights: Float64Array;
  private offsets: Float64Array;
  private dirty = true;

  constructor(
    count: number,
    estimate: (row: number) => number,
  ) {
    this.heights = new Float64Array(count);
    for (let r = 0; r < count; r++) this.heights[r] = estimate(r);
    this.offsets = new Float64Array(count + 1);
  }

  get count(): number {
    return this.heights.length;
  }

  private sum(): void {
    if (!this.dirty) return;
    let y = 0;
    for (let r = 0; r < this.heights.length; r++) {
      this.offsets[r] = y;
      y += this.heights[r];
    }
    this.offsets[this.heights.length] = y;
    this.dirty = false;
  }

  /** A row's measured height; true if it changed. */
  setHeight(row: number, height: number): boolean {
    if (Math.abs(this.heights[row] - height) < 0.5) return false;
    this.heights[row] = height;
    this.dirty = true;
    return true;
  }

  height(row: number): number {
    return this.heights[row];
  }

  top(row: number): number {
    this.sum();
    return this.offsets[Math.max(0, Math.min(row, this.heights.length))];
  }

  get total(): number {
    this.sum();
    return this.offsets[this.heights.length];
  }

  /** The row at a height down the list (the last row if past the end). */
  rowAt(y: number): number {
    this.sum();
    const n = this.heights.length;
    if (n === 0) return -1;
    let low = 0;
    let high = n - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.offsets[middle] <= y) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  /** The rows to draw for a view from scrollTop, viewport high, with overscan pixels above and below. */
  range(scrollTop: number, viewport: number, overscan: number): [number, number] {
    if (this.heights.length === 0) return [0, -1];
    return [this.rowAt(Math.max(0, scrollTop - overscan)), this.rowAt(scrollTop + viewport + overscan)];
  }
}

/**
 * Following current time without fighting the reader. The list scrolls only when the
 * entry current time is at is out of the comfortable part of the view (its top tenth to
 * three quarters down), and then puts it a third of the way down, so what comes next is
 * in sight below it. Undefined: leave the scroll alone.
 */
export function followScroll(rowTop: number, rowHeight: number, scrollTop: number, viewport: number, total: number): number | undefined {
  if (viewport <= 0) return undefined;
  const top = rowTop - scrollTop;
  const bottom = top + rowHeight;
  const comfortable = top >= viewport * 0.1 && bottom <= viewport * 0.75;
  if (comfortable) return undefined;
  // Near the start of the list there is nothing above to keep in sight.
  if (rowTop + rowHeight <= viewport * 0.75 && scrollTop === 0) return undefined;
  const target = Math.max(0, Math.min(rowTop - viewport / 3, total - viewport));
  return Math.abs(target - scrollTop) < 1 ? undefined : target;
}

/** The scroll that brings a row into view with the least movement, as the keyboard moves through the list. */
export function revealScroll(rowTop: number, rowHeight: number, scrollTop: number, viewport: number): number | undefined {
  if (rowTop < scrollTop) return rowTop;
  if (rowTop + rowHeight > scrollTop + viewport) return Math.max(0, rowTop + rowHeight - viewport);
  return undefined;
}

/**
 * Whether the entry current time is at lies above or below the view, or in it; for the
 * Follow button, which says which way current time is when the reader has scrolled away.
 */
export function whereIs(rowTop: number, rowHeight: number, scrollTop: number, viewport: number): "above" | "below" | "in view" {
  if (rowTop + rowHeight <= scrollTop) return "above";
  if (rowTop >= scrollTop + viewport) return "below";
  return "in view";
}

/**
 * How many lines a text wraps to in a column so many characters wide, for an estimate
 * of a row's height before it is drawn: each line break starts a line, and each line
 * takes as many as its length needs.
 */
export function estimateLines(text: string | undefined, charsPerLine: number): number {
  if (!text) return 1;
  const per = Math.max(8, Math.floor(charsPerLine));
  let lines = 0;
  for (const line of text.split("\n")) lines += Math.max(1, Math.ceil(line.length / per));
  return lines;
}

/** Column widths in characters, from the longest source and type seen, within bounds. */
export function columnWidths(items: readonly Item[]): { source: number; type: number } {
  let source = 6;
  let type = 4;
  for (const { entry } of items) {
    if (entry.source.length > source) source = entry.source.length;
    const t = entry.entry_type?.length ?? 0;
    if (t > type) type = t;
  }
  return { source: Math.min(source, 14), type: Math.min(type, 10) };
}

/** Where a search's text is found in a string, for marking it: [start, end) pairs, not overlapping. */
export function matches(text: string, needle: string): [number, number][] {
  const n = needle.trim().toLowerCase();
  if (!n) return [];
  const lower = text.toLowerCase();
  const out: [number, number][] = [];
  for (let at = lower.indexOf(n); at >= 0; at = lower.indexOf(n, at + n.length)) out.push([at, at + n.length]);
  return out;
}
