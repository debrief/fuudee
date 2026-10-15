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

/** A step back or forward through the plot's history. */
export type HistoryMove = "undo" | "redo";

/** The parts of a key press that say which history move it asks for. */
export interface KeyChord {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Which history move a key press asks for, as VS Code's keybindings for the map, the
 * Outline and History have it: Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes; on macOS
 * Cmd+Z undoes and Cmd+Shift+Z redoes (Ctrl+Y still redoes, as there).
 */
export function historyMove(e: KeyChord, mac: boolean): HistoryMove | undefined {
  if (e.altKey) return undefined;
  const key = e.key.toLowerCase();
  const command = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (command && key === "z") return e.shiftKey ? "redo" : "undo";
  if (e.ctrlKey && !e.metaKey && !e.shiftKey && key === "y") return "redo";
  return undefined;
}

/** Input types that hold no text to undo: a checkbox, a button and the like. */
const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "image", "range", "color", "file", "hidden"]);

/**
 * Whether an element edits text: there Ctrl+Z undoes the typing, not the plot
 * (decision, product owner, 15 Oct 2026): the Timeline's search box and the entry
 * form's time, source, type and text.
 */
export function editsText(element: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!element?.tagName) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName.toUpperCase();
  if (tag === "TEXTAREA") return true;
  return tag === "INPUT" && !NOT_TEXT.has((element.type || "text").toLowerCase());
}

// --- The reader's view: highlights, choosing, text size, wrapping, columns ---------------

/** The Timeline's columns the reader may hide; the entry's text is always shown. */
export type Column = "time" | "source" | "type";
export const COLUMNS: readonly Column[] = ["time", "source", "type"];

/** Text sizes the reader steps through, in CSS pixels; 12 is the Timeline's own. */
export const TEXT_SIZES: readonly number[] = [11, 12, 14, 16, 18];
export const DEFAULT_TEXT_SIZE = 12;

/**
 * How the reader likes the Timeline (product owner, 15 Oct 2026: legacy Debrief's
 * Narrative viewer's extras): words and phrases to highlight wherever they are in an
 * entry's text; whether choosing an entry moves current time; the text's size and
 * whether long entries wrap; which columns show. The reader's own, kept in the page as
 * the filter is, never in the plot.
 */
export interface ViewSettings {
  highlights: string[];
  moveTime: boolean;
  textSize: number;
  wrap: boolean;
  hidden: Column[];
}

export const DEFAULT_VIEW: ViewSettings = { highlights: [], moveTime: true, textSize: DEFAULT_TEXT_SIZE, wrap: true, hidden: [] };

/** At most this many phrases, each at most this long: a reader's list, not a document. */
export const MAX_HIGHLIGHTS = 20;
const MAX_PHRASE = 60;

/**
 * Phrases to highlight from what the reader typed: separated by commas or new lines,
 * trimmed, spaces inside kept; each once, ignoring case, in the order first typed.
 */
export function parseHighlights(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[,\n]/)) {
    const phrase = raw.trim().replace(/\s+/g, " ").slice(0, MAX_PHRASE);
    const key = phrase.toLowerCase();
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length === MAX_HIGHLIGHTS) break;
  }
  return out;
}

/** The view kept from an earlier visit, checked: anything unreadable is the default. */
export function readView(raw: unknown): ViewSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_VIEW };
  const value = raw as Record<string, unknown>;
  const highlights = Array.isArray(value.highlights) ? parseHighlights(value.highlights.filter((h): h is string => typeof h === "string").join(",")) : [];
  const size = typeof value.textSize === "number" && TEXT_SIZES.includes(value.textSize) ? value.textSize : DEFAULT_TEXT_SIZE;
  const hidden = Array.isArray(value.hidden) ? COLUMNS.filter((c) => (value.hidden as unknown[]).includes(c)) : [];
  return { highlights, moveTime: value.moveTime !== false, textSize: size, wrap: value.wrap !== false, hidden };
}

/** One step smaller or larger, within the sizes offered; the same size at either end. */
export function stepTextSize(size: number, step: -1 | 1): number {
  const at = TEXT_SIZES.indexOf(size);
  const from = at < 0 ? TEXT_SIZES.indexOf(DEFAULT_TEXT_SIZE) : at;
  return TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, from + step))];
}

/** A line's height for a text size: four thirds of it, as the Timeline's 16 px for 12 px. */
export const lineHeight = (size: number) => Math.round((size * 4) / 3);

/** Whether the reader has changed anything from the Timeline's own view. */
export const viewChanged = (v: ViewSettings) =>
  v.highlights.length > 0 || !v.moveTime || v.textSize !== DEFAULT_TEXT_SIZE || !v.wrap || v.hidden.length > 0;

/**
 * The columns of the list's grid for the columns shown: widths as CSS, and the column
 * the entry's text starts in on a narrow list, where it goes under the time, source and
 * type, aligned with the source (with the time hidden, from the left edge).
 */
export function gridOf(hidden: readonly Column[], narrow: boolean): { columns: string; textFrom: number } {
  const shows = (c: Column) => !hidden.includes(c);
  const width: Record<Column, string> = { time: "var(--tl-time)", source: "var(--tl-source)", type: "var(--tl-type)" };
  if (!narrow) {
    const columns = [...COLUMNS.filter(shows).map((c) => width[c]), "minmax(0, 1fr)"];
    return { columns: columns.join(" "), textFrom: columns.length };
  }
  const columns = [...(shows("time") ? [width.time] : []), "minmax(0, 1fr)", ...(shows("type") ? ["auto"] : [])];
  return { columns: columns.join(" "), textFrom: shows("time") ? 2 : 1 };
}

/** A span of text to mark: what the search found, or a phrase the reader highlights. */
export interface Mark {
  start: number;
  end: number;
  kind: "found" | "highlight";
}

/**
 * Where a text is marked: the search's matches, and the reader's phrases, ignoring case;
 * never overlapping. Where the two meet, the search wins (it is what the reader is
 * looking for now); among phrases, the longest at a place wins, so "contact lost" is
 * marked whole, not just "contact".
 */
export function marks(text: string, needle: string, highlights: readonly string[]): Mark[] {
  const lower = text.toLowerCase();
  const taken = new Uint8Array(text.length);
  const out: Mark[] = [];
  const claim = (start: number, end: number, kind: Mark["kind"]) => {
    for (let i = start; i < end; i++) if (taken[i]) return;
    taken.fill(1, start, end);
    out.push({ start, end, kind });
  };
  for (const [start, end] of matches(text, needle)) claim(start, end, "found");
  const phrases = [...new Set(highlights.map((h) => h.trim().toLowerCase()).filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    for (let at = lower.indexOf(phrase); at >= 0; at = lower.indexOf(phrase, at + phrase.length)) claim(at, at + phrase.length, "highlight");
  }
  return out.sort((a, b) => a.start - b.start);
}
