/**
 * Exporting the map as an image, and finding an image's source (SUB-25, EXT-05, OUT-04), written once
 * for both front ends (PAR-09 to PAR-11).
 *
 * Export: the map as the analyst sees it, as an image carrying an ID that traces it to the plot at the
 * revision shown, asked in three steps: the size (the one chosen last time first), what it shows (the
 * image ID in a corner, on again each time; light colours, for print), and where to save it, as PNG or
 * SVG (VS Code's save dialog; the playground's download, named, §5). The size and colours are
 * remembered; the footer is not. It finishes with what was exported, "Copy ID" and, where a file can
 * be shown on disk (VS Code only, §5), "Show in folder".
 *
 * Find source: by an image file (a PNG or SVG, or a Word or PowerPoint file of them, read for their
 * IDs) or the ID typed from its corner; several exports matching are listed to choose from, never one
 * picked silently; the plot is shown as it was when the image was exported, read-only, with "Go to
 * latest".
 */
import type { FigureSource } from "@debrief/schemas";
import { figureIdProblem } from "@debrief/kernel";
import { describeExported, describeSource, NOT_FOUND, rememberedOf, startingChoice, type ExportChoice } from "../../../src/figures.js";
import type { ExportedImage, TracedImage } from "../../../src/service.js";
import { fileNameFor, PRESETS, type ImageFormat } from "../../exportlogic.js";
import { REASONS } from "../actions.js";
import type { FlowHost, OpenSpec, PickedFile, PlotRef, SaveTarget } from "./host.js";

export interface ExportHost extends FlowHost {
  /** The size and colours chosen last time, as kept (VS Code's global state; the playground's localStorage). */
  rememberedExport(): unknown;
  rememberExport(remembered: ReturnType<typeof rememberedOf>): void;
  /** A fresh image ID for the plot at the revision shown (debrief/figure_id). */
  figureId(plot: PlotRef): Promise<{ id: string; short: string; revision: string }>;
  /** The map drawn as chosen, its ID put into its metadata and the export recorded in the plot's export log: the file's bytes, what was exported and the map's notes. */
  drawAndStamp(plot: PlotRef, choice: ExportChoice, figure: { id: string; short: string; revision: string }, target: SaveTarget): Promise<{ data: Uint8Array; answer: ExportedImage; notes: string[] }>;
  copy(text: string): Promise<void>;
  /** Show a file saved on disk in its folder: VS Code only (the playground's files are downloads, §5). */
  revealFile?(target: SaveTarget): void;
}

export const NO_SERVICE = "exporting an image needs Debrief's tool service. Run 'Debrief: Restart tool service'.";
export const COPY_ID = "Copy ID";
export const SHOW_IN_FOLDER = "Show in folder";
const SEQUENCE = "Export image";
const FOOTER = { label: "Image ID in a corner", detail: "A small ID, for when Word or PowerPoint drops an image's metadata" };
const LIGHT = { label: "Light colours, for print", detail: "Whatever the editor's theme" };

/** What an export was given: an agent's or a test's choices and file, asked nothing and told nothing. */
export interface ExportGiven {
  choice?: Partial<ExportChoice>;
  target?: SaveTarget;
}

/** Export the map as an image: what was exported, why not (said as "The image was not exported: …"), or undefined if the analyst cancelled. */
export async function exportImage(host: ExportHost, given: ExportGiven = {}): Promise<ExportedImage | string | undefined> {
  const refuse = (problem: string) => (void host.message("warning", `The image was not exported: ${problem}`), problem);
  const plot = host.plot();
  if (!plot) return refuse(REASONS["debrief.plotOpen"]);
  if (!host.serviceReady()) return refuse(NO_SERVICE);
  let choice: ExportChoice = { ...startingChoice(host.rememberedExport()), ...given.choice };
  let target = given.target;
  let figure: { id: string; short: string; revision: string };
  try {
    figure = await host.figureId(plot);
  } catch (error) {
    return refuse((error as Error).message);
  }
  if (!target) {
    const size = await host.ask({
      kind: "pick",
      sequence: { name: SEQUENCE, step: 1, of: 3 },
      title: "size",
      text: "The size to draw the map at",
      choices: PRESETS.map((p) => ({ label: p.label, detail: p.detail })),
      default: PRESETS.find((p) => p.id === choice.preset)?.label,
    });
    const preset = PRESETS.find((p) => p.label === size);
    if (!preset) return undefined;
    const shows = await host.askMany({
      sequence: { name: SEQUENCE, step: 2, of: 3 },
      title: "what it shows",
      choices: [FOOTER, LIGHT],
      picked: [...(choice.footer ? [FOOTER.label] : []), ...(choice.theme === "light" ? [LIGHT.label] : [])],
    });
    if (!shows) return undefined;
    choice = { ...choice, preset: preset.id, footer: shows.includes(FOOTER.label), theme: shows.includes(LIGHT.label) ? "light" : "current" };
    const png = { name: "PNG image", extensions: ["png"] };
    const svg = { name: "SVG image", extensions: ["svg"] };
    const chosen = await host.chooseSave({
      title: `${SEQUENCE} (3 of 3): where to save it, as PNG or SVG`,
      saveLabel: "Export",
      name: fileNameFor(plot.properties.title ?? plot.item, figure.short, choice.format),
      filters: choice.format === "svg" ? [svg, png] : [png, svg],
    });
    if (!chosen) return undefined;
    // The name says the format; without one, the format chosen, added.
    const suffix = /\.(png|svg)$/i.exec(chosen.name)?.[1]?.toLowerCase();
    if (suffix) choice.format = suffix as ImageFormat;
    target = suffix ? chosen : { name: `${chosen.name}.${choice.format}`, ...(chosen.path && { path: `${chosen.path}.${choice.format}` }) };
    // Only the size and colours are remembered: the footer is on again next time (expert panel, 16 Oct 2026).
    host.rememberExport(rememberedOf(choice));
  } else {
    const suffix = /\.(png|svg)$/i.exec(target.name)?.[1]?.toLowerCase();
    if (!suffix) return refuse("the file's name must end .png or .svg.");
    choice.format = suffix as ImageFormat;
  }
  let done: Awaited<ReturnType<ExportHost["drawAndStamp"]>>;
  try {
    done = await host.drawAndStamp(plot, choice, figure, target);
    await host.writeFile(target, done.data);
  } catch (error) {
    return refuse((error as Error).message);
  }
  if (!given.target) {
    const said = [describeExported(done.answer, choice.footer), ...done.notes].join(" ");
    const saved = target;
    void host.message("info", said, [COPY_ID, ...(host.revealFile ? [SHOW_IN_FOLDER] : [])]).then((button) => {
      if (button === COPY_ID) void host.copy(done.answer.id);
      if (button === SHOW_IN_FOLDER) host.revealFile?.(saved);
    });
  }
  return done.answer;
}

