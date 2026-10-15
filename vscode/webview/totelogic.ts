/**
 * The Tote's rules, free of the page (CAP-06, CAP-07): which tracks it compares,
 * how its values are written, and asking for them as current time moves.
 *
 * Values are worked out in Python (debrief/tote; PRN-03) at each time; this only
 * formats them with the analyst's settings (SUB-04) and chooses tracks. Which
 * tracks are compared is view state in the plot's island, like the time window
 * (decision, 14 Oct 2026): every change is saved there, never a step in the history.
 */
import { DEFAULT_SETTINGS, formatBearing, formatDepth, formatQuantity, formatRange, formatRelativeBearing, type FormatSettings } from "@debrief/kernel";
import type { DebriefFeatureCollection, MeasureDefinition, ToteResult, ToteRow, ToteTrack, ToteView } from "@debrief/schemas";

/** The tracks the analyst can put in the Tote, in plot order. */
export function toteTracks(plot: DebriefFeatureCollection | undefined): ToteTrack[] {
  return (plot?.features ?? []).flatMap((f) =>
    f.properties.kind === "track" ? [{ id: f.id, name: f.properties.name, ...(f.properties.style?.colour && { colour: f.properties.style.colour }) }] : [],
  );
}

/** The Tote's choice as saved in the plot's island, or an empty one. */
export function toteOf(plot: DebriefFeatureCollection | undefined): ToteView {
  for (const f of plot?.features ?? []) {
    if (f.properties.kind === "plot") return f.properties.view?.tote ?? {};
  }
  return {};
}

const tidy = (view: ToteView): ToteView => {
  const secondaries = [...new Set(view.secondaries ?? [])].filter((id) => id !== view.primary);
  return {
    ...(view.primary && { primary: view.primary }),
    ...(secondaries.length && { secondaries }),
    ...(view.measure_group && { measure_group: view.measure_group }),
    // Left out means the map draws them: only off is saved.
    ...(view.map_lines === false && { map_lines: false }),
  };
};

/** The primary changed: the old one is not kept anywhere, and the new one is no longer a secondary. */
export function withPrimary(view: ToteView, primary: string | undefined): ToteView {
  return tidy({ ...view, primary });
}

/** Secondaries added after those already chosen; the primary is never one. */
export function withSecondaries(view: ToteView, ids: string[]): ToteView {
  return tidy({ ...view, secondaries: [...(view.secondaries ?? []), ...ids.filter((id) => id !== view.primary)] });
}

export function withoutSecondary(view: ToteView, id: string): ToteView {
  return tidy({ ...view, secondaries: (view.secondaries ?? []).filter((s) => s !== id) });
}

/** The map's lines from the primary to each secondary, on or off (decision, 14 Oct 2026). */
export function withMapLines(view: ToteView, on: boolean): ToteView {
  return tidy({ ...view, map_lines: on });
}

/** Whether the map draws a line from the primary to each secondary: on unless turned off. */
export function mapLinesOn(view: ToteView): boolean {
  return view.map_lines !== false;
}

/** The same choice: tracks in the same order, the same group, and the map's lines the same. */
export function sameTote(a: ToteView, b: ToteView): boolean {
  const x = tidy(a);
  const y = tidy(b);
  return (
    x.primary === y.primary &&
    (x.measure_group ?? "core") === (y.measure_group ?? "core") &&
    JSON.stringify(x.secondaries ?? []) === JSON.stringify(y.secondaries ?? []) &&
    mapLinesOn(x) === mapLinesOn(y)
  );
}

/**
 * The map's lines at an instant: from the primary's position to each secondary's, for
 * those with a position then (positionAt gives none outside a track's span). None when
 * the lines are off or there is no primary there.
 */
export function toteMapLines<P>(view: ToteView, positionOf: (id: string) => P | undefined): { track: string; from: P; to: P }[] {
  if (!mapLinesOn(view) || !view.primary) return [];
  const from = positionOf(view.primary);
  if (from === undefined) return [];
  return (view.secondaries ?? []).flatMap((track) => {
    if (track === view.primary) return [];
    const to = positionOf(track);
    return to === undefined ? [] : [{ track, from, to }];
  });
}

/** A measure's value written for people, as the measure says it is shown; a dash where there is none. */
export function formatMeasure(definition: MeasureDefinition, value: { value?: number; unit?: string } | undefined, settings: FormatSettings = DEFAULT_SETTINGS): string {
  if (!value || value.value === undefined || value.value === null || !value.unit) return "—";
  const quantity = { value: value.value, unit: value.unit };
  switch (definition.display) {
    case "range":
      return formatRange(quantity, settings);
    case "bearing":
      return formatBearing(quantity, settings);
    case "relative_bearing":
      return formatRelativeBearing(quantity, settings);
    case "depth":
      return formatDepth(quantity, settings);
    default:
      return formatQuantity(quantity, settings);
  }
}

/** A measure's value split into its figures and what follows them (its unit): "R024.5°" is "R024.5" and "°". */
export function splitUnit(text: string): { figures: string; unit: string } {
  const m = /^([RG]?-?\d[\d.]*)\s?(.*)$/.exec(text);
  return m ? { figures: m[1], unit: m[2] } : { figures: text, unit: "" };
}

/** A value of each kind, in units Python works in, to ask the formatter which unit it writes that kind in. */
const SAMPLE_UNIT: Record<string, string> = { length: "m", angle: "deg", speed: "m/s", angular_rate: "deg/min", duration: "s" };

