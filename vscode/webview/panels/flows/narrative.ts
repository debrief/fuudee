/**
 * Reading a platform's log into the open plot (CAP-19, CAP-20), written once for both front ends
 * (PAR-09, PAR-10): a REP file's narrative lines, or a Word or PDF document's entries in legacy
 * Debrief's dialects, as one step, the file kept as a source. Before a file is read, the analyst is
 * asked, one question at a time, in this order (the same sequence in both, never one form):
 * - if it was read in before or has entries in the plot already, whether to skip those or read nothing;
 * - for a document whose answers were given last time for its dialect, whether to read it as then;
 * - which types of entry, with how many of each;
 * - all entries, or only those within the plot's period;
 * - which track each platform the plot does not know is.
 */
import { count, describePeriod, describeTimes } from "../../../src/format.js";
import {
  answersToRemember,
  choicesOf,
  describeAnswers,
  duplicateQuestion,
  NARRATIVE_FILES,
  periodChoices,
  questionsFor,
  readSummary,
  rememberedAnswers,
  typeWords,
  type NarrativeAnswers,
  type NarrativeChoices,
  type NarrativePreview,
} from "../../../src/narrativeimport.js";
import { REASONS } from "../actions.js";
import { changeStep } from "./step.js";
import type { FlowHost, OpenSpec, PickedFile, PlotRef } from "./host.js";

/** Answers remembered for a dialect (debrief-config's; the playground's settings file). */
export type RememberedAnswers = { skipTypes: string[]; withinPeriod: boolean; tracks: Record<string, string | null> };

export interface NarrativeHost extends FlowHost {
  /** What the file holds, said before it is read (debrief/preview_narrative): throws if it cannot be read. */
  previewNarrative(file: PickedFile, plot: PlotRef): Promise<NarrativePreview>;
  narrativeAnswers(dialect: string): Promise<RememberedAnswers | undefined>;
  rememberNarrativeAnswers(dialect: string, answers: RememberedAnswers): Promise<void>;
  plotTracks(): { id: string; name: string }[];
  /** Read it in, one step: throws a Refusal for a conflict or a newer schema. */
  readNarrative(plot: PlotRef, file: PickedFile, choices: NarrativeChoices | undefined, allowNewerSchema: boolean): Promise<{ entries?: number; omitted?: string[] }>;
}

export const NARRATIVE_SPEC: OpenSpec = { title: "Read narrative into this plot", openLabel: "Read narrative", filters: [{ name: "Narrative (REP, Word, PDF)", extensions: NARRATIVE_FILES }, { name: "All files", extensions: ["*"] }] };
export const NOTHING_READ = "Nothing was read.";
export const NO_SERVICE = "Changing the narrative needs Debrief's tool service. Run 'Debrief: Restart tool service'.";
const STOP = "stop";

const isDocument = (name: string) => /\.(docx?|pdf)$/i.test(name);

/** What was read, or why not. */
export type Narrated = { problem?: string; entries?: number; omitted?: string[] };

/** Read a narrative file into the open plot. quiet: an agent's, asked nothing (choices, if given, say). */
export async function importNarrative(host: NarrativeHost, given: { file?: PickedFile; choices?: NarrativeChoices; quiet?: boolean } = {}): Promise<Narrated | undefined> {
  const refuse = (problem: string): Narrated => (void host.message("warning", problem), { problem });
  if (!host.plot()) return refuse(REASONS["debrief.plotOpen"]);
  const file = given.file ?? (await host.pickFile(NARRATIVE_SPEC));
  if (!file) return undefined;
  let choices = given.choices;
  if (!given.quiet && host.serviceReady()) {
    const asked = await askChoices(host, file);
    if (asked === STOP) return refuse(NOTHING_READ);
    if (typeof asked === "string") return refuse(asked);
    choices = asked;
  }
  const plot = host.plot();
  if (!plot) return refuse(REASONS["debrief.plotOpen"]);
  if (!host.serviceReady() || !plot.base) return refuse(NO_SERVICE);
  const done = await changeStep(host, (allow) => host.readNarrative(plot, file, choices, allow));
  if (done.problem) return refuse(done.problem);
  const answer = done.answer ?? {};
  void host.message("info", readSummary(answer, count));
  return { entries: answer.entries, omitted: answer.omitted };
}

/**
 * Before reading a file: if it was read into the plot before, or has entries already in it
 * (product owner, 15 Oct 2026), skip those entries or read nothing; then, for a document, what
 * legacy Debrief asked. "stop" if the analyst stopped, or why it cannot be read.
 */
