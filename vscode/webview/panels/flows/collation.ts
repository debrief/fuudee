/**
 * Collation (CAP-08 to CAP-12), written once for both front ends (PAR-09, PAR-11, PAR-12): from the
 * Catalogues tree, the Command Palette and Coverage, take an item's data into the open plot, set new
 * data aside (Not now), clear a review flag (Reviewed), and say whether another plot's track is one
 * of the open plot's platforms (Same platform, Not this platform). Taking, choosing a source and
 * linking are steps in the plot's history; setting aside and clearing a flag are its island's. Each
 * says what it did, or why not, in VS Code's words; and the review flags newly raised are said once,
 * all in one notice, with "Show in Catalogues".
 */
import type { CoverageReport, ItemRevision, ReviewFlag, SourceTrackRef, TimeRange } from "@debrief/schemas";
import { count } from "../../../src/format.js";
import { REASONS } from "../actions.js";
import { changeStep } from "./step.js";
import type { FlowHost, PlotRef } from "./host.js";

/** What Coverage, the Catalogues tree or an agent asks of collation. */
export type CoverageAsk =
  | { kind: "prefer"; feature: string; period: TimeRange; source: SourceTrackRef }
  | { kind: "link"; feature: string; source: SourceTrackRef; linked: boolean }
  | { kind: "take"; source: { catalogue: string; item: string; revision?: string } }
  | { kind: "dismiss"; source: ItemRevision }
  | { kind: "reviewed" };

/** A step in the plot's history, as the service takes it. */
export type CollationChange = Extract<CoverageAsk, { kind: "take" | "prefer" | "link" }>;

/** A plot of a catalogue, as a Catalogues row names it. */
export interface PlotTarget {
  /** The store's id (where the plot is). */
  store: string;
  /** The catalogue's own id: what collation names items by. */
  catalogue: string;
  item: string;
  title: string;
}
/** A track of another plot, as a Catalogues row names it. */
export interface TrackTarget extends PlotTarget {
  track: string;
  name: string;
}

export interface CollationHost extends FlowHost {
  /** What collation said last of the open plot (debrief/coverage). */
  coverage(): CoverageReport | undefined;
  /** The open plot's tracks. */
  plotTracks(): { id: string; name: string }[];
  /** A step in the open plot's history: throws a Refusal for a conflict or a newer schema. */
  collate(plot: PlotRef, change: CollationChange, allowNewerSchema: boolean): Promise<{ changed: boolean; message?: string }>;
  /** New data set aside, or a review flag cleared, in a plot's island: the plot shown again if it is the open one. */
  collationView(target: { store: string; item: string }, change: { kind: "dismiss"; source: ItemRevision } | { kind: "reviewed" }): Promise<void>;
  /** Ask the service what collation says now, and show it (Catalogues, Coverage). */
  refreshCollation(): Promise<void>;
  refreshHistory(): Promise<void>;
}

export const OPEN_PLOT = REASONS["debrief.plotOpen"];
export const NO_SERVICE = "Collation needs Debrief's tool service. Run 'Debrief: Restart tool service'.";
export const NOTHING_TO_CHANGE = "Nothing to change: it is so already.";
export const SHOW_IN_CATALOGUES = "Show in Catalogues";

const titleOf = (plot: PlotRef) => plot.properties.title ?? plot.item;

/**
 * What Coverage or the Catalogues tree asked: a collation step (one step in the plot's history, the
 * plot shown again after), or a change to a plot's island (new data set aside, a review flag
 * cleared). The problem, if it was not done.
 */
export async function collate(host: CollationHost, ask: CoverageAsk, target?: { store: string; item: string }): Promise<string | undefined> {
  const plot = host.plot();
  const where = target ?? (plot && { store: plot.store, item: plot.item });
  if (!where) return OPEN_PLOT;
  if (!host.serviceReady()) return NO_SERVICE;
  const onOpen = !!plot && plot.store === where.store && plot.item === where.item;
  if (ask.kind === "dismiss" || ask.kind === "reviewed") {
    try {
      await host.oneAtATime(() => host.collationView(where, ask.kind === "dismiss" ? { kind: "dismiss", source: ask.source } : { kind: "reviewed" }));
    } catch (error) {
      await host.refreshCollation();
      return (error as Error).message;
    }
    await host.refreshCollation();
    return undefined;
  }
  if (!plot || !onOpen || !plot.base) return OPEN_PLOT;
  let unchanged: string | undefined;
  const done = await changeStep(
    host,
    (allow) => host.collate(plot, ask, allow),
    async (answer) => {
      if (!answer.changed) {
        unchanged = answer.message ?? NOTHING_TO_CHANGE;
        await host.refreshCollation();
        return undefined;
      }
      const problem = await host.reloadPlot();
      await host.refreshHistory();
      return problem;
    },
  );
  if (done.problem) {
    if (done.answer === undefined) await host.refreshCollation();
    return done.problem;
  }
  return unchanged;
}

/** A problem said as a warning, or what was done as information; the problem, if any. */
function say(host: FlowHost, problem: string | undefined, done: string): string | undefined {
  void host.message(problem ? "warning" : "info", problem ?? done);
  return problem;
}

/** The item a row names, at the revision collation last saw. */
function itemOf(host: CollationHost, plot: PlotTarget): { catalogue: string; item: string; revision?: string } {
  const listed = host.coverage()?.items.find((i) => i.catalogue === plot.catalogue && i.item === plot.item);
  return { catalogue: plot.catalogue, item: plot.item, ...(listed?.revision && { revision: listed.revision }) };
}

