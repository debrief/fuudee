/**
 * Importing a plot (CAP-01, SUB-17, EXT-14), written once for both front ends (PAR-09 to PAR-12): a
 * REP file, its tracks each plotted over the ground or by dead reckoning as asked (or as the
 * analyst chose for future imports; "Ask again" clears that); a legacy .dpf plot; a Word or PDF
 * document, narrative or (ASW data) one platform's track, named as legacy Debrief asked; or a
 * Debrief plot file with its whole history. Each becomes a plot of its own in a catalogue.
 *
 * Nothing is dropped silently: a summary says what came in, with "Show what was not imported" when
 * something did not, and "Open plot". The plot is offered, never opened by itself (PAR-12). Which
 * catalogue it goes into is VS Code's question only: the playground has one (§5).
 */
import type { TrackImportMode } from "@debrief/config";
import { count } from "../../../src/format.js";
import { chooseModes, modeChoices, modeQuestion, REMEMBER_LABEL, type ModeChoice, type PlottingMode } from "../../../src/importmode.js";
import type { NarrativePreview } from "../../../src/narrativeimport.js";
import { confirmNewerSchema } from "./runtool.js";
import { isRefusal, type FlowHost, type OpenSpec, type PickedFile } from "./host.js";

/** What an import brought in (debrief/import_file). */
export interface ImportReport {
  item: string;
  tracks: string[];
  fixes: number;
  annotations?: number;
  narrative_entries?: number;
  omitted: string[];
  notes?: string[];
}
/** A Debrief plot file added with its history (debrief/add_plot_file). */
export interface AddedPlotFile {
  item: string;
  title: string;
  steps: number;
}
/** How the tracks are plotted, as the importer takes it, and the note to add when a remembered choice was used; or an ASW document's track's name. */
export interface ImportOptions {
  modes?: string | Record<string, PlottingMode>;
  remembered?: string;
  track_name?: string;
}

export interface ImportHost extends FlowHost {
  /**
   * The catalogue to import into, by its store's id: the one named, the only one that can be
   * written, or (VS Code, §5) the one the analyst chooses. A problem when there is none to write
   * to; undefined if the analyst cancelled.
   */
  chooseCatalogue(purpose: "import" | "add", given?: string): Promise<string | { problem: string } | undefined>;
  /** What a Word or PDF document holds: narrative, or (fixes) positions of one platform. */
  previewDocument(file: PickedFile): Promise<NarrativePreview | undefined>;
  /** The tracks a REP file would import, to ask how each is plotted. */
  repTracks(file: PickedFile): Promise<string[]>;
  /** The choice remembered for future imports (debrief-config's, VS Code's Settings), or "ask". */
  importMode(): Promise<TrackImportMode>;
  setImportMode(mode: TrackImportMode): Promise<void>;
  /** What the import's notes add to a remembered choice: how to change it, in this front end's words. */
  readonly rememberedNote: string;
  /** Import the file as a new plot: throws a Refusal for a newer schema. */
  importFile(store: string, file: PickedFile, options: ImportOptions, allowNewerSchema: boolean): Promise<ImportReport>;
  /** Add a Debrief plot file with its history: throws a Refusal for a newer schema. */
  addPlotFile(store: string, file: PickedFile, allowNewerSchema: boolean): Promise<AddedPlotFile>;
  /** Read the catalogues again, so the new plot is listed. */
  refreshCatalogues(): Promise<void>;
  /** Show what was not imported, beside the map (plot content: never written to a log, NFR-14). */
  showNotImported(file: PickedFile, omitted: readonly string[]): Promise<void>;
  openPlotIn(store: string, item: string): Promise<void>;
}

export const NO_SERVICE = "Debrief's tool service is not running. Run 'Debrief: Restart tool service', and see the Debrief output if it fails.";
export const NOTHING_IMPORTED = "Nothing was imported.";
export const SHOW_NOT_IMPORTED = "Show what was not imported";
export const OPEN_PLOT = "Open plot";
export const ASK_AGAIN_SAID = "Debrief will ask, for each track imported, whether it is plotted over the ground (OTG) or by dead reckoning (DR).";

