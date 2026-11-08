/**
 * Track edits (CAP-13 to CAP-18): their commands registered once for both hosts (review of 7 Nov
 * 2026, finding 2). Each is run on its Target (the tracks it was run on from a menu, or named by an
 * agent), else the selection; with what an agent or a test gives instead of asking, nothing is
 * asked, in either host, given in the same shape (TrackEditArgs below, held to both by the
 * cross-host parity check, test/parity). How each host asks (VS Code's input boxes and QuickPicks,
 * the playground's forms) and how it makes the change is its own: the TrackEditsHost.
 */
import type { TimeRange, TrackEdit } from "@debrief/schemas";
import { registerCommands, type Host, type Target } from "./register.js";

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

/** The one track an edit acts on: its id, or a Target (a menu's rows, or the ids given); left out, the one track selected. */
export type TrackTarget = string | Target;
/** A move, rotation, shear or stretch, as given: the edit less its action (a rotation without a pivot turns about the fix nearest current time). */
export type EditGiven = Omit<TrackEdit, "action">;
/** A split, as given: when (current time, left out) and the parts' names (the service's, left out). */
export interface SplitGiven {
  at?: string;
  names?: [string, string];
}
/** A merge, as given: the merged track's name (the earliest's, left out). */
export interface MergeGiven {
  name?: string;
}
/** Jumps, as given: the speed a jump exceeds (the track's default, left out); and the times to remove ("all" found), or none, to find them only. */
export interface JumpsGiven {
  threshold?: { value: number; unit: string };
  times?: string[] | "all";
}
/** Smoothing, as given: over how many fixes, of what period (the whole track, left out); apply false to preview only. */
export interface SmoothGiven {
  window: number;
  period?: TimeRange;
  apply?: boolean;
}
/** A fix's mark, as given: its colour (with the palette's name), label, comment, and whether its time label or symbol always shows; null takes one off. */
export interface MarkGiven {
  colour?: string | null;
  colour_name?: string;
  label?: string | null;
  comment?: string | null;
  show_label?: boolean | null;
  show_symbol?: boolean | null;
}
/** A single fix moved, as given: { position } or { distance, bearing }. */
export type FixMoveGiven = Omit<TrackEdit, "action" | "fix_time">;
/** How a track is plotted: over the ground or by dead reckoning. */
export type PlottingModeGiven = "otg" | "dr";
/** Over the ground after a change made while plotted by dead reckoning: given, refused unless this says to discard that change. */
export interface PlottingModeOptions {
  discard_dr_changes?: boolean;
}
/** Labels, symbols and arrows, as given: each an interval ("10 min", or { value, unit }), "off", "all" or null for the default; left out, unchanged. */
export type FrequenciesGiven = Partial<Record<"label_interval" | "symbol_interval" | "arrow_interval", string | { value: number; unit: string } | null>>;

/**
 * Each track edit's arguments, as agents and tests give them in both hosts: the target first, then
 * what would otherwise be asked. With nothing after the target, each host asks with its own form.
 * Merge and Frequencies act on several tracks: their ids, or a Target. From VS Code's Outline
 * menus a second argument may be the other rows chosen, which a host reads as the tracks instead.
 */
export interface TrackEditArgs {
  frequencies: [target?: string | string[] | Target, given?: FrequenciesGiven | readonly unknown[]];
  move: [target?: TrackTarget, given?: EditGiven];
  rotate: [target?: TrackTarget, given?: EditGiven];
  shear: [target?: TrackTarget, given?: EditGiven];
  stretch: [target?: TrackTarget, given?: EditGiven];
  split: [target?: TrackTarget, given?: SplitGiven];
  merge: [target?: string[] | Target, given?: MergeGiven | readonly unknown[]];
  removeJumps: [target?: TrackTarget, given?: JumpsGiven];
  smooth: [target?: TrackTarget, given?: SmoothGiven];
  /** The fix by its time; without a change, the host asks what to do to it (without a time, which fix first). */
  markFix: [target?: TrackTarget, time?: string, given?: MarkGiven];
  /** The fix by its time; without a change, the host asks where it goes (without a time, which fix first). */
  moveFix: [target?: TrackTarget, time?: string, given?: FixMoveGiven];
  plottingMode: [target?: TrackTarget, given?: PlottingModeGiven, options?: PlottingModeOptions];
}

/** What a host runs for each track edit, given the command's own arguments (TrackEditArgs). */
export type TrackEditsHost = { [K in keyof typeof TRACK_EDIT_COMMANDS]: (...args: TrackEditArgs[K]) => unknown };

/** The track edits' commands, registered with the host. */
export function registerTrackEdits(host: Host, edits: TrackEditsHost): void {
  registerCommands(host, TRACK_EDIT_COMMANDS, edits);
}
