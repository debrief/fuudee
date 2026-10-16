/**
 * Exported images and tracing them back (SUB-25, EXT-05, OUT-04): what both hosts say, so
 * VS Code and the playground word it alike. The ID's format is @debrief/kernel's
 * figureid.ts (held to the vectors Python shares); the image is drawn by the map
 * (webview/exportimage.ts); everything else is the tool service's (debrief_tools.figures).
 */
import type { FigureSource, RevisionShown } from "@debrief/schemas";
import type { ImageFormat, ImagePreset, ImageTheme } from "../webview/exportlogic.js";

/** Said when a change is asked of an earlier revision shown read-only. */
export const READ_ONLY = "This is the plot as it was when the image was exported, shown read-only, so it cannot be changed. Choose Go to latest to change the plot.";

/** Tool service methods that change a plot, its history or its island: refused while an earlier revision is shown. */
export const CHANGING_METHODS = new Set([
  "tools/call",
  "debrief/undo",
  "debrief/redo",
  "debrief/goto",
  "debrief/set_colour",
  "debrief/set_hidden",
  "debrief/set_track_frequencies",
  "debrief/set_view",
  "debrief/add_annotation",
  "debrief/edit_annotation",
  "debrief/delete_annotations",
  "debrief/set_north_arrow",
  "debrief/add_narrative",
  "debrief/edit_narrative",
  "debrief/delete_narrative",
  "debrief/import_narrative",
  "debrief/edit_track",
  "debrief/split_track",
  "debrief/merge_tracks",
  "debrief/remove_jumps",
  "debrief/smooth_track",
  "debrief/mark_fix",
  "debrief/take_new_data",
  "debrief/set_source_preference",
  "debrief/link_tracks",
  "debrief/dismiss_new_data",
  "debrief/clear_review_flag",
]);

/** What the analyst chose for an export, remembered for the next one. */
export interface ExportChoice {
  format: ImageFormat;
  preset: ImagePreset;
  theme: ImageTheme;
  footer: boolean;
}
export const DEFAULT_EXPORT: ExportChoice = { format: "png", preset: "slide", theme: "current", footer: true };

/** What an export said, for the analyst: the file, its ID, and whether the plot's export log has it. */
export function describeExported(answer: { file: string; short: string; recorded: boolean; note?: string }, footer: boolean): string {
  const where = footer ? "in its metadata and its corner" : "in its metadata (no footer)";
  const name = answer.file.split(/[\\/]/).pop();
  return `Exported ${name}. Its ID, ${answer.short}, is ${where}.${answer.recorded ? " The plot's export log has it." : ` ${answer.note ?? ""}`}`.trim();
}

/** One plot an image came from, as a list shows it. */
export function describeSource(source: FigureSource): { label: string; detail: string } {
  const step = source.step === source.current ? `step ${source.step}, as it is now` : `step ${source.step}; the plot is at step ${source.current} now`;
  const where = [source.store_title ?? source.catalogue, source.copied ? "a copy, with the same content then" : ""].filter(Boolean).join(" · ");
  return { label: `${source.title}, ${step}`, detail: where };
}

/** What the map says of the revision shown. */
export function revisionOf(source: FigureSource, short?: string): RevisionShown {
  return { step: source.step, latest: source.current, revision: source.revision, ...(short && { figure: short }) };
}

/** Said when an image's ID names no plot the analyst has. */
export const NOT_FOUND = "No plot in your catalogues has the revision this image was exported at. Add the catalogue it came from, then try again.";
