/**
 * Reading a narrative file into the open plot (CAP-19, CAP-20): what to ask the analyst,
 * from what the file holds (debrief/preview_narrative), as legacy Debrief asked before
 * reading a Word or PDF narrative: which types of entry (with how many of each); all
 * entries or only those within the plot's period; and which track an unknown platform
 * is. Shared by VS Code and the playground, so both ask the same. And, first, for a file
 * read into the plot before or with entries already in it (product owner, 15 Oct 2026):
 * skip the entries already there, or read nothing.
 */

/** A step that read the same file (by its content hash) into the plot, still in it. */
export interface EarlierRead {
  step: number;
  /** When the step began, UTC ISO. */
  at: string;
  /** Who: the agent's name. */
  by: string;
  /** The step's name in the History: "Narrative read from red-one-log.docx". */
  how: string;
  /** The source's name as it was read in. */
  name: string;
}

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
  /** The file's content hash, as a source's is recorded. */
  content_hash?: string;
  /** Steps in the plot that read this file before, under any name; empty if none. */
  earlier?: EarlierRead[];
  /** Entries the plot has already: the same time, source and text. */
  already?: number;
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
  /** For a file read in before, or with entries already in the plot: skip those, or add them again. */
  duplicates?: "skip" | "add";
}

/**
 * What to say before reading a file read into the plot before, or with entries already in
 * it; undefined if neither. title and detail say what and when; skip labels the choice to
 * read only the entries not in the plot, and nothingNew is true when there are none.
 */
