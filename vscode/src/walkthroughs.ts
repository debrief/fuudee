/**
 * Walkthroughs (CAP-25): VS Code's Get Started page, ticked off as the analyst works.
 *
 * The steps' words are in walkthroughs/tours.json, shared with the playground; package.json's
 * contributes.walkthroughs is written from it. Each step names an event, and the step ticks
 * when its context key (debrief.walkthrough.<event>) is set: here, when the analyst has done
 * the thing, never when a button was merely pressed. Most events are a request to the tool
 * service that succeeded (serviceEvent); the rest are said where they happen (time moved, a
 * selection, the Tote chosen, an entry chosen in the Timeline, Coverage shown).
 *
 * Every walkthrough works on a fresh copy of the sample (decision, product owner, 17 Oct
 * 2026): built by debrief-sample into this extension's own storage, one catalogue for each
 * walkthrough, never the analyst's catalogues and never the sample.
 */
import { execFile } from "node:child_process";
import tours from "../walkthroughs/tours.json";
import { contextKey } from "../walkthroughs/contribute.mjs";

export interface Tour {
  id: string;
  title: string;
  description: string;
  steps: { id: string; event: string; title: string }[];
}
export const TOURS: Tour[] = tours.tours;
/** Every step's event, from tours.json. */
export const EVENTS: ReadonlySet<string> = new Set(TOURS.flatMap((t) => t.steps.map((s) => s.event)));
/** The event the first step of each walkthrough waits for: its copy opened. */
export const openedEvent = (tour: string) => `${tour}Opened`;
/**
 * What a walkthrough's first step shows once its copy is open, beyond the plot: Bearings and
 * TMA's copy opens with the towed array's cuts listed in Bearings, as the step says.
 */
export const AFTER_OPEN: Record<string, [string, ...unknown[]]> = { tma: ["debrief.showBearings", "sensor-blue-one-towed-array"] };
export { contextKey };

/**
 * The walkthrough step a successful request to the tool service completes, if any: the
 * change itself, made by any means (a form, the map, the keyboard, a macro), so a step is
 * ticked by what the analyst did, not by which button they pressed.
 */
export function serviceEvent(method: string, params: Record<string, unknown> = {}, isSolution: (id: string) => boolean = () => false): string | undefined {
  switch (method) {
    case "debrief/resolve_ambiguity":
      // A side kept: not both bearings made ambiguous again.
      return params.keep && params.keep !== "ambiguous" ? "sideKept" : undefined;
    case "debrief/tma_create":
      return "solutionMade";
    case "debrief/tma_exclude_cut":
      return params.excluded === false ? undefined : "cutLeftOut";
    case "debrief/tma_split_leg":
      return params.join ? undefined : "legsSplit";
    case "debrief/import":
      return "imported";
    case "debrief/take_new_data":
      return "newDataTaken";
    case "debrief/set_source_preference":
      return "sourceChosen";
    case "debrief/remove_jumps":
      return "jumpsRemoved";
    case "debrief/smooth_track":
      return "smoothed";
    case "debrief/mark_fix":
      return "fixMarked";
    case "debrief/edit_track": {
      const action = (params.edit as { action?: string } | undefined)?.action;
      // A TMA solution dragged, by any of a track's drags: Bearings and TMA's step, not Tidy a track's shear.
      if (isSolution(String(params.feature))) return ["move", "rotate", "shear", "stretch"].includes(String(action)) ? "solutionDragged" : undefined;
      // A shear, not a stretch: the step asks for a shear (panel review, 17 Oct 2026).
      return action === "shear" ? "sheared" : undefined;
    }
    case "debrief/add_annotation":
      return "annotationAdded";
    case "debrief/set_track_frequencies":
      return "frequenciesSet";
    case "debrief/export_image":
      // The host's second call, with the image drawn: the export itself, logged.
      return params.image ? "imageExported" : undefined;
    case "debrief/open_revision":
      return "imageTraced";
    default:
      return undefined;
  }
}

/** A Tote with something to compare: a primary and at least one secondary. */
export const toteCompares = (tote: { primary?: string | null; secondaries?: string[] | null } | undefined) => !!tote?.primary && !!tote.secondaries?.length;

/**
 * Where a selection or a time came from that the analyst made: the map, the Outline, the time
 * controller. Not a command: Debrief selects what it has just added that way (panel review,
 * 17 Oct 2026).
 */
export const BY_HAND = new Set(["map", "outline", "debrief.time"]);

/** The walkthrough an event belongs to: each step waits for an event of its own. */
export const tourOfEvent = (event: string): string | undefined => TOURS.find((t) => t.steps.some((s) => s.event === event))?.id;

/**
 * The walkthrough a newcomer starts with: opened on the Get Started page on Debrief's first
 * activation after install, once only (product owner, 22 Oct 2026). Where a newcomer gains an
 * overall understanding, so it is put in front of them; never again on later starts.
 */
