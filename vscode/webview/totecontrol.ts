/**
 * The Tote (CAP-06, CAP-07): relative geometry between one primary track and
 * several secondaries at current time, through a measure group (core for now).
 *
 * One component for every host: VS Code shows it as the Tote view in the Debrief
 * sidebar (webview/tote.ts), the playground in its side column. The host asks
 * Python for the values at each time (debrief/tote) and shows them here; this
 * only formats them (SUB-04) and lets the analyst choose the tracks.
 *
 * - The primary is chosen from a list above the table; secondaries are added from
 *   a list below it, and each has a remove button (×) beside its name. Every choice
 *   is saved in the plot's island at once (view state: never a step, never undone).
 * - A table: the primary first, with its own measures (course, speed, depth); then
 *   each secondary, with range, bearing and relative bearing from the primary and
 *   its own measures. Narrow, as in a sidebar, each track's values take two lines of
 *   three, every value under its heading; wide, one line. A track with no data at
 *   current time says when it has.
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
const WIDE_PX = 560;
/** Otherwise, three to a line: range, bearing and relative bearing; then course, speed and depth. */
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
      `<div class="tote-scroll"><table class="tote-table" aria-label="Tote: measures at current time"><thead></thead></table></div>` +
      `<p class="tote-note" hidden></p>` +
      `<label class="tote-pick"><span>Add</span><select class="tote-add" aria-label="Add a secondary track to the Tote"></select></label>` +
      `<p class="tote-status" aria-live="polite"></p>`;
    this.primary = element.querySelector(".tote-primary")!;
    this.add = element.querySelector(".tote-add")!;
    this.table = element.querySelector(".tote-table")!;
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
    if (!this.view.primary && !secondaries.length) {
      head.innerHTML = "";
      if (this.tracks.length) {
        const hint = "Choose a primary track, then add the tracks to measure from it; or right-click a track in the outline (press and hold on a touch screen).";
        this.table.insertAdjacentHTML("beforeend", `<tbody><tr><td class="tote-hint">${escape(hint)}</td></tr></tbody>`);
      }
      return;
    }
    // Relative measures first, then each track's own: a line of the table for each few.
    const columns = this.wide ? Math.max(measures.length, 1) : NARROW_COLUMNS;
    const bands = [...chunks(measures.filter((m) => m.subject === "relative"), columns), ...chunks(measures.filter((m) => m.subject !== "relative"), columns)];
    const width = Math.max(1, ...bands.map((b) => b.length));
    const heading = (m: MeasureDefinition) => `<th scope="col" title="${escape(m.title)}" abbr="${escape(m.title)}">${escape(m.label)}</th>`;
    const padding = (n: number, cell: string) => (n > 0 ? `<${cell} colspan="${n}" class="tote-pad"></${cell}>` : "");
    head.innerHTML = bands.length
      ? bands
          .map((band, i) => `<tr>${i === 0 ? `<th scope="col" class="tote-track" rowspan="${bands.length}">Track</th>` : ""}${band.map(heading).join("")}${padding(width - band.length, "td")}</tr>`)
          .join("")
      : `<tr><th scope="col" class="tote-track">Track</th></tr>`;
    const lines = result ? toteLines(result, this.settings) : { secondaries: [] as ToteLine[] };
    const byTrack = new Map(lines.secondaries.map((l) => [l.track, l]));
    // In the order chosen; a track just added shows its name until its values arrive.
    const parts: string[] = [];
    if (this.view.primary) {
      const own = bands.filter((b) => b.every((m) => m.subject !== "relative"));
      parts.push(this.line(lines.primary?.track === this.view.primary ? lines.primary : this.waiting(this.view.primary), own, width, true));
    }
    for (const id of secondaries) parts.push(this.line(byTrack.get(id) ?? this.waiting(id), bands, width, false));
    this.table.insertAdjacentHTML("beforeend", parts.join(""));
    if (focused) {
      const again = this.table.querySelector<HTMLElement>(`tbody[data-track="${CSS.escape(focused)}"]`);
      (onButton ? again?.querySelector<HTMLElement>("button.tote-remove") : again)?.focus();
    }
    if (result?.note) {
      this.note.textContent = result.note;
      this.note.hidden = false;
    }
  }

  private waiting(id: string): ToteLine {
    return { track: id, name: this.nameOf(id), ok: true, cells: [] };
  }

  /** One track: a tbody of its own, its name beside every line of its values. */
  private line(line: ToteLine, bands: MeasureDefinition[][], width: number, primary: boolean): string {
    const swatch = line.colour ? `<span class="tote-swatch" style="background:${escape(line.colour)}" aria-hidden="true"></span>` : "";
    const role = primary ? `<span class="tote-role">primary</span>` : "";
    const label = `Remove ${escape(line.name)} from the Tote`;
    const remove = primary ? "" : `<button class="tote-remove" data-track="${escape(line.track)}" title="${label}" aria-label="${label}">×</button>`;
    const shown = line.ok ? Math.max(bands.length, 1) : 1;
    const name = `<th scope="rowgroup" class="tote-track" rowspan="${shown}"><span class="tote-who">${swatch}<span class="tote-name">${escape(line.name)}</span>${role}</span>${remove}</th>`;
    const value = (m: MeasureDefinition) => `<td data-measure="${escape(m.id)}" title="${escape(m.title)}">${escape(line.cells.find((c) => c.measure === m.id)?.text ?? "")}</td>`;
    const pad = (n: number) => (n > 0 ? `<td colspan="${n}" class="tote-pad"></td>` : "");
    const rows = !line.ok
      ? [`<tr>${name}<td class="tote-why" colspan="${width}">${escape(line.note ?? "No data at current time")}</td></tr>`]
      : bands.length
        ? bands.map((band, i) => `<tr>${i === 0 ? name : ""}${band.map(value).join("")}${pad(width - band.length)}</tr>`)
        : [`<tr>${name}${pad(width)}</tr>`];
    const classes = ["tote-line", primary ? "tote-primary-line" : "", line.ok ? "" : "tote-no-data"].filter(Boolean).join(" ");
    const focus = primary ? "" : ` tabindex="0" aria-keyshortcuts="Delete" title="Delete removes ${escape(line.name)} from the Tote"`;
    return `<tbody class="${classes}" data-track="${escape(line.track)}"${focus}>${rows.join("")}</tbody>`;
  }
}
