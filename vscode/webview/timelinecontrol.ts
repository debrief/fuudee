/**
 * The Timeline (CAP-05, CAP-19, CAP-20): narrative entries, time-only annotations and
 * fix comments in one list on one Zulu time axis; the product owner's decision of
 * 15 Oct 2026 that the narrative is read here, not in a view of its own.
 *
 * One component for every host: VS Code shows it as the Timeline view in the Debrief
 * sidebar (webview/timeline.ts), the playground in its Timeline panel.
 *
 * - A quiet table: column headings once (Time, Source, Type, Entry), then a row an
 *   entry, the time in monospace, the source with its track's colour, the type quieter,
 *   the text wrapping. A day's date heads its first entry. Where the list is narrow (a
 *   sidebar, a phone) the text goes under the time, source and type, aligned with the
 *   source. Entries outside the time window are drawn fainter; notes and fix comments
 *   hidden on the map say so.
 * - Following current time: the entry current time is at (the last at or before it) is
 *   marked, and the list keeps it in sight, scrolling only when it leaves the middle of
 *   the view, and then placing it a third of the way down so what comes next is seen.
 *   The keyboard is never moved. Scrolling the list yourself, or moving through it with
 *   the keyboard, stops following; a button (Follow, with an arrow to where current time
 *   is) starts it again, as does choosing an entry.
 * - Choosing an entry (click, tap, Enter or Space) moves current time to it (CAP-05);
 *   where several share a second, the one chosen is the one marked.
 * - Filter by kind, source and type, and search the text; the reader's own, kept in the
 *   page, never in the plot.
 * - Pressing Play follows current time again (product owner, 15 Oct 2026); scrolling away
 *   while it plays stops following again, as at any other time.
 * - Narrative entries are added (+, or N), changed (Edit, F2 or double-click) and deleted
 *   (Delete) in a form here, each one step in the plot's history, undone like any other.
 * - A box, Narrative on the map, turns off and on the map's box beside a track showing
 *   the entry current time is at: the plot's choice (its island), not the reader's.
 * - Tens of thousands of entries (NFR-06): only the rows in sight are drawn, each
 *   measured once drawn; the rest are estimated from their text's length.
 */
import { DEFAULT_SETTINGS, formatTime, type FormatSettings } from "@debrief/kernel";
import type { NarrativeSpec, TimeState, TimelineEntry, ToteTrack } from "@debrief/schemas";
import { parseTime, TIME_EXAMPLES } from "../src/timeinput.js";
import {
  applyFilter,
  columnWidths,
  currentIndex,
  estimateLines,
  facets,
  filtering,
  followScroll,
  Layout,
  matches,
  NO_FILTER,
  prepare,
  revealScroll,
  rowIndex,
  rowsOf,
  typeOf,
  whereIs,
  type EntryKind,
  type Filter,
  type Item,
  type Row,
} from "./timelinelogic.js";

export interface TimelineHost {
  /** The reader chose an entry: move current time to it. */
  choose(id: string): void;
  /** Add a narrative entry, or change the one named. The host answers with saved(). */
  save(spec: NarrativeSpec, id?: string): void;
  /** Delete a narrative entry. */
  remove(id: string): void;
  /** The reader turned the narrative box on the map on or off: save it in the plot's island. */
  narrativeOnMap?(on: boolean): void;
}

/** What the host tells the Timeline of the open plot. */
export interface TimelineShown {
  entries?: TimelineEntry[];
  tracks?: ToteTrack[];
  /** Which plot it is: the same plot shown again keeps the reader's place; another is read from current time. */
  plotId?: string;
  /** Whether the map shows the entry current time is at beside its track; left out, it does. */
  narrativeOnMap?: boolean;
}

/** Where the reader's filter is kept between visits: the page's own storage, guarded. */
export interface TimelineMemory {
  load(): unknown;
  save(value: unknown): void;
}

const KIND_WORDS: Record<EntryKind, string> = { narrative: "Narrative", annotation: "Notes and periods", fix_comment: "Fix comments" };
const NARROW_PX = 420;
const LINE_PX = 16;
const ROW_PAD_PX = 6;
const DAY_PX = 24;
const OVERSCAN_PX = 400;
const DATED: FormatSettings = { ...DEFAULT_SETTINGS, time_style: "date_time" };

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/** Text with a search's matches marked, escaped. */
function marked(text: string, needle: string): string {
  const found = matches(text, needle);
  if (!found.length) return escape(text);
  let out = "";
  let at = 0;
  for (const [start, end] of found) {
    out += escape(text.slice(at, start)) + `<mark>${escape(text.slice(start, end))}</mark>`;
    at = end;
  }
  return out + escape(text.slice(at));
}