export function duplicateQuestion(
  preview: NarrativePreview,
  format: (iso: string) => string,
): { title: string; detail: string; skip: string; skipDetail: string; nothingNew: boolean } | undefined {
  const earlier = preview.earlier?.length ? preview.earlier[preview.earlier.length - 1] : undefined;
  const already = preview.already ?? 0;
  if (!earlier && !already) return undefined;
  const n = (count: number) => count.toLocaleString("en-GB");
  const entries = (count: number) => `${n(count)} ${count === 1 ? "entry" : "entries"}`;
  const there =
    already === preview.entries
      ? preview.entries === 1
        ? "Its entry is in the plot."
        : `All ${entries(preview.entries)} are in the plot.`
      : already
        ? `${n(already)} of its ${entries(preview.entries)} ${already === 1 ? "is" : "are"} in the plot.`
        : "None of its entries is in the plot now.";
  const title = earlier
    ? `${preview.name} is already in the plot`
    : `${n(already)} of the ${entries(preview.entries)} in ${preview.name} ${already === 1 ? "is" : "are"} already in the plot`;
  const detail = earlier ? `Read in on ${format(earlier.at)} by ${earlier.by} (step ${earlier.step}, ${earlier.how}). ${there}` : "The same time, source and text.";
  const left = preview.entries - already;
  return {
    title,
    detail,
    skip: "Skip entries already in the plot",
    skipDetail: left ? `Read the ${entries(left)} not in the plot` : "Nothing new to read",
    nothingNew: left === 0,
  };
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
export const typeWords = (name: string) => name || "(no type)";

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
export function choicesOf(preview: NarrativePreview, answers: NarrativeAnswers): NarrativeChoices {
  const choices: NarrativeChoices = {};
  if (answers.types && answers.types.length < preview.types.length) choices.types = answers.types;
  if (answers.withinPeriod) choices.within_period = true;
  if (answers.tracks && Object.keys(answers.tracks).length) choices.tracks = answers.tracks;
  return choices;
}

/** The analyst's answers to the questions a file needs; a platform's track by its id, or null for none. */
export interface NarrativeAnswers {
  types?: string[];
  withinPeriod?: boolean;
  tracks?: Record<string, string | null>;
}

/**
 * Answers remembered for the file's dialect, as debrief-config keeps them (user state: the
 * types not read, only within the period, a platform's track by name), made answers to this
 * file's questions (product owner, 15 Oct 2026: offered again, confirmed with one key).
 * complete when every question is answered from memory; a platform not remembered, or whose
 * track the plot has not, is left to ask.
 */
export function rememberedAnswers(
  preview: NarrativePreview,
  tracks: readonly { id: string; name: string }[],
  remembered: { skipTypes: string[]; withinPeriod: boolean; tracks: Record<string, string | null> } | undefined,
): { answers: NarrativeAnswers; complete: boolean } | undefined {
  if (!remembered) return undefined;
  const ask = questionsFor(preview, tracks);
  const answers: NarrativeAnswers = {};
  let complete = true;
  if (ask.types) {
    answers.types = preview.types.map((t) => t.name).filter((name) => !remembered.skipTypes.includes(name));
    if (!answers.types.length) answers.types = preview.types.map((t) => t.name);
  }
  if (ask.period) answers.withinPeriod = remembered.withinPeriod;
  const key = (name: string) => name.split(/\s+/).join(" ").toLowerCase();
  for (const platform of ask.platforms) {
    if (!(platform in remembered.tracks)) {
      complete = false;
      continue;
    }
    const name = remembered.tracks[platform];
    const track = name === null ? undefined : tracks.find((t) => key(t.name) === key(name));
    if (name !== null && !track) {
      complete = false;
      continue;
    }
    (answers.tracks ??= {})[platform] = track ? track.id : null;
  }
  return { answers, complete };
}

/** The answers to remember for the dialect: what was asked and answered, with the platforms remembered before. */
export function answersToRemember(
  preview: NarrativePreview,
  tracks: readonly { id: string; name: string }[],
  answers: NarrativeAnswers,
  before: { tracks: Record<string, string | null> } | undefined,
): { skipTypes: string[]; withinPeriod: boolean; tracks: Record<string, string | null> } {
  const named: Record<string, string | null> = { ...(before?.tracks ?? {}) };
  for (const [platform, id] of Object.entries(answers.tracks ?? {})) named[platform] = id === null ? null : (tracks.find((t) => t.id === id)?.name ?? null);
  return {
    skipTypes: answers.types ? preview.types.map((t) => t.name).filter((name) => !answers.types!.includes(name)) : [],
    withinPeriod: answers.withinPeriod ?? false,
    tracks: named,
  };
}

/** The remembered answers in a line, to confirm: "All types but COMMS; only within the plot's period; HMS NELSON is NELSON". */
export function describeAnswers(preview: NarrativePreview, answers: NarrativeAnswers, tracks: readonly { id: string; name: string }[]): string {
  const parts: string[] = [];
  if (answers.types) {
    const left = preview.types.map((t) => t.name).filter((name) => !answers.types!.includes(name));
    parts.push(left.length ? `all types but ${left.map(typeWords).join(", ")}` : "all types");
  }
  if (answers.withinPeriod !== undefined) parts.push(answers.withinPeriod ? "only within the plot's period" : "all entries, in the plot's period or not");
  for (const [platform, id] of Object.entries(answers.tracks ?? {})) {
    parts.push(id === null ? `${platform} on no track` : `${platform} is ${tracks.find((t) => t.id === id)?.name ?? id}`);
  }
  const line = parts.join("; ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** What the import said, in a sentence: entries read, and how many things were not. */
export function readSummary(done: { entries?: number; omitted?: string[] }, plural: (n: number, one: string, many?: string) => string): string {
  const left = done.omitted?.length ? ` ${done.omitted.length === 1 ? "One thing was" : `${done.omitted.length} things were`} not read; see the History.` : "";
  return `Read ${plural(done.entries ?? 0, "narrative entry", "narrative entries")} into the plot.${left}`;
}

/** The file kinds read as narrative: REP, Word (.docx, .doc) and PDF. */
export const NARRATIVE_FILES = ["rep", "REP", "docx", "DOCX", "doc", "DOC", "pdf", "PDF", "txt"];
