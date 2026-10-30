/**
 * The walkthrough step a change completes (CAP-25), one table for both hosts (PAR-14,
 * docs/panel-parity-srd.md). A step is ticked by what the analyst did, by any means (a form, the
 * map, the keyboard, a macro), never by which button was pressed: a change the tool service made,
 * named by its method and parameters. VS Code passes the tool service's requests as they are
 * (src/walkthroughs.ts serviceEvent); the playground names each call to its Python by the method
 * the tool service would have been asked (play/tours.ts callEvent). Free of VS Code and of the DOM.
 */
import { tmaDragEvent } from "../walkthroughs/contribute.mjs";

/** What a change said back, as much of it as decides a step. */
export interface ChangeResult {
  /** False if the change found nothing to change. */
  changed?: boolean;
  /** The feature a change made: a TMA solution. */
  feature?: string;
}

/** Each method's step, from its parameters and result. legsOf says how many legs a TMA solution has (undefined for a track that is not one). */
const TABLE: Record<string, (params: Record<string, unknown>, result: ChangeResult, legsOf: (id: string) => number | undefined) => string | undefined> = {
  // A side kept: not both bearings made ambiguous again.
  "debrief/resolve_ambiguity": (p) => (p.keep && p.keep !== "ambiguous" ? "sideKept" : undefined),
  // A solution made: its feature said back.
  "debrief/tma_create": (_p, r) => (r.feature ? "solutionMade" : undefined),
  // Left out, not counted again; nothing changed (already left out) is not it. A split is not the step: dragging one of its legs is.
  "debrief/tma_exclude_cut": (p, r) => (p.excluded === false || r.changed === false ? undefined : "cutLeftOut"),
  // Which import is the walkthrough's (its log, into its copy's catalogue) is each host's to say.
  "debrief/import": () => "imported",
  "debrief/take_new_data": (_p, r) => (r.changed === false ? undefined : "newDataTaken"),
  "debrief/set_source_preference": (_p, r) => (r.changed === false ? undefined : "sourceChosen"),
  "debrief/remove_jumps": () => "jumpsRemoved",
  "debrief/smooth_track": () => "smoothed",
  "debrief/mark_fix": () => "fixMarked",
  "debrief/edit_track": (p, _r, legsOf) => {
    const edit = p.edit as { action?: string; period?: unknown } | undefined;
    // A TMA solution dragged, by any of a track's drags, or one of its legs: Bearings and TMA's steps, not Tidy a track's shear.
    const tma = tmaDragEvent(legsOf(String(p.feature)), edit?.action, !!edit?.period);
    if (tma !== false) return tma;
    // A shear, not a stretch: the step asks for a shear (panel review, 17 Oct 2026).
    return edit?.action === "shear" ? "sheared" : undefined;
  },
  "debrief/add_annotation": () => "annotationAdded",
  "debrief/set_track_frequencies": () => "frequenciesSet",
  // The export itself, with the image drawn, logged: not the request for an image ID first.
  "debrief/export_image": (p) => (p.image ? "imageExported" : undefined),
  "debrief/open_revision": () => "imageTraced",
};

/** The methods that complete a step, for tests. */
export const STEP_METHODS: readonly string[] = Object.keys(TABLE);

/** The walkthrough step a successful change completes, if any. */
export function walkthroughEvent(method: string, params: Record<string, unknown> = {}, legsOf: (id: string) => number | undefined = () => undefined, result?: unknown): string | undefined {
  const rule = TABLE[method];
  return rule?.(params, (result && typeof result === "object" ? result : {}) as ChangeResult, legsOf);
}
