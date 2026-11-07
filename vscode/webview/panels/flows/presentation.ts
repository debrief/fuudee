/**
 * Colour, hiding and the Outline toolbar's selection (SUB-22; product owner, 28 Oct 2026): their
 * commands registered once for both hosts (review of 7 Nov 2026, finding 2). Colour and hiding are
 * content, each a step in the plot's history; run on their Target (the rows a menu was run on, or
 * named by an agent), else the selection. How each host asks for a colour (VS Code's QuickPick,
 * the playground's swatches) and makes the change is its PresentationHost.
 */
import { registerCommands, type Host, type Run } from "./register.js";

export const PRESENTATION_COMMANDS = {
  setColour: "debrief.setColour",
  hide: "debrief.hide",
  show: "debrief.show",
  /** The Outline toolbar's eye: hide the selected, show them, or show all of them. */
  selectionHide: "debrief.selectionHide",
  selectionShow: "debrief.selectionShow",
  selectionShowAll: "debrief.selectionShowAll",
  colourSelection: "debrief.colourSelection",
  selectAll: "debrief.selectAll",
  selectChildren: "debrief.selectChildren",
  clearSelection: "debrief.clearSelection",
} as const;

/** What a host runs for each, given the command's own arguments. */
export type PresentationHost = { [K in keyof typeof PRESENTATION_COMMANDS]: Run };

export function registerPresentation(host: Host, presentation: PresentationHost): void {
  registerCommands(host, PRESENTATION_COMMANDS, presentation);
}