export class TimelineControl {
  private items: Item[] = [];
  /** Each entry's index among the items, by id. */
  private itemIndex = new Map<string, number>();
  private tracks: ToteTrack[] = [];
  private opened = false;
  private plotId?: string;
  private playing = false;
  private time?: TimeState;
  private filter: Filter = NO_FILTER;
  private visible: number[] = [];
  private rows: Row[] = [];
  private rowOfItem = new Map<number, number>();
  private layout = new Layout(0, () => 0);
  /** Drawn rows, by row index. */
  private drawn = new Map<number, HTMLElement>();
  /** The entry current time is at, as an index into visible; -1 for none. */
  private current = -1;
  /** The entry the keyboard is on, as an index into visible; -1 for none. */
  private active = -1;
  /** The entry last chosen, so it is the one marked among those sharing its second. */
  private chosen?: string;
  private following = true;
  private narrow = false;
  private charPx = 7;
  private widthPx = 0;
  /**
   * When the reader last turned a wheel, touched the list or pressed a key in it, and
   * whether they are dragging its scrollbar: a scroll then is theirs. Any other scroll
   * (this component's own, or the browser keeping the list in range as it is resized or
   * filtered) is not, and never stops following.
   */
  private readerAt = 0;
  private dragging = false;
  /** Where this component last scrolled the list to, so the scroll event that follows is known as its own. */
  private ownScroll?: number;
  private frame?: number;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private editing?: string;
  private said?: ReturnType<typeof setTimeout>;
  /** Milliseconds each list was drawn in, for the NFR-06 check. */
  readonly drawTimes: number[] = [];

  private readonly search: HTMLInputElement;
  private readonly filterButton: HTMLButtonElement;
  private readonly filterPanel: HTMLElement;
  private readonly addButton: HTMLButtonElement;
  private readonly head: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly spacer: HTMLElement;
  private readonly followButton: HTMLButtonElement;
  private readonly empty: HTMLElement;
  private readonly status: HTMLElement;
  private readonly onMap: HTMLInputElement;
  private readonly form: HTMLFormElement;
  private readonly measure: HTMLElement;

