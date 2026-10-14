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

/** The choices offered for one track, as a list a keyboard or a finger can choose from. */
export interface ModeChoice {
  label: string;
  description: string;
  mode: PlottingMode;
  /** Use this choice for future imports, and remember it. */
  remember: boolean;
}

export const MODE_LABELS: Record<PlottingMode, string> = { otg: "Over the ground (OTG)", dr: "Dead reckoning (DR)" };
const MODE_DETAILS: Record<PlottingMode, string> = {
  otg: "each fix where it was logged",
  dr: "from the first fix, by each fix's course and speed",
};

export function modeChoices(): ModeChoice[] {
  return [
    ...(["otg", "dr"] as const).map((mode) => ({ label: MODE_LABELS[mode], description: MODE_DETAILS[mode], mode, remember: false })),
    ...(["otg", "dr"] as const).map((mode) => ({ label: `${MODE_LABELS[mode]}, and use this choice for future imports`, description: "Debrief will not ask again", mode, remember: true })),
  ];
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