export const FIRST_TOUR = "explore";
/** The flag in VS Code's global state that says the first walkthrough has been opened: set once, never cleared. */
export const FIRST_RUN_KEY = "debrief.walkthrough.openedOnInstall";

/** The parts of an extension's globalState this needs (vscode.Memento), or a stand-in in tests. */
export interface FlagState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

/**
 * On the first activation after install, open the first walkthrough on the Get Started page;
 * on every later one, nothing. The flag is set before the page is asked for, so a page that
 * fails to open is not asked for again on every start. Says whether it opened the page.
 */
export async function openOnFirstRun(state: FlagState, run: (command: string, ...args: unknown[]) => Thenable<unknown>, extension: string, log: (line: string) => void = () => undefined): Promise<boolean> {
  if (state.get<boolean>(FIRST_RUN_KEY)) return false;
  await state.update(FIRST_RUN_KEY, true);
  try {
    await run("workbench.action.openWalkthrough", `${extension}#${FIRST_TOUR}`, false);
    log(`walkthrough_opened_on_install tour=${FIRST_TOUR}`);
    return true;
  } catch {
    log("walkthrough_open_on_install_failed");
    return false;
  }
}

/** Import and collate's navigation log, beside the walkthrough's catalogue (debrief_sample.walkthrough.LOG_FILE). */
export const LOG_FILE = "blue-one-nav-log.rep";

/** The Get Started page's id for each step waiting for an event: extension#walkthrough#step. */
export function stepsFor(extension: string, event: string): string[] {
  return TOURS.flatMap((t) => t.steps.filter((s) => s.event === event).map((s) => `${extension}#${t.id}#${t.id}.${s.id}`));
}

/**
 * What the analyst has done, as the walkthroughs see it: each event once. Its context key is
 * set, which the steps' completionEvents wait for; and the steps are marked complete outright,
 * because VS Code's Get Started page counts a context key only if it changes after the page's
 * service starts, which may be long after (a key already set then is never counted).
 */
export class WalkthroughProgress {
  private readonly done = new Set<string>();

  constructor(
    private readonly run: (command: string, ...args: unknown[]) => Thenable<unknown>,
    private readonly extension: string,
    private readonly log: (line: string) => void = () => undefined,
  ) {}

  /** The analyst did what a step asks: tick it (and every step waiting for the same event). */
  said(event: string | undefined): void {
    if (!event || !EVENTS.has(event) || this.done.has(event)) return;
    this.done.add(event);
    this.tell(event, true);
  }

  /** A walkthrough started again: its steps unticked, so each ticks again on its fresh copy. */
  forgetTour(tour: string): void {
    for (const step of TOURS.find((t) => t.id === tour)?.steps ?? []) {
      // Unticked on the page too, whatever this session saw: progress there outlives a session.
      this.done.delete(step.event);
      this.tell(step.event, false);
    }
  }

  /** Nothing done: every step unticked again (for tests, which play the walkthroughs after much else). */
  forget(): void {
    for (const event of this.done) this.tell(event, false);
    this.done.clear();
  }

  private tell(event: string, done: boolean): void {
    // The context key is how a step is ticked (completionEvents); it is VS Code's documented way.
    void Promise.resolve(this.run("setContext", contextKey(event), done)).catch(() => this.log(`walkthrough_context_failed event=${event}`));
    for (const step of stepsFor(this.extension, event)) {
      // VS Code's own command, not part of its API: it may change. Said in the log when it fails;
      // the context key still ticks the step whenever the page's service is running.
      const command = done ? "welcome.markStepComplete" : "welcome.markStepIncomplete";
      void Promise.resolve(this.run(command, step)).catch(() => this.log(`walkthrough_mark_failed command=${command}`));
    }
  }

  /** The events said so far, for tests and agents. */
  seen(): string[] {
    return [...this.done];
  }
}

/** What debrief-sample made for a walkthrough: its catalogue, the copy, and for Import and collate the log to import. */
export interface Prepared {
  catalogue: string;
  catalogue_title: string;
  item: string;
  title: string;
  log?: string;
}

/** Why the copy could not be made, as the analyst can act on it: the sample's packages missing from Debrief's Python, or Python's own last line. */
export function whyNotPrepared(stderr: string, fallback: string): string {
  if (/No module named .?(debrief_sample|pyarrow)/.test(stderr)) return "Debrief's sample data (the debrief-sample Python package and its pyarrow) is not installed with Debrief's Python";
  return stderr.trim().split("\n").pop() || fallback;
}

/** Build a fresh copy of the sample for a walkthrough into folder, with the analyst's Python (debrief-sample). */
export function prepare(python: string, folder: string, tour: string): Promise<Prepared> {
  return new Promise((resolve, reject) => {
    execFile(python, ["-m", "debrief_sample", "walkthrough", folder, tour], { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(whyNotPrepared(stderr, error.message)));
      }
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop() ?? "") as Prepared);
      } catch {
        reject(new Error("debrief-sample did not say where it made the copy"));
      }
    });
  });
}