/** The files Import offers. */
export const IMPORT_FILES: OpenSpec = {
  title: "Import plot file",
  openLabel: "Import",
  filters: [
    { name: "Plot files", extensions: ["rep", "REP", "dpf", "DPF", "docx", "DOCX", "doc", "DOC", "pdf", "PDF", "geojson", "json"] },
    { name: "REP files", extensions: ["rep", "REP"] },
    { name: "Legacy plot files", extensions: ["dpf", "DPF"] },
    { name: "Narrative (Word, PDF)", extensions: ["docx", "DOCX", "doc", "DOC", "pdf", "PDF"] },
    { name: "Debrief plot files", extensions: ["geojson", "json"] },
  ],
};
/** The files Add a plot file offers (VS Code only, §5: the playground adds them through Import). */
export const PLOT_FILES: OpenSpec = { title: "Add plot file", openLabel: "Add plot file", filters: [{ name: "Debrief plot files", extensions: ["geojson", "json"] }] };

const isDocument = (name: string) => /\.(docx?|pdf)$/i.test(name);
const isPlotFile = (name: string) => /\.(geojson|json)$/i.test(name);
const isLegacyPlot = (name: string) => /\.(dpf|xml)$/i.test(name);

/** What the analyst (or an agent) gave: the catalogue, the file, and answers. quiet: an agent's, asked nothing and told without buttons. */
export interface ImportGiven {
  store?: string;
  file?: PickedFile;
  modes?: string | Record<string, PlottingMode>;
  trackName?: string;
  quiet?: boolean;
}
/** What happened: the plot made, what its notes say and what was not imported; or why not. Undefined if the analyst stopped. */
export type Imported = { item: string; notes?: string[]; omitted?: string[] } | { problem: string } | undefined;

/** How one track is plotted, asked as legacy Debrief asked, with the box for future imports. */
async function askMode(host: FlowHost, track: string, index: number, of: number): Promise<ModeChoice | undefined> {
  const modes = modeChoices();
  const answer = await host.askRemembering({
    title: modeQuestion(track, index, of),
    text: "Over the ground, as logged, or dead reckoned from course and speed",
    choices: modes.map((c) => ({ label: c.label, description: c.description, id: c.mode })),
    remember: REMEMBER_LABEL,
  });
  return answer && { mode: answer.choice as PlottingMode, remember: answer.remember };
}

