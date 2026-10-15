/**
 * The Tote (CAP-06, CAP-07): relative geometry between one primary track and
 * several secondaries at current time, through a measure group (core for now).
 *
 * One component for every host: VS Code shows it as the Tote view in the Debrief
 * sidebar (webview/tote.ts), the playground in its side column. The host asks
 * Python for the values at each time (debrief/tote) and shows them here; this
 * only formats them (SUB-04) and lets the analyst choose the tracks.
 *
 * - Legacy Debrief's table (decision, 14 Oct 2026): a row a measure, a column a track.
 *   The first column holds the row headings, each a measure's short name with the unit
 *   its values are in ("Range nmi", "Brg °T"); the cells hold figures only. A value in
 *   another unit keeps its own: a close range, "1070 yd". Then the primary's column (its
 *   name in bold; blank where a measure is between tracks), then one column a secondary,
 *   its colour, name (onto two lines where room is short; cut short beyond, in full on
 *   hover) and remove button (×) in the heading.
 * - One layout at every width: where the columns do not fit (a sidebar, a phone), the
 *   row headings stay put and the tracks scroll sideways inside the table, never the page.
 * - A track with no data at current time has a column of dashes, and says why under the
 *   table ("Cargo 01 Starts 08:00:01Z").
 * - The primary is chosen from a list above the table, secondaries are added from a list
 *   below it, and a box turns the map's lines (primary to each secondary) on or off. Every
 *   choice is saved in the plot's island at once (view state: never a step, never undone).
 * - Keyboard: Tab reaches the lists, each secondary's remove button and the box; Enter,
 *   Space, Delete or Backspace on a remove button removes that secondary. Values change in
 *   place many times a second while playing, so the keyboard stays where it is.
 */
import { DEFAULT_SETTINGS, type FormatSettings } from "@debrief/kernel";
import type { ToteResult, ToteTrack, ToteView } from "@debrief/schemas";
import { mapLinesOn, toteHeadings, toteLines, withMapLines, withoutSecondary, withPrimary, withSecondaries, type ToteHeading, type ToteLine } from "./totelogic.js";

export interface ToteControlHost {
  /** The analyst changed the choice of tracks: save it in the plot's island. */
  changed(view: ToteView): void;
}

