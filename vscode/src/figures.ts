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

/**
 * Tool service methods that never change the plot they name: allowed on a plot shown
 * read-only. An allow-list, so a method added later is refused there until it is listed
 * (expert panel, 16 Oct 2026). Held to schemas/vectors/service-methods.json, as Python's
 * WRITING_METHODS are. debrief/export_image records the export in the plot's island, never
 * a step: an earlier revision may be exported (product owner, 16 Oct 2026).
 */
export const LEAVES_PLOT = new Set([
  "debrief/add_plot_file",
  "debrief/coverage",
  "debrief/create_catalogue",
  "debrief/export_image",
  "debrief/figure_id",
  "debrief/find_image_source",
  "debrief/find_jumps",
  "debrief/history",
  "debrief/host_answer",
  "debrief/host_poll",
  "debrief/import",
  "debrief/import_rep",
  "debrief/measure_groups",
  "debrief/narrative",
  "debrief/open",
  "debrief/open_revision",
  "debrief/preview_narrative",
  "debrief/preview_smoothing",
  "debrief/rep_tracks",
  "debrief/review_flags",
  "debrief/stores",
  "debrief/tools_for_selection",
  "debrief/tote",
  "initialize",
  "ping",
  "tools/list",
]);

/** The plot shown read-only, an earlier revision of it: its store and item. */
export interface ShownReadOnly {
  store: string;
  item: string;
}

/**
 * What the extension sends, or why it sends nothing, while an earlier revision of a plot is
 * shown read-only: a method aimed at that plot (its store and item, or a tool's arguments'
 * store and item) that is not in LEAVES_PLOT is refused; debrief/open of it is sent with
 * read_only, so an interrupted change is not recovered, which would write to it. Methods
 * aimed at other plots are sent as they are.
 */
export function guardRequest(method: string, params: Record<string, unknown>, shown: ShownReadOnly | undefined): { refused: string } | { params: Record<string, unknown> } {
  if (!shown) return { params };
  const target = (method === "tools/call" ? (params.arguments as Record<string, unknown> | undefined) : params) ?? {};
  const aimed = target.store === shown.store && target.item === shown.item;
  if (!aimed) return { params };
  if (!LEAVES_PLOT.has(method)) return { refused: READ_ONLY };
  if (method === "debrief/open") return { params: { ...params, read_only: true } };
  return { params };
}

/** What the analyst chose for an export. */
export interface ExportChoice {
  format: ImageFormat;
  preset: ImagePreset;
  theme: ImageTheme;
  footer: boolean;
}
export const DEFAULT_EXPORT: ExportChoice = { format: "png", preset: "slide", theme: "current", footer: true };

/**
 * The choice an export starts from: the size and colours chosen last time, remembered; the
 * footer on, every time, whatever was chosen last (expert panel, 16 Oct 2026: an image
 * without its footer traces only while its metadata survives).
 */
export function startingChoice(remembered: unknown): ExportChoice {
  const last = (remembered && typeof remembered === "object" ? remembered : {}) as Partial<ExportChoice>;
  const preset = (["screen", "slide", "a4_landscape"] as const).find((p) => p === last.preset) ?? DEFAULT_EXPORT.preset;
  const theme = (["current", "light"] as const).find((t) => t === last.theme) ?? DEFAULT_EXPORT.theme;
  return { ...DEFAULT_EXPORT, preset, theme };
}

/** What is remembered of an export for the next: its size and colours only. */
export function rememberedOf(choice: ExportChoice): { preset: ImagePreset; theme: ImageTheme } {
  return { preset: choice.preset, theme: choice.theme };
}

/**
 * Whether an agent may write a file there: inside one of the folders given (the workspace's,
 * or the exports folder set), both already resolved to real paths, so a link cannot lead
 * out (expert panel, 16 Oct 2026). Windows' paths compare without case.
 */
export function insideFolders(file: string, folders: string[], windows = false): boolean {
  const norm = (p: string) => {
    const slashed = p.replace(/\\/g, "/").replace(/\/+$/, "");
    return windows ? slashed.toLowerCase() : slashed;
  };
  const target = norm(file);
  return folders.some((folder) => {
    const root = norm(folder);
    return root !== "" && target.startsWith(`${root}/`);
  });
}

/** Said when an agent's export is aimed outside the folders it may write in. */
export const OUTSIDE_FOLDERS = "An agent may export images only into this workspace's folders or the folder set in Debrief: Export folder.";

/** What an export said, for the analyst: the file, its ID, and whether the plot's export log has it. */
export function describeExported(answer: { file: string; short: string; recorded: boolean; note?: string }, footer: boolean): string {
  const where = footer ? "in its metadata and its corner" : "in its metadata (no footer)";
  const name = answer.file.split(/[\\/]/).pop();
  return `Exported ${name}. Its ID, ${answer.short}, is ${where}.${answer.recorded ? " The plot's export log has it." : ` ${answer.note ?? ""}`}`.trim();
}

/**
 * One plot an image came from, as a list shows it: with when the export was made and the
 * area it showed, so the analyst can tell two exports of one revision apart.
 */
export function describeSource(source: FigureSource): { label: string; detail: string } {
  const step = source.step === source.current ? `step ${source.step}, as it is now` : `step ${source.step}; the plot is at step ${source.current} now`;
  const exported = source.export ? describeExport(source.export) : "";
  const where = [exported, source.store_title ?? source.catalogue, source.copied ? "a copy, with the same content then" : ""].filter(Boolean).join(" · ");
  return { label: `${source.title}, ${step}`, detail: where };
}

/** When an export was made, and the area it showed: "exported 16 Oct 2026 10:42 UTC, 50.30°N to 50.40°N, 4.20°W to 4.00°W". */
export function describeExport(entry: { at: string; viewport?: { bbox: number[] } | null }): string {
  const at = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(entry.at);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const when = at ? `exported ${Number(at[3])} ${months[Number(at[2]) - 1]} ${at[1]} ${at[4]}:${at[5]} UTC` : `exported ${entry.at}`;
  const box = entry.viewport?.bbox;
  if (!box || box.length < 4) return when;
  const lat = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? "S" : "N"}`;
  const lon = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? "W" : "E"}`;
  return `${when}, ${lat(box[1])} to ${lat(box[3])}, ${lon(box[0])} to ${lon(box[2])}`;
}

/** What the map says of the revision shown. */
export function revisionOf(source: FigureSource, short?: string): RevisionShown {
  return { step: source.step, latest: source.current, revision: source.revision, ...(short && { figure: short }) };
}

/** Said when an image's ID names no plot the analyst has. */
export const NOT_FOUND = "No plot in your catalogues has the revision this image was exported at. Add the catalogue it came from, then try again.";