async function askChoices(host: NarrativeHost, file: PickedFile): Promise<NarrativeChoices | typeof STOP | string> {
  let preview: NarrativePreview;
  try {
    preview = await host.previewNarrative(file, host.plot()!);
  } catch (error) {
    // A REP file is read without questions; a document that cannot be previewed cannot be read.
    return isDocument(file.name) ? (error as Error).message : {};
  }
  if (preview.fixes) return `${preview.name} is ASW data: positions of a track, not narrative. Import it as a plot (Import plot file) for its track.`;
  const again = duplicateQuestion(preview, (iso) => describePeriod(iso));
  if (again) {
    const picked = await host.ask({
      kind: "pick",
      title: again.title,
      text: again.detail,
      choices: [
        { label: again.skip, detail: again.skipDetail },
        { label: "Cancel", detail: "Read nothing" },
      ],
    });
    if (picked !== again.skip) return STOP;
    if (again.nothingNew) return `Nothing was read: every entry of ${preview.name} is already in the plot.`;
  }
  const duplicates: NarrativeChoices = again ? { duplicates: "skip" } : {};
  if (!isDocument(file.name)) return duplicates;
  const asked = await askDocument(host, preview);
  return asked === STOP ? STOP : { ...asked, ...duplicates };
}

/** What legacy Debrief asked before reading a document, one question at a time; "stop" if the analyst stopped. */
async function askDocument(host: NarrativeHost, preview: NarrativePreview): Promise<NarrativeChoices | typeof STOP> {
  const tracks = host.plotTracks();
  const ask = questionsFor(preview, tracks);
  if (!ask.types && !ask.period && !ask.platforms.length) return {};
  // The answers given last time for documents of this dialect (product owner, 15 Oct 2026): user
  // state, never in the plot; offered again, confirmed with one key.
  const dialect = preview.dialect ?? preview.format;
  const before = await host.narrativeAnswers(dialect).catch(() => undefined);
  const offered = rememberedAnswers(preview, tracks, before);
  const entries = `${preview.described}: ${count(preview.entries, "entry", "entries")}`;
  if (offered?.complete) {
    const lastTime = "Read as last time";
    const picked = await host.ask({
      kind: "pick",
      title: `Read ${preview.name}`,
      text: entries,
      choices: [
        { label: lastTime, detail: describeAnswers(preview, offered.answers, tracks) },
        { label: "Choose again", detail: "Which types, the period, which track each platform is" },
      ],
    });
    if (!picked) return STOP;
    if (picked === lastTime) return choicesOf(preview, offered.answers);
  }
  const prefill = offered?.answers ?? {};
  const answers: NarrativeAnswers = {};
  if (ask.types) {
    const choices = preview.types.map((t) => ({ label: typeWords(t.name), description: count(t.count, "entry", "entries") }));
    const picked = await host.askMany({
      title: `Read which types from ${preview.name}?`,
      text: entries,
      choices,
      picked: preview.types.filter((t) => !prefill.types || prefill.types.includes(t.name)).map((t) => typeWords(t.name)),
    });
    if (!picked?.length) return STOP;
    answers.types = preview.types.filter((t) => picked.includes(typeWords(t.name))).map((t) => t.name);
  }
  if (ask.period) {
    const words = periodChoices(preview, (iso) => describeTimes(iso));
    // Last time's answer first, chosen by Enter.
    const choices = prefill.withinPeriod ? [words.within, words.all] : [words.all, words.within];
    const picked = await host.ask({ kind: "pick", title: `${count(preview.outside, "entry", "entries")} of ${preview.name} ${preview.outside === 1 ? "is" : "are"} outside the plot's period`, text: "All entries, or only those within the plot's period", choices });
    if (!picked) return STOP;
    answers.withinPeriod = picked === words.within;
  }
  for (const platform of ask.platforms) {
    const items = [...tracks.map((t) => ({ label: t.name, id: t.id as string | null })), { label: "No track", id: null }];
    const last = prefill.tracks?.[platform];
    const at = last === undefined ? -1 : items.findIndex((i) => i.id === last);
    if (at > 0) items.unshift(...items.splice(at, 1));
    const picked = await host.ask({ kind: "pick", title: `Which track is ${platform}'s?`, text: "Its entries belong to this track: the map shows them beside it.", choices: items.map((i, n) => ({ label: i.label, id: String(n) })) });
    if (picked === undefined) return STOP;
    (answers.tracks ??= {})[platform] = items[Number(picked)].id;
  }
  // Not remembered if it cannot be: these answers still apply to this file.
  await host.rememberNarrativeAnswers(dialect, answersToRemember(preview, tracks, answers, before)).catch(() => undefined);
  return choicesOf(preview, answers);
}
