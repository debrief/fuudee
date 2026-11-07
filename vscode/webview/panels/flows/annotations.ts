/**
 * Annotations (CAP-03 to CAP-05): their commands registered once for both hosts (review of 7 Nov
 * 2026, finding 2). Each takes what an agent or a test gives instead of asking; without it, the
 * host's form (VS Code's beside the map, the playground's dialog). How each host asks and makes
 * the change is its AnnotationsHost.
 */
import { registerCommands, type Host, type Run } from "./register.js";

export const ANNOTATION_COMMANDS = {
  add: "debrief.addAnnotation",
  edit: "debrief.editAnnotation",
  delete: "debrief.deleteAnnotation",
  /** The north arrow, shown or taken off: one step. */
  northArrow: "debrief.toggleNorthArrow",
} as const;

/** What a host runs for each, given the command's own arguments. */
export type AnnotationsHost = { [K in keyof typeof ANNOTATION_COMMANDS]: Run };

export function registerAnnotations(host: Host, annotations: AnnotationsHost): void {
  registerCommands(host, ANNOTATION_COMMANDS, annotations);
}
