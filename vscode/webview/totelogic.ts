/**
 * The Tote's rules, free of the page (CAP-06, CAP-07): which tracks it compares,
 * how its values are written, and asking for them as current time moves.
 *
 * Values are worked out in Python (debrief/tote; PRN-03) at each time; this only
 * formats them with the analyst's settings (SUB-04) and chooses tracks. Which
 * tracks are compared is view state in the plot's island, like the time window
 * (decision, 14 Oct 2026): every change is saved there, never a step in the history.
 */
import { DEFAULT_SETTINGS, formatBearing, formatDepth, formatQuantity, formatRelativeBearing, type FormatSettings } from "@debrief/kernel";
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
  return { ...(view.primary && { primary: view.primary }), ...(secondaries.length && { secondaries }), ...(view.measure_group && { measure_group: view.measure_group }) };
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

/** The same choice: tracks in the same order and the same group. */
export function sameTote(a: ToteView, b: ToteView): boolean {
  const x = tidy(a);
  const y = tidy(b);
  return x.primary === y.primary && (x.measure_group ?? "core") === (y.measure_group ?? "core") && JSON.stringify(x.secondaries ?? []) === JSON.stringify(y.secondaries ?? []);
}

/** A measure's value written for people, as the measure says it is shown; a dash where there is none. */
export function formatMeasure(definition: MeasureDefinition, value: { value?: number; unit?: string } | undefined, settings: FormatSettings = DEFAULT_SETTINGS): string {
  if (!value || value.value === undefined || value.value === null || !value.unit) return "—";
  const quantity = { value: value.value, unit: value.unit };
  switch (definition.display) {
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

export interface ToteCell {
  measure: string;
  text: string;
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

/** One track's line in the Tote: a cell per measure of the group, blank where a measure is not its. */
export function toteLine(row: ToteRow, measures: MeasureDefinition[], settings: FormatSettings = DEFAULT_SETTINGS, own = false): ToteLine {
  const values = new Map((row.values ?? []).map((v) => [v.measure, v]));
  return {
    track: row.track,
    name: row.name ?? row.track,
    ...(row.colour && { colour: row.colour }),
    ok: row.status === "ok",
    ...(row.note && { note: row.note }),
    cells: measures.map((m) => ({
      measure: m.id,
      text: row.status !== "ok" || (own && m.subject !== "own") ? "" : formatMeasure(m, values.get(m.id) as { value?: number; unit?: string } | undefined, settings),
    })),
  };
}

/** The whole table: the primary first (its own measures only), then each secondary. */
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