/** A cell's hover: why a track has no value now, or a value in full where the cell shows its figures alone ("Range from the primary" is the row's). */
const cellTitle = (line: ToteLine, value: { text: string; shown: string }) =>
  !line.ok ? (line.note ?? "No data at current time") : value.text && value.text !== value.shown ? value.text : "";

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class ToteControl {
  private tracks: ToteTrack[] = [];
  private view: ToteView = {};
  private result?: ToteResult;
  /** What the table was last built from, less its values: the same again, and only values change. */
  private shape = "";
  private whyShown = "";
  private readonly primary: HTMLSelectElement;
  private readonly add: HTMLSelectElement;
  private readonly scroll: HTMLElement;
  private readonly table: HTMLTableElement;
  private readonly why: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly note: HTMLElement;
  private readonly status: HTMLElement;
  private readonly mapLines: HTMLInputElement;
  private said?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly element: HTMLElement,
    private readonly host: ToteControlHost,
    private readonly settings: FormatSettings = DEFAULT_SETTINGS,
  ) {
    element.classList.add("tote");
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", "Tote");
    element.innerHTML =
      `<label class="tote-pick"><span>Primary</span><select class="tote-primary" aria-label="Tote primary track"></select></label>` +
      `<div class="tote-scroll" hidden><table class="tote-table" aria-label="Tote"><thead></thead><tbody></tbody></table></div>` +
      `<ul class="tote-whys" hidden></ul>` +
      `<p class="tote-hint" hidden></p>` +
      `<p class="tote-note" hidden></p>` +
      `<label class="tote-pick"><span>Add</span><select class="tote-add" aria-label="Add a secondary track to the Tote"></select></label>` +
      `<label class="tote-check"><input type="checkbox" class="tote-lines"> Lines on the map</label>` +
      `<p class="tote-status" aria-live="polite"></p>`;
    this.primary = element.querySelector(".tote-primary")!;
    this.add = element.querySelector(".tote-add")!;
    this.scroll = element.querySelector(".tote-scroll")!;
    this.table = element.querySelector(".tote-table")!;
    this.why = element.querySelector(".tote-whys")!;
    this.hint = element.querySelector(".tote-hint")!;
    this.note = element.querySelector(".tote-note")!;
    this.status = element.querySelector(".tote-status")!;
    this.mapLines = element.querySelector(".tote-lines")!;
    this.mapLines.addEventListener("change", () =>
      this.choose(withMapLines(this.view, this.mapLines.checked), this.mapLines.checked ? "Tote lines shown on the map." : "Tote lines taken off the map."),
    );
    this.primary.addEventListener("change", () => this.choose(withPrimary(this.view, this.primary.value || undefined)));
    this.add.addEventListener("change", () => {
      const id = this.add.value;
      if (!id) return;
      this.choose(withSecondaries(this.view, [id]), `${this.nameOf(id)} added to the Tote.`);
      this.add.focus();
    });
    this.table.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button.tote-remove");
      if (button) this.remove(button.dataset.track!);
    });
    this.table.addEventListener("keydown", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button.tote-remove");
      if (!button || (event.key !== "Delete" && event.key !== "Backspace")) return;
      event.preventDefault();
      this.remove(button.dataset.track!);
    });
    this.render();
  }

  /** The plot's tracks, the choice as saved, and the values at current time, any of them; nothing for no plot. */
  show(state: { tracks?: ToteTrack[]; view?: ToteView; result?: ToteResult } | undefined): void {
    if (!state) {
      this.tracks = [];
      this.view = {};
      this.result = undefined;
      return this.render();
    }
    if (state.tracks) this.tracks = state.tracks;
    if (state.view) this.view = state.view;
    if (state.result !== undefined) this.result = state.result;
    // Values alone, many times a second while playing: the lists are left as they are.
    if (state.tracks || state.view) this.render();
    else this.renderTable();
  }

  /** The current choice of tracks, as shown. */
  get choice(): ToteView {
    return this.view;
  }

  private nameOf(id: string): string {
    return this.tracks.find((t) => t.id === id)?.name ?? id;
  }

  private choose(view: ToteView, said?: string): void {
    this.view = view;
    // Values for tracks newly chosen arrive with the next answer; until then, their names.
    this.render();
    if (said) {
      this.status.textContent = said;
      clearTimeout(this.said);
      this.said = setTimeout(() => (this.status.textContent = ""), 4000);
    }
    this.host.changed(view);
  }

  private buttons(): HTMLButtonElement[] {
    return Array.from(this.table.querySelectorAll<HTMLButtonElement>("button.tote-remove"));
  }

  private remove(id: string): void {
    const at = this.buttons().findIndex((b) => b.dataset.track === id);
    this.choose(withoutSecondary(this.view, id), `${this.nameOf(id)} removed from the Tote.`);
    // Keep the keyboard where it was: the next track's ×, else the one before, else the list to add from.
    const rest = this.buttons();
    (rest[Math.min(at, rest.length - 1)] ?? this.add).focus();
  }

  private render(): void {
    const opened = this.tracks.length > 0;
    this.element.classList.toggle("tote-empty", !opened);
    const options = (ids: ToteTrack[], none: string) =>
      `<option value="">${escape(none)}</option>` + ids.map((t) => `<option value="${escape(t.id)}">${escape(t.name)}</option>`).join("");
    this.primary.innerHTML = options(this.tracks, opened ? "Choose a primary…" : "Open a plot first");
    this.primary.value = this.view.primary && this.tracks.some((t) => t.id === this.view.primary) ? this.view.primary : "";
    this.primary.disabled = !opened;
    const chosen = new Set([this.view.primary, ...(this.view.secondaries ?? [])]);
    const free = this.tracks.filter((t) => !chosen.has(t.id));
    this.add.innerHTML = options(free, free.length ? "Add a secondary…" : opened ? "Every track is in the Tote" : "Open a plot first");
    this.add.value = "";
    this.add.disabled = !free.length;
    this.mapLines.checked = mapLinesOn(this.view);
    this.mapLines.disabled = !this.view.primary || !this.view.secondaries?.length;
    this.renderTable();
  }

  /** The columns in order: the primary, then the secondaries as chosen; a track just chosen shows its name until its values arrive. */
  private columns(): { line: ToteLine; primary: boolean }[] {
    const lines = this.result ? toteLines(this.result, this.settings) : { secondaries: [] as ToteLine[] };
    const byTrack = new Map(lines.secondaries.map((l) => [l.track, l]));
    const primary = this.view.primary;
    return [
      ...(primary ? [{ line: lines.primary?.track === primary ? lines.primary : this.waiting(primary), primary: true }] : []),
      ...(this.view.secondaries ?? []).map((id) => ({ line: byTrack.get(id) ?? this.waiting(id), primary: false })),
    ];
  }

  private renderTable(): void {
    const result = this.result;
    const headings = toteHeadings(result?.measures ?? [], this.settings);
    const columns = this.columns();
    const primary = this.view.primary;
    const secondaries = this.view.secondaries ?? [];

    const hint = !this.tracks.length || secondaries.length
      ? ""
      : primary
        ? "Add the tracks to measure from the primary; or right-click a track in the outline (press and hold on a touch screen)."
        : "Choose a primary track, then add the tracks to measure from it; or right-click a track in the outline (press and hold on a touch screen).";
    this.hint.textContent = hint;
    this.hint.hidden = !hint;
    this.note.textContent = result?.note ?? "";
    this.note.hidden = !result?.note || !columns.length;
    this.scroll.hidden = !columns.length;

    // Why a track has no values now, under the table, where a phone can read it.
    const whys = columns.filter((c) => !c.line.ok);
    this.why.hidden = !whys.length;
    const why = whys
      .map(({ line }) => `<li data-track="${escape(line.track)}"><span class="tote-why-name">${escape(line.name)}</span> <span class="tote-why">${escape(line.note ?? "No data at current time")}</span></li>`)
      .join("");
    if (why !== this.whyShown) this.why.innerHTML = this.whyShown = why;

    const shape = JSON.stringify([headings, columns.map(({ line, primary }) => [line.track, line.name, line.colour, line.ok, line.note, primary])]);
    if (shape === this.shape) return this.refresh(columns);
    this.shape = shape;
    // Rebuilt: the keyboard goes back to the remove button it was on.
    const active = document.activeElement as HTMLElement | null;
    const focused = active && this.table.contains(active) ? active.dataset.track : undefined;
    this.table.tHead!.innerHTML = columns.length ? `<tr><td class="tote-corner"></td>${columns.map((c) => this.heading(c.line, c.primary)).join("")}</tr>` : "";
    this.table.tBodies[0].innerHTML = headings.map((h, row) => this.row(h, row, headings, columns)).join("");
    if (focused) this.table.querySelector<HTMLElement>(`button.tote-remove[data-track="${CSS.escape(focused)}"]`)?.focus();
  }

  /** Values alone changed: written into the cells already there, so nothing moves and focus stays. */
  private refresh(columns: { line: ToteLine }[]): void {
    const rows = this.table.tBodies[0].rows;
    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r].cells;
      columns.forEach(({ line }, c) => {
        const cell = cells[c + 1];
        const value = line.cells[r];
        if (!cell || !value) return;
        if (cell.textContent !== value.shown) cell.textContent = value.shown;
        const title = cellTitle(line, value);
        if ((cell.getAttribute("title") ?? "") !== title) {
          if (title) cell.setAttribute("title", title);
          else cell.removeAttribute("title");
        }
      });
    }
  }

  private swatch(line: ToteLine): string {
    return line.colour ? `<span class="tote-swatch" style="background:${escape(line.colour)}" aria-hidden="true"></span>` : "";
  }

  /** A track's column heading: its colour and name; a secondary's remove button; the primary's name in bold. */
  private heading(line: ToteLine, primary: boolean): string {
    const label = `Remove ${escape(line.name)} from the Tote`;
    const button = primary
      ? ""
      : `<button type="button" class="tote-remove" data-track="${escape(line.track)}" title="${label}" aria-label="${label}" aria-keyshortcuts="Delete">×</button>`;
    const title = primary ? `${line.name}, the primary` : line.name;
    const why = line.ok ? "" : `: ${line.note ?? "No data at current time"}`;
    const classes = ["tote-col", primary ? "tote-col-primary" : "", line.ok ? "" : "tote-no-data"].filter(Boolean).join(" ");
    return (
      `<th scope="col" class="${classes}" data-track="${escape(line.track)}" title="${escape(title + why)}">` +
      `<span class="tote-who">${this.swatch(line)}<span class="tote-name">${escape(line.name)}</span>${primary ? `<span class="tote-sr">, the primary</span>` : ""}${button}</span></th>`
    );
  }

  /** One measure's row: its heading with the unit, then a value for each track. */
  private row(heading: ToteHeading, row: number, headings: ToteHeading[], columns: { line: ToteLine; primary: boolean }[]): string {
    // A quiet rule where the measures between tracks give way to each track's own.
    const first = row > 0 && heading.subject !== headings[row - 1].subject ? ` class="tote-group"` : "";
    const unit = heading.unit ? ` <span class="tote-unit">${escape(heading.unit)}</span>` : "";
    const cells = columns
      .map(({ line, primary }) => {
        const value = line.cells[row] ?? { text: "", shown: "" };
        const title = cellTitle(line, value);
        const classes = [primary ? "tote-col-primary" : "", line.ok ? "" : "tote-no-data"].filter(Boolean).join(" ");
        return `<td data-track="${escape(line.track)}" data-measure="${escape(heading.measure)}"${classes ? ` class="${classes}"` : ""}${title ? ` title="${escape(title)}"` : ""}>${escape(value.shown)}</td>`;
      })
      .join("");
    return `<tr${first} data-measure="${escape(heading.measure)}"><th scope="row" title="${escape(heading.title)}">${escape(heading.label)}${unit}</th>${cells}</tr>`;
  }

  private waiting(id: string): ToteLine {
    return { track: id, name: this.nameOf(id), ok: true, cells: [] };
  }
}