/** What Find source answers (debrief/find_image_source). */
export interface Traced {
  images: TracedImage[];
  problem?: string;
  skipped?: { where: string; why: string }[];
}

export interface FindHost extends FlowHost {
  findImageSource(where: { file: PickedFile } | { id: string }): Promise<Traced>;
  /** Show the plot as it was at an image's revision, read-only, at the view and time exported: its title, or the problem. */
  showRevision(source: FigureSource, image: TracedImage): Promise<{ title: string } | { problem: string }>;
  /** Leave the earlier revision shown, for the plot as it is now. */
  openLatestRevision(): Promise<void>;
}

export const FIND_NO_SERVICE = "Finding an image's source needs Debrief's tool service. Run 'Debrief: Restart tool service'.";
export const BY_FILE = "Choose an image file…";
export const BY_ID = "Type the ID from the image's corner…";
export const GO_TO_LATEST = "Go to latest";
export const IMAGE_FILES: OpenSpec = {
  title: "Find source of image",
  openLabel: "Find source",
  filters: [
    { name: "Images", extensions: ["png", "svg"] },
    { name: "Word and PowerPoint", extensions: ["docx", "pptx", "odt", "odp"] },
    { name: "All files", extensions: ["*"] },
  ],
};

/**
 * Find the plot an image came from and show it as it was then, read-only. An agent or a test may
 * give the file or the ID, and, having seen the list, which to choose (counting from 0). The
 * problem, if any.
 */
export async function findImageSource(host: FindHost, given: { file?: PickedFile; id?: string; choose?: number } = {}): Promise<string | undefined> {
  const refuse = (problem: string) => (void host.message("warning", problem), problem);
  if (!host.serviceReady()) return refuse(FIND_NO_SERVICE);
  let where: { file: PickedFile } | { id: string } | undefined = given.file ? { file: given.file } : given.id ? { id: given.id } : undefined;
  if (!where) {
    const how = await host.ask({
      kind: "pick",
      title: "Find source of image",
      text: "By the image's file, or the ID in its corner",
      choices: [
        { label: BY_FILE, detail: "A PNG or SVG, or a Word or PowerPoint file with images in it", icon: "file-media" },
        { label: BY_ID, detail: "Such as DBF-PTET-KG8R-B9EM-69", icon: "symbol-key" },
      ],
    });
    if (how === BY_FILE) {
      const file = await host.pickFile(IMAGE_FILES);
      if (!file) return undefined;
      where = { file };
    } else if (how === BY_ID) {
      const typed = await host.askText({ title: "Find source of image", prompt: "The ID in the image's corner", placeholder: "DBF-PTET-KG8R-B9EM-69", validate: (text) => (text.trim() ? figureIdProblem(text) : undefined) });
      if (!typed?.trim()) return undefined;
      where = { id: typed };
    } else return undefined;
  }
  let answer: Traced;
  try {
    answer = await host.findImageSource(where);
  } catch (error) {
    return refuse((error as Error).message);
  }
  // A picture in a document that could not be read (encrypted, say): said, the others still traced.
  const unread = (answer.skipped ?? []).map((s) => `${s.where} was not read: ${s.why}.`).join(" ");
  const found = answer.images.flatMap((image) => image.sources.map((source) => ({ image, source })));
  if (!found.length) return refuse(answer.problem ?? NOT_FOUND);
  if (unread) void host.message("warning", unread);
  // Several exports, or plots, match: the analyst chooses, by when each was exported and what it
  // showed; never the first or the last silently (expert panel, 16 Oct 2026).
  if (given.choose !== undefined && !found[given.choose]) return refuse(`There are ${found.length} to choose from.`);
  let chosen = given.choose !== undefined ? found[given.choose] : found.length === 1 ? found[0] : undefined;
  if (!chosen) {
    const choices = found.map((f, i) => ({ ...describeSource(f.source), description: f.image.short, id: String(i) }));
    const picked = await host.ask({ kind: "pick", title: "Find source of image: which export", text: `${found.length} exports or plots match this image's ID: choose by when it was exported and what it showed`, choices });
    chosen = picked === undefined ? undefined : found[Number(picked)];
    if (!chosen) return undefined;
  }
  const shown = await host.showRevision(chosen.source, chosen.image);
  if ("problem" in shown) return refuse(shown.problem);
  void host
    .message("info", `${shown.title} at step ${chosen.source.step}, as when image ${chosen.image.short} was exported. It is shown read-only.`, [GO_TO_LATEST])
    .then((go) => (go === GO_TO_LATEST ? host.openLatestRevision() : undefined));
  return undefined;
}
