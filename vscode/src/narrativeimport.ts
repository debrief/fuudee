/**
 * Reading a narrative file into the open plot (CAP-19, CAP-20): what to ask the analyst,
 * from what the file holds (debrief/preview_narrative), as legacy Debrief asked before
 * reading a Word or PDF narrative: which types of entry (with how many of each); all
 * entries or only those within the plot's period; and which track an unknown platform
 * is. Shared by VS Code and the playground, so both ask the same.
 */

/** What a narrative file holds, said before it is read in (debrief/preview_narrative). */
export interface NarrativePreview {
  name: string;
  /** "rep", "docx", "doc" or "pdf". */
  format: string;
  /** A document's dialect, such as "narrative-document" or "rider-narrative"; null for REP. */
  dialect: string | null;
  /** In words: "Word document, read as a narrative log". */
  described: string;
  entries: number;
  /** ASW data: positions of a track, not narrative. */
  fixes: number;
  types: { name: string; count: number }[];
  sources: { name: string; count: number; track_id: string | null }[];
  /** Entries whose document names no platform, and the source they will have. */
  unnamed: number;
  platform: string | null;
  start: string | null;
  end: string | null;
  plot_start: string | null;
  plot_end: string | null;
  /** Entries outside the plot's tracks' period. */
  outside: number;
  omitted: string[];
  notes: string[];
  error?: string;
}

/** The analyst's answers, as the service takes them (debrief_io.Choices). */
export interface NarrativeChoices {
  /** The entry types to read; "" for entries with none. Left out: all. */
  types?: string[];
  within_period?: boolean;
  /** A platform's track: its id, or null for none. */
  tracks?: Record<string, string | null>;
  platform?: string;
}

/** At most this many platforms are asked about; the rest belong to no track. */
export const MAX_ASKED_PLATFORMS = 5;

/** Which questions a file needs: types when it has several; the period when entries fall outside it; the platforms with no track, when the plot has tracks. */
export function questionsFor(preview: NarrativePreview, tracks: readonly { id: string }[]): { types: boolean; period: boolean; platforms: string[] } {
  return {
    types: preview.types.length > 1,
    period: preview.outside > 0 && preview.plot_start !== null,
    platforms: tracks.length ? preview.sources.filter((s) => !s.track_id).map((s) => s.name).slice(0, MAX_ASKED_PLATFORMS) : [],
  };
}

/** A type as the analyst reads it. */
export const typeWords = (name: string) => name || "No type";

/** "All 371 entries" and "Only the 364 within the plot's period (… to …)". */
export function periodChoices(preview: NarrativePreview, format: (iso: string) => string): { all: string; within: string } {
  const inside = preview.entries - preview.outside;
  const span = preview.plot_start && preview.plot_end ? ` (${format(preview.plot_start)} to ${format(preview.plot_end)})` : "";
  return {
    all: `All ${preview.entries.toLocaleString("en-GB")} entries`,
    within: `Only the ${inside.toLocaleString("en-GB")} within the plot's period${span}`,
  };
}

/** The choices from the answers: types left out when all are chosen, so new types are read too. */
export function choicesOf(preview: NarrativePreview, answers: { types?: string[]; withinPeriod?: boolean; tracks?: Record<string, string | null> }): NarrativeChoices {
  const choices: NarrativeChoices = {};
  if (answers.types && answers.types.length < preview.types.length) choices.types = answers.types;
  if (answers.withinPeriod) choices.within_period = true;
  if (answers.tracks && Object.keys(answers.tracks).length) choices.tracks = answers.tracks;
  return choices;
}

/** What the import said, in a sentence: entries read, and how many things were not. */
export function readSummary(done: { entries?: number; omitted?: string[] }, plural: (n: number, one: string, many?: string) => string): string {
  const left = done.omitted?.length ? ` ${done.omitted.length === 1 ? "One thing was" : `${done.omitted.length} things were`} not read; see the History.` : "";
  return `Read ${plural(done.entries ?? 0, "narrative entry", "narrative entries")} into the plot.${left}`;
}

/** The file kinds read as narrative: REP, Word (.docx, .doc) and PDF. */
export const NARRATIVE_FILES = ["rep", "REP", "docx", "DOCX", "doc", "DOC", "pdf", "PDF", "txt"];