/**
 * The unit a measure's values are written in with the analyst's settings, for its row
 * heading: "nmi", "°T", "°", "°/min", "kn", "m" (or "km", "ft", "m/s"... as set). Taken
 * from the formatter itself, so a heading and the values under it cannot disagree. A long
 * range stands for a range's usual unit; a close range in yards says so in its own cell.
 */
export function measureUnit(definition: MeasureDefinition, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const unit = SAMPLE_UNIT[definition.quantity_kind];
  return unit ? splitUnit(formatMeasure(definition, { value: 1e5, unit }, settings)).unit : "";
}

/**
 * A value as the Tote's table shows it, under a row heading that carries the unit
 * (decision, 14 Oct 2026): the figures alone, "214.5"; a value in another unit than the
 * heading's keeps its own, "1070 yd" (a close range); a dash stays a dash.
 */
export function cellText(text: string, unit: string): string {
  if (!text || text === "—") return text;
  const { figures, unit: own } = splitUnit(text);
  return own === unit ? figures : text;
}

export interface ToteCell {
  measure: string;
  /** In full, with its unit: "1.35 nmi", "R024.5°"; for hover and for screen readers. */
  text: string;
  /** As the table shows it, under a heading with the unit: "1.35", "R024.5"; "1350 yd" where the unit differs. */
  shown: string;
}

/** A row heading of the Tote: one measure, with the unit its values are in. */
export interface ToteHeading {
  measure: string;
  label: string;
  unit: string;
  title: string;
  subject: string;
}

/** The Tote's row headings: one a measure, in the group's order, each with its unit as the analyst has set units. */
export function toteHeadings(measures: MeasureDefinition[], settings: FormatSettings = DEFAULT_SETTINGS): ToteHeading[] {
  return measures.map((m) => ({ measure: m.id, label: m.label, unit: measureUnit(m, settings), title: m.title, subject: m.subject }));
}

export interface ToteLine {
  track: string;
  name: string;
  colour?: string;
  /** Has values at current time. */
  ok: boolean;
  /** Why not, when not: "Starts 09:30:00Z", "No longer in the plot". */
  note?: string;
  cells: ToteCell[];
}

/**
 * One track's column in the Tote: a cell per measure of the group; blank where a measure
 * is not the track's (the primary's range from itself), a dash where it has no value now.
 */
export function toteLine(row: ToteRow, measures: MeasureDefinition[], settings: FormatSettings = DEFAULT_SETTINGS, own = false): ToteLine {
  const values = new Map((row.values ?? []).map((v) => [v.measure, v]));
  return {
    track: row.track,
    name: row.name ?? row.track,
    ...(row.colour && { colour: row.colour }),
    ok: row.status === "ok",
    ...(row.note && { note: row.note }),
    cells: measures.map((m) => {
      if (own && m.subject !== "own") return { measure: m.id, text: "", shown: "" };
      if (row.status !== "ok") return { measure: m.id, text: "—", shown: "—" };
      const text = formatMeasure(m, values.get(m.id) as { value?: number; unit?: string } | undefined, settings);
      return { measure: m.id, text, shown: cellText(text, measureUnit(m, settings)) };
    }),
  };
}

/** The whole Tote: the primary (its own measures only), then each secondary. */
export function toteLines(result: ToteResult, settings: FormatSettings = DEFAULT_SETTINGS): { primary?: ToteLine; secondaries: ToteLine[] } {
  return {
    ...(result.primary && { primary: toteLine(result.primary, result.measures, settings, true) }),
    secondaries: result.rows.map((row) => toteLine(row, result.measures, settings)),
  };
}

/**
 * Asks for the Tote as current time moves, keeping pace without queueing (decision
 * 11 Oct, docs/spikes/tote-latency.md): one request at a time, and when it returns,
 * one more for the latest time if that moved meanwhile. Staleness is bounded by one
 * round trip; a time passed over while a request was out is never asked for.
 */
export class ToteRequests<K> {
  private busy = false;
  private wanted?: K;
  private generation = 0;
  /** How long each answer took, from asking to showing, in milliseconds; for the latency checks. */
  readonly timings: number[] = [];

  constructor(
    private readonly ask: (key: K) => Promise<ToteResult | undefined>,
    private readonly show: (result: ToteResult | undefined, key: K) => void,
    private readonly fail: (error: Error) => void = () => undefined,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Ask for the Tote at this key (a time and a choice of tracks); the latest wins. */
  request(key: K): void {
    this.wanted = key;
    if (!this.busy) void this.next();
  }

  /** Forget anything asked for: the plot closed or changed. An answer still out is not shown. */
  reset(): void {
    this.wanted = undefined;
    this.generation++;
  }

  private async next(): Promise<void> {
    const key = this.wanted;
    if (key === undefined) return;
    this.wanted = undefined;
    this.busy = true;
    const generation = this.generation;
    const started = this.now();
    try {
      const result = await this.ask(key);
      if (generation === this.generation) {
        this.show(result, key);
        this.timings.push(this.now() - started);
        if (this.timings.length > 2000) this.timings.splice(0, 1000);
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error as Error);
    } finally {
      this.busy = false;
    }
    if (this.wanted !== undefined) await this.next();
  }
}

/** Percentiles of a list of timings, in milliseconds, for the latency reports. */
export function latencySummary(timings: number[]): { count: number; p50: number; p95: number; max: number } {
  const sorted = [...timings].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1)))] ?? 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { count: sorted.length, p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1) ?? 0) };
}
