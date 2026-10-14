/**
 * The Tote (CAP-06, CAP-07): relative geometry between one primary track and
 * several secondaries at current time, through a measure group (core for now).
 *
 * One component for every host: VS Code shows it as the Tote view in the Debrief
 * sidebar (webview/tote.ts), the playground in its side column. The host asks
 * Python for the values at each time (debrief/tote) and shows them here; this
 * only formats them (SUB-04) and lets the analyst choose the tracks.
 *
 * - The primary is chosen from a list above the table, and its own measures (course,
 *   speed, depth) are written under it, each with its label. Secondaries are added from a
 *   list below the table; each has a remove button (×) in the table's last column. Every
 *   choice is saved in the plot's island at once (view state: never a step, never undone).
 * - The table has one row of headings and a line for each secondary. Narrow, as in a
 *   sidebar: the track's name across the table, then its range, bearing and relative
 *   bearing under their headings, then its own measures, labelled as the primary's are.
 *   Wide: one line a track, every measure under its heading. Long names are cut short
 *   (in full on hover); nothing scrolls sideways down to about 200 px. A track with no
 *   data at current time says when it has.
 * - Keyboard: Tab reaches the lists, each secondary and its remove button; Delete or
 *   Backspace on a secondary removes it. Every value has its measure's full name on
 *   hover and for screen readers.
 */
import { DEFAULT_SETTINGS, type FormatSettings } from "@debrief/kernel";
import type { MeasureDefinition, ToteResult, ToteTrack, ToteView } from "@debrief/schemas";
import { toteLines, withoutSecondary, withPrimary, withSecondaries, type ToteLine } from "./totelogic.js";

export interface ToteControlHost {
  /** The analyst changed the choice of tracks: save it in the plot's island. */
  changed(view: ToteView): void;
}

