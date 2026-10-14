/**
 * How each track imported is plotted: over the ground (OTG) or by dead reckoning (DR),
 * asked of each track as legacy Debrief asked, with "Use this choice for future imports"
 * (CAP-01; decision, product owner, 14 Oct 2026). The choice remembered is user state:
 * it is kept in the analyst's configuration (debrief-config), shared by VS Code and the
 * Python services, and shown in VS Code's Settings as debrief.trackImportMode; never in a
 * catalogue or a plot file. The importer is given the answer, and reads none of this.
 *
 * Free of VS Code, so it is shared with the playground and tested on its own.
 */
import type { TrackImportMode } from "@debrief/config";

export type PlottingMode = "otg" | "dr";

/** The two ways to plot a track offered for one track, as a list a keyboard or a finger can choose from. */
export interface ModeOption {
  label: string;
  description: string;
  mode: PlottingMode;
}

/** The answer for one track: how it is plotted, and whether to use this choice for future imports, and remember it. */
export interface ModeChoice {
  mode: PlottingMode;
  remember: boolean;
}

export const MODE_LABELS: Record<PlottingMode, string> = { otg: "Over the ground (OTG)", dr: "Dead reckoning (DR)" };
const MODE_DETAILS: Record<PlottingMode, string> = {
  otg: "each fix where it was logged",
  dr: "from the first fix, by each fix's course and speed",
};

/** As legacy Debrief asked: over the ground or by dead reckoning; and, apart from that choice, a box to tick to use it for future imports. */
export function modeChoices(): ModeOption[] {
  return (["otg", "dr"] as const).map((mode) => ({ label: MODE_LABELS[mode], description: MODE_DETAILS[mode], mode }));
}

/** The box beside the choice, as legacy Debrief had it. */
export const REMEMBER_LABEL = "Use this choice for future track imports";
/** What the box says when it is ticked or not, where it is a line in a list (VS Code's Quick Pick): a ticked box or an empty one, and on or off in words for a screen reader. */
export function rememberItem(on: boolean): { label: string; description: string } {
  return { label: `${on ? "$(pass-filled)" : "$(circle-large-outline)"} ${REMEMBER_LABEL}`, description: on ? "on: Debrief will not ask again" : "off: choose it to turn on" };
}

/** The title of the question for one track: "How is RED ONE plotted? (1 of 3)". */
export function modeQuestion(track: string, place: number, count: number): string {
  return `How is ${track} plotted? (${place + 1} of ${count})`;
}

/** What the import's notes say of a remembered choice in VS Code: how to change it, or be asked again. */
export const REMEMBERED_IN_VSCODE =
  "To change it, set Debrief: Track import mode in Settings; to be asked again for each track, run Debrief: Ask again whether imported tracks are OTG or DR.";
/** The same, in the playground. */
export const REMEMBERED_IN_PLAYGROUND = "To be asked again for each track, choose Ask again under Import.";

/**
 * Ask how each track is plotted, unless a choice is remembered: ask is given the track's
 * name, its place and how many there are, and answers with a choice, or undefined to stop.
 * A choice to remember applies to the tracks still to come, and is passed to remember.
 * Resolves to the modes by track name and whether a remembered choice was used, or
 * undefined if the analyst stopped.
 */
export async function chooseModes(
  tracks: string[],
  remembered: TrackImportMode,
  ask: (track: string, index: number, count: number) => PromiseLike<ModeChoice | undefined>,
  remember: (mode: PlottingMode) => void | Promise<void>,
): Promise<{ modes: Record<string, PlottingMode>; remembered: boolean } | undefined> {
  if (remembered !== "ask") return { modes: Object.fromEntries(tracks.map((t) => [t, remembered])), remembered: true };
  const modes: Record<string, PlottingMode> = {};
  for (const [index, track] of tracks.entries()) {
    const choice = await ask(track, index, tracks.length);
    if (!choice) return undefined;
    modes[track] = choice.mode;
    if (choice.remember) {
      await remember(choice.mode);
      for (const rest of tracks.slice(index + 1)) modes[rest] = choice.mode;
      break;
    }
  }
  return { modes, remembered: false };
}
