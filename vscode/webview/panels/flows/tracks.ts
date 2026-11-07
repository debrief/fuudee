/**
 * Track edits (CAP-13 to CAP-18): their commands registered once for both hosts (review of 7 Nov
 * 2026, finding 2). Each is run on its Target (the tracks it was run on from a menu, or named by an
 * agent), else the selection; with what an agent or a test gives instead of asking, nothing is
 * asked. How each host asks (VS Code's input boxes and QuickPicks, the playground's forms) and how
 * it makes the change is its own: the TrackEditsHost.
 */
import { registerCommands, type Host, type Run } from "./register.js";

export const TRACK_EDIT_COMMANDS = {
  /** Labels, symbols and arrows: how often (CAP-16). */
  frequencies: "debrief.setTrackFrequencies",
  move: "debrief.moveTrack",
  rotate: "debrief.rotateTrack",
  shear: "debrief.shearTrack",
  stretch: "debrief.stretchTrack",
  split: "debrief.splitTrack",
  merge: "debrief.mergeTracks",
  removeJumps: "debrief.removeJumps",
  smooth: "debrief.smoothTrack",
  markFix: "debrief.markFix",
  moveFix: "debrief.moveFix",
  plottingMode: "debrief.plottingMode",
} as const;

/** What a host runs for each track edit, given the command's own arguments: (target, then what an agent gives). */
export type TrackEditsHost = { [K in keyof typeof TRACK_EDIT_COMMANDS]: Run };

/** The track edits' commands, registered with the host. */
export function registerTrackEdits(host: Host, edits: TrackEditsHost): void {
  registerCommands(host, TRACK_EDIT_COMMANDS, edits);
}