  constructor(
    private readonly element: HTMLElement,
    private readonly host: TimelineHost,
    private readonly settings: FormatSettings = DEFAULT_SETTINGS,
    private readonly memory?: TimelineMemory,
  ) {
    element.classList.add("tl");
    element.innerHTML =
      `<div class="tl-bar">` +
      `<input type="search" class="tl-search" placeholder="Search" aria-label="Search the Timeline" spellcheck="false">` +
      `<button type="button" class="tl-follow" hidden title="Follow current time again">Follow time</button>` +
      `<button type="button" class="tl-filter-button" aria-expanded="false" aria-haspopup="true" title="Choose which kinds, sources and types are listed">Filter</button>` +
      `<button type="button" class="tl-add" title="Add a narrative entry (N)" aria-label="Add a narrative entry">+</button>` +
      `</div>` +
      `<div class="tl-filter" role="group" aria-label="Filter the Timeline" hidden></div>` +
      `<form class="tl-form" hidden novalidate></form>` +
      `<div class="tl-head" aria-hidden="true"><span>Time</span><span>Source</span><span>Type</span><span class="tl-head-text">Entry</span></div>` +
      `<div class="tl-body">` +
      `<div class="tl-scroll" role="listbox" tabindex="0" aria-label="Narrative, notes and periods in time order: Enter moves current time to the entry">` +
      `<div class="tl-spacer"></div></div>` +
      `<p class="tl-empty" hidden></p>` +
      `</div>` +
      `<div class="tl-foot"><p class="tl-status" aria-live="polite"></p>` +
      `<label class="tl-on-map" title="Show the entry current time is at beside its track on the map, for everyone who opens this plot">` +
      `<input type="checkbox" checked>Narrative on the map</label></div>` +
      `<span class="tl-measure" aria-hidden="true">${"x".repeat(40)}</span>`;
    const $ = <T extends HTMLElement>(s: string) => element.querySelector<T>(s)!;
    this.search = $(".tl-search");
    this.filterButton = $(".tl-filter-button");
    this.filterPanel = $(".tl-filter");
    this.addButton = $(".tl-add");
    this.head = $(".tl-head");
    this.scroller = $(".tl-scroll");
    this.spacer = $(".tl-spacer");
    this.followButton = $(".tl-follow");
    this.empty = $(".tl-empty");
    this.status = $(".tl-status");
    this.onMap = $<HTMLInputElement>(".tl-on-map input");
    this.onMap.disabled = true;
    this.form = $(".tl-form");
    this.measure = $(".tl-measure");
    this.filter = this.remembered();

    this.search.addEventListener("input", () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.setFilter({ ...this.filter, text: this.search.value }), 90);
    });
    this.search.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.search.value) {
        event.preventDefault();
        this.search.value = "";
        this.setFilter({ ...this.filter, text: "" });
      } else if (event.key === "ArrowDown" || (event.key === "Escape" && !this.search.value)) {
        event.preventDefault();
        this.scroller.focus();
      }
    });
    this.filterButton.addEventListener("click", () => this.toggleFilter());
    this.filterPanel.addEventListener("change", (event) => this.filterChanged(event.target as HTMLInputElement));
    this.filterPanel.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest(".tl-show-all")) this.setFilter({ ...NO_FILTER, text: this.filter.text }, true);
    });
    this.filterPanel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.toggleFilter(false);
      this.filterButton.focus();
    });
    this.addButton.addEventListener("click", () => this.openForm());
    this.followButton.addEventListener("click", () => this.follow());
    this.onMap.addEventListener("change", () => {
      this.host.narrativeOnMap?.(this.onMap.checked);
      this.say(this.onMap.checked ? "Narrative shown on the map." : "Narrative taken off the map.");
    });
    this.scroller.addEventListener("scroll", () => this.scrolled());
    const reader = () => (this.readerAt = performance.now());
    for (const kind of ["wheel", "touchmove"]) this.scroller.addEventListener(kind, reader, { passive: true });
    // A press on the list itself, not on a row, is on its scrollbar. (The keys that move
    // through the list stop following themselves: see key.)
    this.scroller.addEventListener("pointerdown", (event) => {
      if (event.target === this.scroller) this.dragging = true;
    });
    window.addEventListener("pointerup", () => (this.dragging = false));
    this.scroller.addEventListener("click", (event) => this.clicked(event));
    this.scroller.addEventListener("dblclick", (event) => {
      const id = this.rowEntry(event.target as HTMLElement);
      if (id && this.entry(id)?.kind === "narrative") this.openForm(id);
    });
    this.scroller.addEventListener("keydown", (event) => this.key(event));
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submit();
    });
    this.form.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeForm();
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.submit();
      }
    });
    new ResizeObserver(() => this.resized()).observe(this.scroller);
    this.rebuild();
  }

  // --- What the host tells it ---------------------------------------------------------

  /** The plot's entries and tracks; nothing for no plot. */
  show(state: TimelineShown | undefined): void {
    this.opened = !!state;
    if (state?.tracks) this.tracks = state.tracks;
    if (!state) this.tracks = [];
    // Another plot, or none: read it from current time, with nothing of the last one's kept.
    const another = !state || state.plotId !== this.plotId;
    this.plotId = state?.plotId;
    const keep = another ? undefined : this.activeId();
    if (another) {
      this.following = true;
      this.chosen = undefined;
    }
    this.items = prepare(state?.entries ?? []);
    this.itemIndex = new Map(this.items.map((item, i) => [item.entry.id, i]));
    this.onMap.checked = state?.narrativeOnMap !== false;
    this.onMap.disabled = !state;
    this.rebuild(keep);
  }

  /**
   * Current time started or stopped playing. Starting follows current time again
   * (product owner, 15 Oct 2026); the reader scrolling away while it plays stops
   * following again, as at any time.
   */
  setPlaying(playing: boolean): void {
    const started = playing && !this.playing;
    this.playing = playing;
    if (started && !this.following) this.follow();
  }

  /** Current time and the window shown. */
  setTime(time: TimeState | undefined): void {
    const before = this.time;
    this.time = time;
    const windowChanged = before?.range.start !== time?.range.start || before?.range.end !== time?.range.end;
    if (this.chosen && time && this.entry(this.chosen) && Date.parse(this.entry(this.chosen)!.start) !== Date.parse(time.current)) this.chosen = undefined;
    const moved = this.updateCurrent();
    if (windowChanged) for (const [row, el] of this.drawn) this.styleRow(el, row);
    if (moved && this.following) this.schedule();
    else this.showFollow();
  }

  /** The host's answer to a save: the entry added or changed, or why it was not. */
  saved(id?: string, message?: string): void {
    if (message) {
      this.formError(message);
      return;
    }
    this.closeForm(false);
    if (id) {
      this.reveal(id);
      this.say("Saved. Undo takes it back.");
    }
  }

  /** Open the form to add an entry (no id) or change one. */
  openForm(id?: string): void {
    const entry = id ? this.entry(id) : undefined;
    if (id && entry?.kind !== "narrative") return;
    if (!this.opened) return this.say("Open a plot first.");
    this.editing = id;
    const when = entry ? Date.parse(entry.start) : this.time ? Date.parse(this.time.current) : undefined;
    const sources = facets(this.items).sources.map((s) => s.name);
    const types = facets(this.items.filter((i) => i.entry.kind === "narrative")).types.map((t) => t.name).filter(Boolean);
    const options = (values: string[]) => values.map((v) => `<option value="${escape(v)}"></option>`).join("");
    const tracks = `<option value="">None</option>` + this.tracks.map((t) => `<option value="${escape(t.id)}">${escape(t.name)}</option>`).join("");
    this.form.innerHTML =
      `<p class="tl-form-title">${entry ? "Change narrative entry" : "Add a narrative entry"}</p>` +
      `<label><span>Time</span><input name="time" autocomplete="off" spellcheck="false" value="${when !== undefined ? escape(formatTime(when, DATED)) : ""}" title="${escape(TIME_EXAMPLES)}"></label>` +
      `<label><span>Source</span><input name="source" list="tl-sources" autocomplete="off" value="${escape(entry?.source ?? "")}"></label>` +
      `<label><span>Type</span><input name="type" list="tl-types" autocomplete="off" value="${escape(entry?.entry_type ?? "")}" placeholder="Optional"></label>` +
      `<label><span>Track</span><select name="track">${tracks}</select></label>` +
      `<label class="tl-form-text"><span>Entry</span><textarea name="text" rows="3">${escape(entry?.text ?? "")}</textarea></label>` +
      `<datalist id="tl-sources">${options(sources)}</datalist><datalist id="tl-types">${options(types)}</datalist>` +
      `<p class="tl-form-error" role="alert"></p>` +
      `<div class="tl-form-buttons"><button type="submit" class="tl-primary">${entry ? "Save" : "Add"}</button><button type="button" class="tl-cancel">Cancel</button>` +
      (entry ? `<button type="button" class="tl-delete">Delete</button>` : "") +
      `</div>`;
    const track = this.form.elements.namedItem("track") as HTMLSelectElement;
    const source = this.form.elements.namedItem("source") as HTMLInputElement;
    track.value = entry?.track ?? "";
    let trackTouched = !!entry;
    track.addEventListener("change", () => (trackTouched = true));
    // A new entry belongs to the track of its source's name, until a track is chosen.
    source.addEventListener("input", () => {
      if (trackTouched) return;
      const name = source.value.trim().toLowerCase();
      track.value = this.tracks.find((t) => t.name.toLowerCase() === name)?.id ?? "";
    });
    this.form.querySelector(".tl-cancel")!.addEventListener("click", () => this.closeForm());
    this.form.querySelector(".tl-delete")?.addEventListener("click", () => {
      const gone = this.editing;
      this.closeForm(false);
      if (gone) this.removeEntry(gone);
    });
    this.form.hidden = false;
    this.element.classList.add("tl-editing");
    ((entry ? this.form.elements.namedItem("text") : source) as HTMLElement).focus();
  }

  /** What the Timeline shows, for tests and agents. */
  get state() {
    const at = this.current >= 0 ? this.items[this.visible[this.current]].entry.id : undefined;
    return {
      entries: this.items.length,
      listed: this.visible.length,
      current: at,
      active: this.activeId(),
      following: this.following,
      playing: this.playing,
      narrativeOnMap: this.onMap.checked,
      drawn: this.drawn.size,
      filter: { kinds: [...this.filter.kinds], sources: [...this.filter.sources], types: [...this.filter.types], text: this.filter.text },
    };
  }

  // --- Building the list ----------------------------------------------------------------

  private rebuild(keepActive?: string): void {
    const started = performance.now();
    this.visible = applyFilter(this.items, this.filter);
    this.rows = rowsOf(this.items, this.visible);
    this.rowOfItem = rowIndex(this.rows);
    const widths = columnWidths(this.items);
    this.element.style.setProperty("--tl-source", `${widths.source + 2}ch`);
    this.element.style.setProperty("--tl-type", `${widths.type + 1}ch`);
    this.makeLayout();
    for (const el of this.drawn.values()) el.remove();
    this.drawn.clear();
    this.spacer.style.height = `${this.layout.total}px`;
    this.active = keepActive ? this.visibleIndexOf(keepActive) : -1;
    this.current = -1;
    this.updateCurrent();
    this.renderFilter();
    this.renderEmpty();
    this.scroller.setAttribute("aria-activedescendant", "");
    if (this.following) this.schedule();
    else this.draw();
    this.drawTimes.push(performance.now() - started);
  }

  private makeLayout(): void {
    const narrow = this.narrow;
    const textPx = Math.max(80, this.widthPx - (narrow ? 0 : this.fixedColumnsPx()) - 16);
    const chars = textPx / this.charPx;
    this.layout = new Layout(this.rows.length, (r) => {
      const row = this.rows[r];
      if ("day" in row) return DAY_PX;
      const entry = this.items[row.item].entry;
      const lines = estimateLines(this.textOf(entry), chars);
      return (narrow ? lines + 1 : lines) * LINE_PX + ROW_PAD_PX;
    });
  }

  private fixedColumnsPx(): number {
    const style = getComputedStyle(this.element);
    const ch = (name: string) => parseFloat(style.getPropertyValue(name)) || 10;
    return (9 + ch("--tl-source") + ch("--tl-type")) * this.charPx + 24;
  }

  private textOf(entry: TimelineEntry): string {
    const until = entry.end ? `Until ${formatTime(Date.parse(entry.end), this.settings)}` : "";
    return [until, entry.text ?? ""].filter(Boolean).join(entry.text ? ". " : "");
  }

  private resized(): void {
    const width = this.scroller.clientWidth;
    if (!width || Math.abs(width - this.widthPx) < 1) return;
    this.widthPx = width;
    const narrow = width < NARROW_PX;
    this.narrow = narrow;
    this.element.classList.toggle("tl-narrow", narrow);
    this.charPx = Math.max(4, this.measure.getBoundingClientRect().width / 40) || 7;
    // Keep the row at the top of the view where it is while every height is estimated again.
    const top = this.layout.rowAt(this.scroller.scrollTop);
    this.makeLayout();
    for (const el of this.drawn.values()) el.remove();
    this.drawn.clear();
    this.spacer.style.height = `${this.layout.total}px`;
    if (top >= 0 && !this.following) this.scrollTo(this.layout.top(top));
    this.schedule();
  }

  private remembered(): Filter {
    try {
      const raw = this.memory?.load() as { kinds?: string[]; sources?: string[]; types?: string[] } | undefined;
      if (!raw || typeof raw !== "object") return NO_FILTER;
      const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
      return { kinds: new Set(strings(raw.kinds) as EntryKind[]), sources: new Set(strings(raw.sources)), types: new Set(strings(raw.types)), text: "" };
    } catch {
      return NO_FILTER;
    }
  }

  private setFilter(filter: Filter, keepFocus = false): void {
    this.filter = filter;
    try {
      this.memory?.save({ kinds: [...filter.kinds], sources: [...filter.sources], types: [...filter.types] });
    } catch {
      // Not remembered: the filter still applies on this visit.
    }
    const focus = keepFocus ? document.activeElement : undefined;
    this.rebuild(this.activeId());
    if (focus instanceof HTMLElement && this.element.contains(focus)) focus.focus();
  }

  // --- The filter -----------------------------------------------------------------------

  private toggleFilter(open = this.filterPanel.hidden): void {
    this.filterPanel.hidden = !open;
    this.filterButton.setAttribute("aria-expanded", String(open));
    if (open) {
      this.renderFilter();
      this.filterPanel.querySelector<HTMLInputElement>("input")?.focus();
    }
  }

  private renderFilter(): void {
    const off = this.filter.kinds.size + this.filter.sources.size + this.filter.types.size;
    this.filterButton.textContent = off ? `Filter (${off})` : "Filter";
    this.filterButton.classList.toggle("tl-on", off > 0);
    if (this.filterPanel.hidden) return;
    const { sources, types, kinds } = facets(this.items);
    const group = (title: string, member: "kinds" | "sources" | "types", list: { name: string; count: number }[], label: (n: string) => string) =>
      list.length < 2 && !(this.filter[member] as Set<string>).size
        ? ""
        : `<fieldset><legend>${title}</legend>` +
          list
            .map(
              (f) =>
                `<label><input type="checkbox" data-member="${member}" data-name="${escape(f.name)}"${(this.filter[member] as ReadonlySet<string>).has(f.name) ? "" : " checked"}>` +
                `<span class="tl-facet">${escape(label(f.name))}</span><span class="tl-count">${f.count.toLocaleString("en-GB")}</span></label>`,
            )
            .join("") +
          `</fieldset>`;
    this.filterPanel.innerHTML =
      group("Kinds", "kinds", kinds, (n) => KIND_WORDS[n as EntryKind] ?? n) +
      group("Sources", "sources", sources, (n) => n) +
      group("Types", "types", types, (n) => n || "No type") +
      `<button type="button" class="tl-show-all">Show all</button>`;
  }

  private filterChanged(input: HTMLInputElement): void {
    const member = input.dataset.member as "kinds" | "sources" | "types" | undefined;
    if (!member) return;
    const next = new Set(this.filter[member] as ReadonlySet<string>);
    if (input.checked) next.delete(input.dataset.name!);
    else next.add(input.dataset.name!);
    const name = input.dataset.name;
    this.setFilter({ ...this.filter, [member]: next } as Filter, true);
    // Built again: keep the keyboard on the same box.
    this.filterPanel.querySelector<HTMLInputElement>(`input[data-member="${member}"][data-name="${CSS.escape(name ?? "")}"]`)?.focus();
  }

  private renderEmpty(): void {
    const none = !this.visible.length;
    this.empty.hidden = !none;
    this.head.hidden = none;
    if (none) {
      this.empty.innerHTML = !this.opened
        ? "Open a plot to read its narrative, notes and periods in time order."
        : this.items.length
          ? `Nothing matches. <button type="button" class="tl-clear">Show everything</button>`
          : "Nothing yet with a time but no position. Add a narrative entry with +, or import a narrative.";
      this.empty.querySelector(".tl-clear")?.addEventListener("click", () => {
        this.search.value = "";
        this.setFilter(NO_FILTER);
      });
    }
    const filtered = filtering(this.filter) && this.items.length > 0;
    this.status.textContent = filtered ? `${plural(this.visible.length, "entry", "entries")} of ${this.items.length.toLocaleString("en-GB")}` : "";
    this.addButton.disabled = !this.opened;
    this.search.disabled = !this.opened;
    this.filterButton.disabled = !this.opened;
  }

  // --- Drawing -----------------------------------------------------------------------------

  private schedule(): void {
    if (this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.draw();
    });
  }

  /** Draw the rows in sight, measure them, and follow current time; at most three passes. */
  private draw(): void {
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
    for (let pass = 0; pass < 3; pass++) {
      const viewport = this.scroller.clientHeight;
      const [first, last] = this.layout.range(this.scroller.scrollTop, viewport || 400, OVERSCAN_PX);
      const wanted = new Set<number>();
      for (let r = first; r <= last && r >= 0; r++) wanted.add(r);
      const activeRow = this.active >= 0 ? this.rowOfItem.get(this.visible[this.active]) : undefined;
      if (activeRow !== undefined) wanted.add(activeRow); // aria-activedescendant names a row that exists
      for (const [row, el] of this.drawn) {
        if (!wanted.has(row)) {
          el.remove();
          this.drawn.delete(row);
        }
      }
      for (const row of wanted) {
        let el = this.drawn.get(row);
        if (!el) {
          el = this.makeRow(row);
          this.spacer.append(el);
          this.drawn.set(row, el);
        }
      }
      // Measure what was drawn; keep the row at the top of the view where it was.
      const anchor = this.layout.rowAt(this.scroller.scrollTop);
      const offset = anchor >= 0 ? this.scroller.scrollTop - this.layout.top(anchor) : 0;
      let changed = false;
      // Every row in sight, not only new ones: a row grows when it shows its Edit and Delete.
      for (const [row, el] of this.drawn) changed = this.layout.setHeight(row, el.offsetHeight) || changed;
      if (changed) {
        this.spacer.style.height = `${this.layout.total}px`;
        if (anchor >= 0 && !this.following) this.scrollTo(this.layout.top(anchor) + offset);
      }
      for (const [row, el] of this.drawn) el.style.transform = `translateY(${this.layout.top(row)}px)`;
      let moved = false;
      if (this.following && this.current >= 0) {
        const row = this.rowOfItem.get(this.visible[this.current])!;
        const target = followScroll(this.layout.top(row), this.layout.height(row), this.scroller.scrollTop, viewport, this.layout.total);
        if (target !== undefined) moved = this.scrollTo(target);
      }
      if (!moved && !changed) break;
    }
    const activeRow = this.active >= 0 ? this.rowOfItem.get(this.visible[this.active]) : undefined;
    this.scroller.setAttribute("aria-activedescendant", activeRow !== undefined ? this.rowId(activeRow) : "");
    this.showFollow();
  }

  private rowId(row: number): string {
    return `tl-row-${row}`;
  }

  private makeRow(row: number): HTMLElement {
    const el = document.createElement("div");
    el.id = this.rowId(row);
    const kind = this.rows[row];
    if ("day" in kind) {
      el.className = "tl-row tl-day";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = `<span>${escape(formatTime(kind.day * 86_400_000, DATED).replace(/ \d\d:\d\d:\d\d.*$/, ""))}</span>`;
      return el;
    }
    const item = this.items[kind.item];
    const { entry } = item;
    const needle = this.filter.text;
    const time = formatTime(item.ms, this.settings);
    const swatch = entry.colour ? `<i class="tl-swatch" style="background:${escape(entry.colour)}"></i>` : "";
    const text = this.textOf(entry);
    const index = this.visibleOfItem(kind.item);
    el.className = "tl-row";
    el.setAttribute("role", "option");
    el.dataset.id = entry.id;
    el.dataset.kind = entry.kind;
    el.setAttribute("aria-setsize", String(this.visible.length));
    el.setAttribute("aria-posinset", String(index + 1));
    const hidden = entry.hidden ? ", hidden on the map" : "";
    el.setAttribute(
      "aria-label",
      `${formatTime(item.ms, DATED)}, ${entry.source}${entry.entry_type ? `, ${entry.entry_type}` : ""}${text ? `: ${text}` : ""}${hidden}`,
    );
    el.innerHTML =
      `<span class="tl-time">${escape(time)}</span>` +
      `<span class="tl-source" title="${escape(entry.source)}">${swatch}${marked(entry.source, needle)}</span>` +
      `<span class="tl-type">${marked(entry.entry_type ?? "", needle)}</span>` +
      `<span class="tl-text">${marked(text, needle)}${entry.hidden ? ` <span class="tl-hidden">hidden on map</span>` : ""}</span>` +
      (entry.kind === "narrative"
        ? `<span class="tl-actions"><button type="button" tabindex="-1" class="tl-edit" title="Change this entry (F2)">Edit</button><button type="button" tabindex="-1" class="tl-remove" title="Delete this entry (Delete); Undo brings it back">Delete</button></span>`
        : "");
    this.styleRow(el, row);
    return el;
  }

  private styleRow(el: HTMLElement, row: number): void {
    const kind = this.rows[row];
    if (!kind || "day" in kind) return;
    const index = this.visibleOfItem(kind.item);
    const item = this.items[kind.item];
    const isCurrent = index === this.current;
    el.classList.toggle("tl-current", isCurrent);
    el.classList.toggle("tl-active", index === this.active);
    el.setAttribute("aria-selected", String(index === this.active));
    if (isCurrent) el.setAttribute("aria-current", "time");
    else el.removeAttribute("aria-current");
    const range = this.time?.range;
    el.classList.toggle("tl-out", !!range && (item.endMs < Date.parse(range.start) || item.ms > Date.parse(range.end)));
  }

  private visibleIndexOf(id: string): number {
    const at = this.itemIndex.get(id);
    return at === undefined ? -1 : this.visibleOfItem(at);
  }

  /** An item's place in the visible list, which is in item order: by binary search. */
  private visibleOfItem(at: number): number {
    let low = 0;
    let high = this.visible.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (this.visible[middle] === at) return middle;
      if (this.visible[middle] < at) low = middle + 1;
      else high = middle - 1;
    }
    return -1;
  }

  private entry(id: string): TimelineEntry | undefined {
    const at = this.itemIndex.get(id);
    return at === undefined ? undefined : this.items[at].entry;
  }

  private activeId(): string | undefined {
    return this.active >= 0 ? this.items[this.visible[this.active]]?.entry.id : undefined;
  }

  /** Mark the entry current time is at; true if it changed. */
  private updateCurrent(): boolean {
    const next = this.time ? currentIndex(this.items, this.visible, Date.parse(this.time.current), this.chosen) : -1;
    if (next === this.current) return false;
    const before = this.current;
    this.current = next;
    for (const index of [before, next]) {
      if (index < 0) continue;
      const row = this.rowOfItem.get(this.visible[index]);
      const el = row !== undefined ? this.drawn.get(row) : undefined;
      if (el) this.styleRow(el, row!);
    }
    return true;
  }

  // --- Scrolling and following ---------------------------------------------------------

  /** Scroll the list ourselves; true if it moved. */
  private scrollTo(top: number): boolean {
    const before = this.scroller.scrollTop;
    this.scroller.scrollTop = top;
    const after = this.scroller.scrollTop;
    if (Math.abs(after - before) < 1) return false;
    this.ownScroll = after;
    return true;
  }

  private scrolled(): void {
    const top = this.scroller.scrollTop;
    const ours = this.ownScroll !== undefined && Math.abs(top - this.ownScroll) <= 2;
    this.ownScroll = undefined;
    // The reader's own scroll: stop following until they ask again.
    if (!ours && (this.dragging || performance.now() - this.readerAt < 700)) this.following = false;
    this.schedule();
  }

  private showFollow(): void {
    const row = this.current >= 0 ? this.rowOfItem.get(this.visible[this.current]) : undefined;
    const show = !this.following && row !== undefined;
    this.followButton.hidden = !show;
    if (!show) return;
    const where = whereIs(this.layout.top(row!), this.layout.height(row!), this.scroller.scrollTop, this.scroller.clientHeight);
    const arrow = where === "above" ? "↑" : where === "below" ? "↓" : "";
    this.followButton.textContent = `${arrow ? `${arrow} ` : ""}Follow time`;
    this.followButton.title = `Follow current time again${where === "in view" ? "" : `: it is ${where}`}`;
  }

  /** Follow current time again, and bring its entry into sight now. */
  follow(): void {
    this.following = true;
    if (this.current >= 0) {
      const row = this.rowOfItem.get(this.visible[this.current])!;
      const viewport = this.scroller.clientHeight;
      const target = Math.max(0, Math.min(this.layout.top(row) - viewport / 3, this.layout.total - viewport));
      this.scrollTo(target);
    }
    this.draw();
  }

  /** Bring an entry into sight and put the keyboard's place on it, without following. */
  private reveal(id: string): void {
    const index = this.visibleIndexOf(id);
    if (index < 0) return;
    this.setActive(index, false);
    const row = this.rowOfItem.get(this.visible[index])!;
    const viewport = this.scroller.clientHeight;
    this.following = false;
    this.scrollTo(Math.max(0, Math.min(this.layout.top(row) - viewport / 3, this.layout.total - viewport)));
    this.draw();
  }

  // --- The reader's actions -----------------------------------------------------------------

  private rowEntry(target: HTMLElement): string | undefined {
    return target.closest<HTMLElement>(".tl-row[data-id]")?.dataset.id;
  }

  private clicked(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const id = this.rowEntry(target);
    if (!id) return;
    if (target.closest(".tl-edit")) return this.openForm(id);
    if (target.closest(".tl-remove")) return this.removeEntry(id);
    this.choose(this.visibleIndexOf(id));
  }

  private choose(index: number): void {
    if (index < 0) return;
    const id = this.items[this.visible[index]].entry.id;
    this.chosen = id;
    this.setActive(index, false);
    this.following = true; // choosing an entry moves time to it: the list follows again
    this.host.choose(id);
    this.draw();
  }

  private setActive(index: number, scroll: boolean): void {
    const before = this.active;
    this.active = Math.max(-1, Math.min(index, this.visible.length - 1));
    for (const i of [before, this.active]) {
      if (i < 0) continue;
      const row = this.rowOfItem.get(this.visible[i]);
      const el = row !== undefined ? this.drawn.get(row) : undefined;
      if (el) this.styleRow(el, row!);
    }
    if (scroll && this.active >= 0) {
      const row = this.rowOfItem.get(this.visible[this.active])!;
      const target = revealScroll(this.layout.top(row), this.layout.height(row), this.scroller.scrollTop, this.scroller.clientHeight);
      if (target !== undefined) this.scrollTo(target);
    }
    this.draw();
  }

  private key(event: KeyboardEvent): void {
    if (event.target !== this.scroller) return;
    const page = Math.max(1, Math.floor(this.scroller.clientHeight / (LINE_PX * 2 + ROW_PAD_PX)));
    const from = this.active >= 0 ? this.active : Math.max(0, this.current);
    const move = (to: number) => {
      event.preventDefault();
      this.following = false; // reading through the list: it no longer follows time
      this.setActive(to, true);
    };
    const id = this.activeId();
    switch (event.key) {
      case "ArrowDown":
        return move(this.active < 0 ? from : from + 1);
      case "ArrowUp":
        return move(this.active < 0 ? from : Math.max(0, from - 1));
      case "PageDown":
        return move(from + page);
      case "PageUp":
        return move(Math.max(0, from - page));
      case "Home":
        return move(0);
      case "End":
        return move(this.visible.length - 1);
      case "Enter":
      case " ":
        event.preventDefault();
        return this.choose(from);
      case "F2":
      case "e":
        if (id && this.entry(id)?.kind === "narrative") {
          event.preventDefault();
          this.openForm(id);
        }
        return;
      case "Delete":
        if (id && this.entry(id)?.kind === "narrative") {
          event.preventDefault();
          this.removeEntry(id);
        }
        return;
      case "n":
      case "N":
      case "Insert":
        event.preventDefault();
        return this.openForm();
      case "/":
        event.preventDefault();
        this.search.focus();
        return;
    }
  }

  private removeEntry(id: string): void {
    const index = this.visibleIndexOf(id);
    this.host.remove(id);
    this.say("Entry deleted. Undo brings it back.");
    // Keep the keyboard's place: the entry after, which takes its place when the list
    // comes back without it (after the last entry, the one before it). Named by
    // that entry, so it is found again in the list as rebuilt.
    const last = this.visible.length - 1;
    if (index !== -1) this.active = index === last ? index - 1 : index + 1;
    this.scroller.focus();
  }

  // --- The form ----------------------------------------------------------------------------

  private submit(): void {
    const value = (name: string) => (this.form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    const range = this.time?.range;
    const ms = parseTime(value("time"), range);
    if (ms === undefined) return this.formError(`Give the time as ${TIME_EXAMPLES}.`);
    const source = value("source").trim().replace(/\s+/g, " ");
    if (!source) return this.formError("Say who wrote the entry: its source, such as BLUE ONE.");
    const text = value("text").trim();
    if (!text) return this.formError("Give the entry some text.");
    const type = value("type").trim().replace(/\s+/g, " ");
    const track = value("track");
    const spec: NarrativeSpec = { time: new Date(ms).toISOString(), source, entry_type: type || null, text, track_id: track || null };
    this.formError("");
    this.host.save(spec, this.editing);
  }

  private formError(message: string): void {
    const error = this.form.querySelector<HTMLElement>(".tl-form-error");
    if (error) error.textContent = message;
  }

  private closeForm(focus = true): void {
    if (this.form.hidden) return;
    this.form.hidden = true;
    this.form.innerHTML = "";
    this.editing = undefined;
    this.element.classList.remove("tl-editing");
    if (focus) this.scroller.focus();
  }

  private say(text: string): void {
    this.status.textContent = text;
    clearTimeout(this.said);
    this.said = setTimeout(() => this.renderEmpty(), 5000);
  }
}
