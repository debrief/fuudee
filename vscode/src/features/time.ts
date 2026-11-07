/**
 * VS Code's time and narrative commands (CAP-20, CAP-28): current time to a Timeline entry, the
 * map's narrative box, and narrative entries added, edited and deleted (with an entry, at once;
 * without, the Timeline's form). Registered by the shared registration (webview/panels/flows/time.ts),
 * as the playground's are; out of activate() (review of 7 Nov 2026, finding 2), given what they need.
 */
import type { NarrativeSpec, SharedStateChange } from "@debrief/schemas";
import type { TimelineView } from "../panels/timelineview.js";
import type { NarrativeChange } from "../service.js";
import type { Session } from "../session.js";

/** What the time and narrative commands need of activate(). */
export interface TimeDeps {
  session: Session;
  timeline: TimelineView;
  /** A problem said as a warning, and returned. */
  report(problem: string | undefined): string | undefined;
  /** A problem saving view state: the views shown as saved again. */
  resync(problem: string | undefined): string | undefined;
  /** A narrative change, one step, one at a time. */
  narrate(change: NarrativeChange): Promise<{ problem?: string; feature?: string; entries?: number; omitted?: string[] }>;
  saveNarrativeOnMap(on: boolean): Promise<string | undefined>;
  /** Shared state set as a tool sets it (CAP-28): shown, not saved. */
  applyToolState(change: SharedStateChange, origin: string, byHand: boolean): boolean;
  /** A walkthrough's step done (CAP-25). */
  tickHere(event: string): void;
}

export function timeCommands(deps: TimeDeps) {
  const { session, timeline, report, resync, narrate, saveNarrativeOnMap, applyToolState, tickHere } = deps;
  // The Timeline: choosing an entry moves current time to it. Outside the window shown, the
  // window widens or moves to take it in, shown but never saved, as for a tool's time (CAP-28).
  const goToTimeCommand = (id?: string) => {
    const entry = timeline.entries.find((e) => e.id === id);
    const range = session.time?.range;
    if (!entry || !range) return report("Choose an entry in the Timeline.");
    const start = Date.parse(entry.start);
    const at = new Date(start).toISOString();
    const within = start >= Date.parse(range.start) && start <= Date.parse(range.end);
    const time = { current: at, range: within ? range : { start: at < range.start ? at : range.start, end: at > range.end ? at : range.end } };
    applyToolState({ time }, "timeline", false);
    tickHere("timelineChosen");
    return undefined;
  };
  // The map's narrative box off or on, for agents and tests, as the Timeline's box does: view state, never a step.
  const setNarrativeOnMapCommand = async (on?: boolean) => {
    if (!session.current) return report("Open a plot first.");
    return report(await saveNarrativeOnMap(on !== false).then(resync));
  };
  // Narrative entries (CAP-20): with an entry, added at once (agents, macros, tests); without, the Timeline's form.
  const addNarrativeCommand = async (spec?: NarrativeSpec) => {
    if (!session.current) return report("Open a plot first.");
    if (!spec) return timeline.openForm();
    return narrate({ kind: "add", entry: spec }).then((done) => (report(done.problem), done));
  };
  const editNarrativeCommand = async (id?: string, changes?: Partial<NarrativeSpec>) => {
    const entry = timeline.entries.find((e) => e.id === id && e.kind === "narrative");
    if (!entry) return report("Choose a narrative entry in the Timeline.");
    if (!changes) return timeline.openForm(entry.id);
    return narrate({ kind: "edit", feature: entry.id, entry: changes }).then((done) => (report(done.problem), done));
  };
  const deleteNarrativeCommand = async (id?: string | string[]) => {
    const ids = (Array.isArray(id) ? id : id ? [id] : []).filter((i) => timeline.entries.some((e) => e.id === i && e.kind === "narrative"));
    if (!ids.length) return report("Choose a narrative entry in the Timeline.");
    return narrate({ kind: "delete", features: ids }).then((done) => (report(done.problem), done));
  };
  return { goToTimeCommand, setNarrativeOnMapCommand, addNarrativeCommand, editNarrativeCommand, deleteNarrativeCommand };
}