/** Import a REP, .dpf, Word or PDF file, or a Debrief plot file, into a catalogue. */
export async function importPlot(host: ImportHost, given: ImportGiven = {}): Promise<Imported> {
  const fail = (severity: "warning" | "error", problem: string) => (void host.message(severity, problem), { problem });
  if (!host.serviceReady()) return fail("error", NO_SERVICE);
  const store = await host.chooseCatalogue("import", given.store);
  if (typeof store === "object") return fail("warning", store.problem);
  if (!store) return undefined;
  const file = given.file ?? (await host.pickFile(IMPORT_FILES));
  if (!file) return undefined;
  if (isPlotFile(file.name)) return addPlot(host, store, file, given.quiet);
  const stopped = () => (void host.message("info", NOTHING_IMPORTED), undefined);
  try {
    // How each track is plotted (CAP-01): a legacy plot says; a REP file's tracks are asked about.
    let options: ImportOptions = {};
    if (given.modes) options = { modes: given.modes };
    else if (isDocument(file.name)) {
      // A document: narrative, which has no tracks to ask about; or ASW data, a track, which legacy Debrief asked a name for.
      if (given.trackName) options = { track_name: given.trackName };
      else if (!given.quiet) {
        const preview = await host.previewDocument(file).catch(() => undefined);
        if (preview?.fixes) {
          const name = await host.askText({ title: "Name for this track", prompt: `${preview.name} holds ${count(preview.fixes, "position")} of one platform.`, value: preview.name.replace(/\.[^.]+$/, "") });
          if (name === undefined) return stopped();
          options = { track_name: name };
        }
      }
    } else if (!isLegacyPlot(file.name)) {
      const tracks = await host.repTracks(file);
      const asked = await chooseModes(tracks, await host.importMode(), (track, index, of) => askMode(host, track, index, of), (mode) => host.setImportMode(mode));
      if (!asked) return stopped();
      options = { modes: asked.modes, ...(asked.remembered && { remembered: host.rememberedNote }) };
    }
    let report: ImportReport;
    try {
      report = await host.importFile(store, file, options, false);
    } catch (error) {
      if (!isRefusal(error, "newer_schema")) throw error;
      if (!(await confirmNewerSchema(host, (error as Error).message))) return stopped();
      report = await host.importFile(store, file, options, true);
    }
    await host.refreshCatalogues();
    const parts = [count(report.tracks.length, "track"), count(report.fixes, "fix", "fixes")];
    if (report.annotations) parts.push(count(report.annotations, "annotation"));
    if (report.narrative_entries) parts.push(count(report.narrative_entries, "narrative entry", "narrative entries"));
    // A remembered choice is said, with how to change it (CAP-01).
    const remembered = options.remembered ? ` ${report.notes?.at(-1) ?? ""}` : "";
    const summary = `Imported ${parts.join(", ")}.${remembered}`;
    const done = { item: report.item, notes: report.notes ?? [], omitted: report.omitted };
    if (given.quiet) {
      void host.message("info", summary);
      return done;
    }
    // Nothing is dropped silently (EXT-14): what was not imported is said, and can be shown. The plot is offered, not opened.
    const choice = report.omitted.length ? await host.message("warning", `${summary} Some content was not imported.`, [SHOW_NOT_IMPORTED, OPEN_PLOT]) : await host.message("info", summary, [OPEN_PLOT]);
    if (choice === SHOW_NOT_IMPORTED) await host.showNotImported(file, report.omitted);
    else if (choice === OPEN_PLOT) await host.openPlotIn(store, report.item);
    return done;
  } catch (error) {
    return fail("error", (error as Error).message);
  }
}

/**
 * Add a Debrief plot file received from a colleague: one file holding the plot, its view and its
 * whole history (decision 13 Oct), so undo, redo and going back to a step work on what the sender
 * did. A file whose history fails its checksums is refused.
 */
export async function addPlotFile(host: ImportHost, given: { store?: string; file?: PickedFile; quiet?: boolean } = {}): Promise<{ item: string } | { problem: string } | undefined> {
  if (!host.serviceReady()) return (void host.message("error", NO_SERVICE), { problem: NO_SERVICE });
  const store = await host.chooseCatalogue("add", given.store);
  if (typeof store === "object") return (void host.message("warning", store.problem), store);
  if (!store) return undefined;
  const file = given.file ?? (await host.pickFile(PLOT_FILES));
  if (!file) return undefined;
  return addPlot(host, store, file, given.quiet);
}

async function addPlot(host: ImportHost, store: string, file: PickedFile, quiet?: boolean): Promise<{ item: string } | { problem: string } | undefined> {
  try {
    let added: AddedPlotFile;
    try {
      added = await host.addPlotFile(store, file, false);
    } catch (error) {
      if (!isRefusal(error, "newer_schema")) throw error;
      if (!(await confirmNewerSchema(host, (error as Error).message))) return (void host.message("info", NOTHING_IMPORTED), undefined);
      added = await host.addPlotFile(store, file, true);
    }
    await host.refreshCatalogues();
    const said = `Added ${added.title} with its history: ${count(added.steps, "step")}, undo and redo included.`;
    if (quiet) void host.message("info", said);
    else void host.message("info", said, [OPEN_PLOT]).then((choice) => (choice === OPEN_PLOT ? host.openPlotIn(store, added.item) : undefined));
    return { item: added.item };
  } catch (error) {
    void host.message("error", (error as Error).message);
    return { problem: (error as Error).message };
  }
}

/** Ask again, for each track imported, how it is plotted: the choice for future imports forgotten. */
export async function askAgain(host: ImportHost): Promise<void> {
  await host.setImportMode("ask");
  void host.message("info", ASK_AGAIN_SAID);
}