/** Take an item's data into the open plot, as one step (CAP-11): the row's, or one chosen. */
export async function takeNewData(host: CollationHost, from?: PlotTarget | { catalogue: string; item: string; revision?: string }): Promise<string | undefined> {
  const plot = host.plot();
  if (!plot) return say(host, OPEN_PLOT, "");
  let source = from && ("title" in from ? itemOf(host, from) : from);
  if (!source) {
    const others = host.coverage()?.items.filter((i) => i.role !== "this_plot") ?? [];
    if (!others.length) return say(host, `No other plot in your catalogues has data for ${titleOf(plot)}.`, "");
    const choices = others.map((i, n) => ({ label: i.title, description: i.new_data ? "New data" : i.role === "drawn_from" ? "drawn from" : "", ...(i.new_data?.note && { detail: i.new_data.note }), id: String(n) }));
    const picked = await host.ask({ kind: "pick", text: `Take data from which item into ${titleOf(plot)}?`, choices });
    const chosen = picked === undefined ? undefined : others[Number(picked)];
    if (!chosen) return undefined;
    source = { catalogue: chosen.catalogue, item: chosen.item, ...(chosen.revision && { revision: chosen.revision }) };
  }
  const title = host.coverage()?.items.find((i) => i.catalogue === source.catalogue && i.item === source.item)?.title ?? source.item;
  const problem = await collate(host, { kind: "take", source });
  return say(host, problem, `Took the new data in ${title} into ${titleOf(plot)}, as one step. Undo takes it back.`);
}

/** Set an item's new data aside, until it is revised (CAP-10). */
export async function dismissNewData(host: CollationHost, row?: PlotTarget): Promise<string | undefined> {
  if (!row) return say(host, "Choose an item marked New data in Catalogues to set aside, or use Not now in Coverage.", "");
  const source = itemOf(host, row);
  if (!source.revision) return say(host, host.plot() ? `${row.title} is not marked as new data for the open plot, so there is nothing to set aside.` : "Open the plot the new data is for first.", "");
  const problem = await collate(host, { kind: "dismiss", source: { catalogue: source.catalogue, item: source.item, revision: source.revision } });
  return say(host, problem, `${row.title} set aside. It is marked again if it is revised.`);
}

/** Clear a review flag (CAP-12): on the plot a row names, or the open plot. */
export async function clearReviewFlag(host: CollationHost, row?: PlotTarget): Promise<string | undefined> {
  const problem = await collate(host, { kind: "reviewed" }, row && { store: row.store, item: row.item });
  return say(host, problem, `Review flag cleared${row ? ` on ${row.title}` : ""}. It is flagged again if an item it drew from is revised.`);
}

const refOf = (row: TrackTarget): SourceTrackRef => ({ catalogue: row.catalogue, item: row.item, track: row.track, name: row.name });

/** Same platform as one of the open plot's tracks: a proposal confirmed, or one linked by hand (its track chosen, the one named alike first). */
export async function linkTrack(host: CollationHost, row?: TrackTarget, feature?: string): Promise<string | undefined> {
  if (!host.plot()) return say(host, OPEN_PLOT, "");
  if (!row) return say(host, "Choose a track of another plot in Catalogues first.", "");
  let target = feature;
  if (!target) {
    const match = (name: string) => name.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
    const tracks = [...host.plotTracks()].sort((a, b) => Number(match(b.name) === match(row.name)) - Number(match(a.name) === match(row.name)));
    target = await host.ask({ kind: "pick", text: `${row.name} in ${row.title} is the same platform as which track in the open plot?`, choices: tracks.map((t) => ({ label: t.name, id: t.id })) });
  }
  if (!target) return undefined;
  const problem = await collate(host, { kind: "link", feature: target, source: refOf(row), linked: true });
  return say(host, problem, `${row.name} in ${row.title} linked.`);
}

/** Not this platform: a link or a proposal undone. */
export async function unlinkTrack(host: CollationHost, row?: TrackTarget): Promise<string | undefined> {
  if (!host.plot()) return say(host, OPEN_PLOT, "");
  if (!row) return say(host, "Choose a track of another plot in Catalogues first.", "");
  const platform = host.coverage()?.platforms.find((p) => p.sources.some((s) => s.catalogue === row.catalogue && s.item === row.item && s.track === row.track));
  if (!platform) return say(host, `${row.name} in ${row.title} is not linked to a track in the open plot.`, "");
  const problem = await collate(host, { kind: "link", feature: platform.track, source: refOf(row), linked: false });
  return say(host, problem, `${row.name} in ${row.title} is not ${platform.name}.`);
}

/**
 * The review flags not yet said (CAP-12), each revision once: one notice for all of them, whatever
 * catalogue they are in, with "Show in Catalogues". said keeps those said, across calls.
 */
export function sayReviewFlags(host: FlowHost, flags: readonly ReviewFlag[], said: Set<string>): string | undefined {
  const keyOf = (f: ReviewFlag) => `${f.catalogue}/${f.item}:${f.revised.map((r) => r.revision).join()}`;
  const fresh = flags.filter((f) => !said.has(keyOf(f)));
  for (const f of fresh) said.add(keyOf(f));
  if (!fresh.length) return undefined;
  const text = fresh.length === 1 ? `${fresh[0].note}.` : `${count(fresh.length, "plot")} may need review: items they took data from were revised (${fresh.map((f) => f.title).join(", ")}).`;
  void host.message("info", text, [SHOW_IN_CATALOGUES]).then((choice) => choice === SHOW_IN_CATALOGUES && host.openPanel("catalogues"));
  return text;
}
