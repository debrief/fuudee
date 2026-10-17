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
export { contextKey };

/**
 * The walkthrough step a successful request to the tool service completes, if any: the
 * change itself, made by any means (a form, the map, the keyboard, a macro), so a step is
 * ticked by what the analyst did, not by which button they pressed.
 */
export function serviceEvent(method: string, params: Record<string, unknown> = {}): string | undefined {
  switch (method) {
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
      return action === "shear" || action === "stretch" ? "sheared" : undefined;
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

/** Where a selection or a time came from that the analyst made: the map, the Outline, the time controller, a command. */
export const BY_HAND = new Set(["map", "outline", "debrief.time", "command"]);

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
  ) {}

  /** The analyst did what a step asks: tick it (and every step waiting for the same event). */
  said(event: string | undefined): void {
    if (!event || !EVENTS.has(event) || this.done.has(event)) return;
    this.done.add(event);
    this.tell(event, true);
  }

  /** Nothing done: every step unticked again (for tests, which play the walkthroughs after much else). */
  forget(): void {
    for (const event of this.done) this.tell(event, false);
    this.done.clear();
  }

  private tell(event: string, done: boolean): void {
    void Promise.resolve(this.run("setContext", contextKey(event), done)).catch(() => undefined);
    for (const step of stepsFor(this.extension, event)) {
      // VS Code's own command; an older VS Code without it still has the context key.
      void Promise.resolve(this.run(done ? "welcome.markStepComplete" : "welcome.markStepIncomplete", step)).catch(() => undefined);
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

/** Build a fresh copy of the sample for a walkthrough into folder, with the analyst's Python (debrief-sample). */
export function prepare(python: string, folder: string, tour: string): Promise<Prepared> {
  return new Promise((resolve, reject) => {
    execFile(python, ["-m", "debrief_sample", "walkthrough", folder, tour], { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) {
        const why = /No module named .?debrief_sample/.test(stderr)
          ? "Debrief's sample data (the debrief-sample Python package) is not installed with Debrief's Python"
          : (stderr.trim().split("\n").pop() ?? error.message);
        return reject(new Error(why));
      }
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop() ?? "") as Prepared);
      } catch {
        reject(new Error("debrief-sample did not say where it made the copy"));
      }
    });
  });
}
