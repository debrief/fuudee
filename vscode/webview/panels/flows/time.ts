/**
 * Time and the narrative (CAP-19, CAP-20, CAP-28): their commands registered once for both hosts
 * (review of 7 Nov 2026, finding 2). Current time to a Timeline entry; how tracks outside the time
 * window are drawn (Context tracks: visible, faint or hidden, Time's title bar); the map's narrative
 * box; and narrative entries added, edited and deleted (with an entry given, at once; without, the
 * Timeline's form). How each host shows and saves them is its TimeHost.
 */
import type { ContextTracksEnum } from "@debrief/schemas";
import type { FlowHost } from "./host.js";
import { registerCommands, type Host, type Run } from "./register.js";

export const TIME_COMMANDS = {
  goToTime: "debrief.goToTime",
  setContextTracks: "debrief.setContextTracks",
  contextVisible: "debrief.contextTracks.visible",
  contextFaint: "debrief.contextTracks.faint",
  contextHidden: "debrief.contextTracks.hidden",
  setNarrativeOnMap: "debrief.setNarrativeOnMap",
  addNarrative: "debrief.addNarrative",
  editNarrative: "debrief.editNarrative",
  deleteNarrative: "debrief.deleteNarrative",
} as const;

export const OPEN_PLOT = "Open a plot first.";
export const CHOOSE_CONTEXT = "Choose visible, faint or hidden.";
const CONTEXTS: readonly string[] = ["visible", "faint", "hidden"];

export interface TimeHost extends Pick<FlowHost, "message"> {
  /** Whether a plot is open. */
  plotOpen(): boolean;
  /** How tracks outside the time window are drawn, saved in the plot's view: the problem, if any. */
  saveContextTracks(choice: ContextTracksEnum): Promise<string | undefined>;
  /** Current time to a Timeline entry (by its id), the window widened or moved to take it in. */
  goToTime: Run;
  setNarrativeOnMap: Run;
  addNarrative: Run;
  editNarrative: Run;
  deleteNarrative: Run;
}

export function registerTime(host: Host, time: TimeHost): void {
  const refuse = (problem: string) => (void time.message("warning", problem), problem);
  const context = async (choice?: unknown) => {
    if (!time.plotOpen()) return refuse(OPEN_PLOT);
    if (typeof choice !== "string" || !CONTEXTS.includes(choice)) return refuse(CHOOSE_CONTEXT);
    const problem = await time.saveContextTracks(choice as ContextTracksEnum);
    return problem ? refuse(problem) : undefined;
  };
  registerCommands(host, TIME_COMMANDS, {
    goToTime: time.goToTime,
    setContextTracks: context,
    contextVisible: () => context("visible"),
    contextFaint: () => context("faint"),
    contextHidden: () => context("hidden"),
    setNarrativeOnMap: time.setNarrativeOnMap,
    addNarrative: time.addNarrative,
    editNarrative: time.editNarrative,
    deleteNarrative: time.deleteNarrative,
  });
}