/** Where the Tote is this wide, in CSS pixels, each track's values fit on one line. */
const WIDE_PX = 440;
/** Otherwise, the measures between tracks three to a line under their headings; then the track's own, labelled. */
const NARROW_COLUMNS = 3;

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class ToteControl {
  private tracks: ToteTrack[] = [];
  private view: ToteView = {};
  private result?: ToteResult;
  private wide = false;
  private readonly primary: HTMLSelectElement;
  private readonly add: HTMLSelectElement;
  private readonly table: HTMLTableElement;
  private readonly primaryOwn: HTMLElement;
  private readonly note: HTMLElement;
  private readonly status: HTMLElement;
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
      `<div class="tote-own tote-primary-own" role="group" hidden></div>` +
      `<div class="tote-scroll"><table class="tote-table" aria-label="Tote: secondaries at current time, measured from the primary"><thead></thead></table></div>` +
      `<p class="tote-note" hidden></p>` +
      `<label class="tote-pick"><span>Add</span><select class="tote-add" aria-label="Add a secondary track to the Tote"></select></label>` +
      `<p class="tote-status" aria-live="polite"></p>`;
    this.primary = element.querySelector(".tote-primary")!;
    this.add = element.querySelector(".tote-add")!;
    this.table = element.querySelector(".tote-table")!;
    this.primaryOwn = element.querySelector(".tote-primary-own")!;
    this.note = element.querySelector(".tote-note")!;
    this.status = element.querySelector(".tote-status")!;
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
      const line = (event.target as HTMLElement).closest<HTMLElement>("tbody[data-track][tabindex]");
      if (!line || (event.key !== "Delete" && event.key !== "Backspace")) return;
      event.preventDefault();
      this.remove(line.dataset.track!);
    });
    // One line per track where there is room for it, two where there is not.
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => {
        const wide = element.clientWidth >= WIDE_PX;
        if (wide === this.wide) return;
        this.wide = wide;
        element.classList.toggle("tote-wide", wide);
        this.renderTable();
      }).observe(element);
    }
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

  private lines(): HTMLElement[] {
    return Array.from(this.table.querySelectorAll<HTMLElement>("tbody[data-track][tabindex]"));
  }

  private remove(id: string): void {
    const at = this.lines().findIndex((l) => l.dataset.track === id);
    this.choose(withoutSecondary(this.view, id), `${this.nameOf(id)} removed from the Tote.`);
    // Keep the keyboard where it was: the next track, else the one before, else the list to add from.
    const rest = this.lines();
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
    this.renderTable();
  }

  private renderTable(): void {
    const result = this.result;
    const measures: MeasureDefinition[] = result?.measures ?? [];
    const head = this.table.tHead!;
    const secondaries = this.view.secondaries ?? [];
    this.note.hidden = true;
    // Values arrive many times a second while playing: the keyboard stays where it was.
    const active = document.activeElement as HTMLElement | null;
    const focused = active && this.table.contains(active) ? active.closest<HTMLElement>("tbody[data-track]")?.dataset.track : undefined;
    const onButton = !!active?.classList.contains("tote-remove");
    for (const body of Array.from(this.table.tBodies)) body.remove();
    const lines = result ? toteLines(result, this.settings) : { secondaries: [] as ToteLine[] };
    const own = measures.filter((m) => m.subject !== "relative");
    const relative = measures.filter((m) => m.subject === "relative");
    // The primary: its own measures under the list it is chosen from, each labelled.
    const primary = this.view.primary;
    this.primaryOwn.hidden = !primary;
    if (primary) {
      const line = lines.primary?.track === primary ? lines.primary : this.waiting(primary);
      this.primaryOwn.dataset.track = primary;
      this.primaryOwn.setAttribute("aria-label", `${line.name}, the primary, at current time`);
      this.primaryOwn.innerHTML = this.swatch(line) + (line.ok ? this.pairs(line, own) : `<span class="tote-why">${escape(line.note ?? "No data at current time")}</span>`);
    }
    if (!secondaries.length) {
      head.innerHTML = "";
      const hint = !this.tracks.length
        ? ""
        : primary
          ? "Add the tracks to measure from the primary; or right-click a track in the outline (press and hold on a touch screen)."
          : "Choose a primary track, then add the tracks to measure from it; or right-click a track in the outline (press and hold on a touch screen).";
      if (hint) this.table.insertAdjacentHTML("beforeend", `<tbody><tr><td class="tote-hint">${escape(hint)}</td></tr></tbody>`);
      return;
    }
    // One row of headings: wide, every measure; narrow, those between tracks (three to a row, should a group have more).
    const heading = (m: MeasureDefinition) => `<th scope="col" title="${escape(m.title)}" abbr="${escape(m.title)}">${escape(m.label)}</th>`;
    const act = `<th scope="col" class="tote-act"><span class="tote-sr">Remove</span></th>`;
    const bands = this.wide ? [[...relative, ...own]] : chunks(relative, NARROW_COLUMNS);
    const width = Math.max(1, ...bands.map((b) => b.length));
    const pad = (n: number) => (n > 0 ? `<td colspan="${n}" class="tote-pad"></td>` : "");
    // Narrow, each × sits at the end of its track's name, over the last column: no column of its own to make room for.
    head.innerHTML = this.wide
      ? `<tr><th scope="col" class="tote-track">Track</th>${bands[0].map(heading).join("")}${act}</tr>`
      : bands.map((band) => `<tr>${band.map(heading).join("")}${pad(width - band.length)}</tr>`).join("") || `<tr>${pad(1)}</tr>`;
    const byTrack = new Map(lines.secondaries.map((l) => [l.track, l]));
    // In the order chosen; a track just added shows its name until its values arrive.
    this.table.insertAdjacentHTML("beforeend", secondaries.map((id) => this.line(byTrack.get(id) ?? this.waiting(id), bands, own, width)).join(""));
    if (focused) {
      const again = this.table.querySelector<HTMLElement>(`tbody[data-track="${CSS.escape(focused)}"]`);
      (onButton ? again?.querySelector<HTMLElement>("button.tote-remove") : again)?.focus();
    }
    if (result?.note) {
      this.note.textContent = result.note;
      this.note.hidden = false;
    }
  }

  private swatch(line: ToteLine): string {
    return line.colour ? `<span class="tote-swatch" style="background:${escape(line.colour)}" aria-hidden="true"></span>` : "";
  }

  /** A track's own measures, each with its label: "Crse 225.0°T", read aloud as "Course 225.0°T". */
  private pairs(line: ToteLine, measures: MeasureDefinition[]): string {
    return measures
      .map((m) => {
        const text = line.cells.find((c) => c.measure === m.id)?.text ?? "";
        return (
          `<span class="tote-pair" title="${escape(m.title)}"><span class="tote-label" aria-hidden="true">${escape(m.label)}</span>` +
          `<span class="tote-sr">${escape(m.title)} </span><span class="tote-value" data-measure="${escape(m.id)}">${escape(text)}</span></span>`
        );
      })
      .join("");
  }

  private waiting(id: string): ToteLine {
    return { track: id, name: this.nameOf(id), ok: true, cells: [] };
  }

  /** One secondary: a tbody of its own, its remove button at the end of its first line. */
  private line(line: ToteLine, bands: MeasureDefinition[][], own: MeasureDefinition[], width: number): string {
    const label = `Remove ${escape(line.name)} from the Tote`;
    const button = `<button class="tote-remove" data-track="${escape(line.track)}" title="${label}" aria-label="${label}">×</button>`;
    const remove = `<td class="tote-act">${button}</td>`;
    const who = `<span class="tote-who">${this.swatch(line)}<span class="tote-name" title="${escape(line.name)}">${escape(line.name)}</span></span>`;
    const value = (m: MeasureDefinition) => `<td data-measure="${escape(m.id)}" title="${escape(m.title)}">${escape(line.cells.find((c) => c.measure === m.id)?.text ?? "")}</td>`;
    const pad = (n: number) => (n > 0 ? `<td colspan="${n}" class="tote-pad"></td>` : "");
    const why = (span: number) => `<td class="tote-why" colspan="${span}">${escape(line.note ?? "No data at current time")}</td>`;
    const rows: string[] = [];
    if (this.wide) {
      rows.push(`<tr><th scope="row" class="tote-track">${who}</th>${line.ok ? bands[0].map(value).join("") : why(width)}${remove}</tr>`);
    } else {
      rows.push(
        width > 1
          ? `<tr class="tote-name-row"><th scope="rowgroup" class="tote-track" colspan="${width - 1}">${who}</th>${remove}</tr>`
          : `<tr class="tote-name-row"><th scope="rowgroup" class="tote-track">${who}${button}</th></tr>`,
      );
      if (!line.ok) rows.push(`<tr>${why(width)}</tr>`);
      else {
        for (const band of bands) rows.push(`<tr>${band.map(value).join("")}${pad(width - band.length)}</tr>`);
        if (own.length) rows.push(`<tr><td class="tote-own-cell" colspan="${width}"><div class="tote-own">${this.pairs(line, own)}</div></td></tr>`);
      }
    }
    const classes = ["tote-line", line.ok ? "" : "tote-no-data"].filter(Boolean).join(" ");
    return `<tbody class="${classes}" data-track="${escape(line.track)}" tabindex="0" aria-keyshortcuts="Delete" title="Delete removes ${escape(line.name)} from the Tote">${rows.join("")}</tbody>`;
  }
}
