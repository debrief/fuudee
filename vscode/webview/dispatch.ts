/**
 * The message glue between the webview components and their host, written once for both front
 * ends (PAR-13, docs/panel-parity-srd.md). Free of VS Code and of the DOM.
 *
 * For each component, two halves:
 * - What its page sends: the component's callbacks as messages (timeEvents, toteEvents,
 *   coverageEvents, timelineEvents, bearingsEvents). VS Code's pages send them with postMessage;
 *   the playground, which builds those components in its own page, hands them straight to the
 *   receiver below.
 * - What the host does with each: a receiver that checks every message (the schema and its
 *   kind's members, CON-08), refuses one its page never sends, and calls the host's handler for its
 *   kind (receiveTime, receiveTote, receiveCoverage, receiveTimeline, receiveBearings, receiveMap,
 *   receiveForm, receiveAnnotation, receiveResults). VS Code's panels receive them from their
 *   webviews; the playground from its frames (the map, the tool form, the annotation form) and its
 *   own components. Each host supplies only its transport, its check (the schema's validator is
 *   compiled differently in each) and what its handlers do.
 */
import type {
  AmbiguityResolution,
  AnnotationSpec,
  ItemRevision,
  NarrativeSpec,
  ParameterValue,
  RenderedImage,
  SourceTrackRef,
  TimeRange,
  TimeState,
  TmaRequest,
  ToteView,
  TrackEdit,
  Viewport,
  WebviewMessage,
} from "@debrief/schemas";
import type { CoverageControlHost } from "./coveragecontrol.js";
import type { TimeControlHost } from "./timecontrol.js";
import type { TimelineHost } from "./timelinecontrol.js";
import type { TmaControlHost } from "./tmacontrol.js";
import type { ToteControlHost } from "./totecontrol.js";
import type { CoverageAsk } from "./panels/flows/collation.js";

/** Where a page's messages go: VS Code's postMessage, or the playground's receiver. */
export type Send = (message: Record<string, unknown>) => void;
/** A host's check of a message: the message, or it throws. */
export type Check = (raw: unknown) => WebviewMessage;
/** Told, with the component, when a message is refused (never with the message: it can quote plot content, NFR-14). */
export type Refused = (component: Component) => void;

export type Component = "time" | "tote" | "coverage" | "timeline" | "bearings" | "map" | "form" | "annotation" | "results";
type Table = Partial<Record<WebviewMessage["kind"], (message: WebviewMessage) => unknown>>;

/** The message kinds each component's page sends, for tests. */
export const SENT: Record<Component, readonly string[]> = {
  time: ["ready", "time_changed", "window_changed", "playing_changed"],
  tote: ["ready", "tote_changed"],
  coverage: ["ready", "source_chosen", "link_changed", "take_asked", "dismiss_asked", "review_cleared"],
  timeline: ["ready", "timeline_chosen", "save_narrative", "delete_narrative", "narrative_on_map_changed", "undo_asked", "redo_asked"],
  bearings: ["ready", "tma_create", "tma_guess", "tma_exclude", "tma_split", "tma_time_asked", "resolve_asked", "tma_resolve", "tma_select", "tma_menu", "tma_cut_off", "tma_plot_drawn", "tma_panes"],
  map: ["ready", "selection_changed", "time_changed", "viewport_changed", "show_hidden", "edit_annotation", "edit_track", "fix_chosen", "resolve_asked", "cut_chosen", "annotation_drawn", "image_rendered", "latest_asked", "tma_preview", "tma_guessed"],
  form: ["ready", "cancel", "run_tool"],
  annotation: ["ready", "cancel", "save_annotation", "delete_annotation"],
  results: ["ready"],
};

/** A component's receiver: each message checked, one its page never sends refused, the rest handled. Resolves when the handler has. */
function receiver(component: Component, table: Table, check: Check, refused: Refused): (raw: unknown) => Promise<void> {
  return async (raw) => {
    let message: WebviewMessage;
    try {
      message = check(raw);
    } catch {
      return refused(component);
    }
    const handle = SENT[component].includes(message.kind) ? table[message.kind] : undefined;
    if (!handle) return refused(component);
    await handle(message);
  };
}

// --- Time -----------------------------------------------------------------------------------------

export interface TimeHandlers {
  ready(): void;
  timeChanged(time: TimeState): void;
  windowChanged(window: TimeRange): void;
  playingChanged(playing: boolean): void;
}
/** The time controller's callbacks as messages. contextChanged is not one: VS Code's title menu chooses it (A4). */
export const timeEvents = (send: Send): TimeControlHost => ({
  moved: (time) => send({ kind: "time_changed", time }),
  windowSaved: (window) => send({ kind: "window_changed", time_range: window }),
  playing: (playing) => send({ kind: "playing_changed", playing }),
});
export const receiveTime = (h: TimeHandlers, check: Check, refused: Refused) =>
  receiver("time", { ready: () => h.ready(), time_changed: (m) => h.timeChanged(m.time!), window_changed: (m) => h.windowChanged(m.time_range!), playing_changed: (m) => h.playingChanged(m.playing === true) }, check, refused);

// --- The Tote -------------------------------------------------------------------------------------

export interface ToteHandlers {
  ready(): void;
  toteChanged(view: ToteView): void;
}
export const toteEvents = (send: Send): ToteControlHost => ({ changed: (view) => send({ kind: "tote_changed", tote_view: view }) });
export const receiveTote = (h: ToteHandlers, check: Check, refused: Refused) => receiver("tote", { ready: () => h.ready(), tote_changed: (m) => h.toteChanged(m.tote_view!) }, check, refused);

// --- Coverage -------------------------------------------------------------------------------------

export interface CoverageHandlers {
  ready(): void;
  /** What the analyst asked: the shared collation flow's ask (panels/flows/collation.ts). */
  asked(ask: CoverageAsk): unknown;
}
export const coverageEvents = (send: Send): CoverageControlHost => ({
  choose: (track: string, period: TimeRange, source: SourceTrackRef) => send({ kind: "source_chosen", feature_id: track, time_range: period, source }),
  link: (track: string, source: SourceTrackRef, linked: boolean) => send({ kind: "link_changed", feature_id: track, source, linked }),
  take: (item: ItemRevision) => send({ kind: "take_asked", item_revision: item }),
  dismiss: (item: ItemRevision) => send({ kind: "dismiss_asked", item_revision: item }),
  reviewed: () => send({ kind: "review_cleared" }),
});
export const receiveCoverage = (h: CoverageHandlers, check: Check, refused: Refused) =>
  receiver(
    "coverage",
    {
      ready: () => h.ready(),
      source_chosen: (m) => h.asked({ kind: "prefer", feature: m.feature_id!, period: m.time_range!, source: m.source! }),
      link_changed: (m) => h.asked({ kind: "link", feature: m.feature_id!, source: m.source!, linked: m.linked === true }),
      take_asked: (m) => h.asked({ kind: "take", source: m.item_revision! }),
      dismiss_asked: (m) => h.asked({ kind: "dismiss", source: m.item_revision! }),
      review_cleared: () => h.asked({ kind: "reviewed" }),
    },
    check,
    refused,
  );

// --- The Timeline ---------------------------------------------------------------------------------

export interface TimelineHandlers {
  ready(): void;
  chosen(id: string): void;
  /** Add an entry, or change the one named: the host answers the page (narrative_saved, or the control's saved()). */
  save(narrative: NarrativeSpec, id?: string): unknown;
  remove(id: string): unknown;
  narrativeOnMap(on: boolean): unknown;
  history(move: "undo" | "redo"): unknown;
}
export const timelineEvents = (send: Send): TimelineHost => ({
  choose: (id) => send({ kind: "timeline_chosen", feature_id: id }),
  save: (narrative, id) => send({ kind: "save_narrative", narrative, ...(id && { feature_id: id }) }),
  remove: (id) => send({ kind: "delete_narrative", feature_id: id }),
  narrativeOnMap: (on) => send({ kind: "narrative_on_map_changed", narrative_on_map: on }),
  // Ctrl+Z outside a text box: the host undoes the plot, as from the map.
  history: (move) => send({ kind: move === "undo" ? "undo_asked" : "redo_asked" }),
});
export const receiveTimeline = (h: TimelineHandlers, check: Check, refused: Refused) =>
  receiver(
    "timeline",
    {
      ready: () => h.ready(),
      timeline_chosen: (m) => h.chosen(m.feature_id!),
      save_narrative: (m) => h.save(m.narrative!, m.feature_id ?? undefined),
      delete_narrative: (m) => h.remove(m.feature_id!),
      narrative_on_map_changed: (m) => h.narrativeOnMap(m.narrative_on_map === true),
      undo_asked: () => h.history("undo"),
      redo_asked: () => h.history("redo"),
    },
    check,
    refused,
  );

// --- Bearings -------------------------------------------------------------------------------------

export interface BearingsHandlers {
  ready(): unknown;
  /** A solution asked for: the host answers the page (tma_made, or the control's made()). */
  create(request: TmaRequest): unknown;
  guess(request: TmaRequest): unknown;
  exclude(solution: string, cutIds: string[], excluded: boolean): unknown;
  split(solution: string, at: string): unknown;
  time(at: string): unknown;
  resolve(cut: string, keep: "port" | "starboard" | "ambiguous"): unknown;
  resolveCuts(resolution: AmbiguityResolution): unknown;
  select(id: string, at: string): unknown;
  menu(id: string, at: string): unknown;
  cutOff(degrees: number): unknown;
  drawn(height: number, paneWidths: number[]): unknown;
  panes(shown: string[]): unknown;
}
export const bearingsEvents = (send: Send): TmaControlHost => ({
  create: (tma_request) => send({ kind: "tma_create", tma_request }),
  guess: (tma_request) => send({ kind: "tma_guess", tma_request }),
  exclude: (feature_id, cut_ids, excluded) => send({ kind: "tma_exclude", feature_id, cut_ids, excluded }),
  split: (feature_id, current_time) => send({ kind: "tma_split", feature_id, current_time }),
  time: (current_time) => send({ kind: "tma_time_asked", current_time }),
  resolve: (feature_id, keep) => send({ kind: "resolve_asked", feature_id, keep }),
  resolveCuts: (resolution) => send({ kind: "tma_resolve", resolution }),
  select: (feature_id, current_time) => send({ kind: "tma_select", feature_id, current_time }),
  menu: (feature_id, current_time) => send({ kind: "tma_menu", feature_id, current_time }),
  cutOff: (error_cut_off) => send({ kind: "tma_cut_off", error_cut_off }),
  drawn: (plot_height, pane_widths) => send({ kind: "tma_plot_drawn", plot_height, pane_widths }),
});
export const receiveBearings = (h: BearingsHandlers, check: Check, refused: Refused) =>
  receiver(
    "bearings",
    {
      ready: () => h.ready(),
      tma_create: (m) => h.create(m.tma_request!),
      tma_guess: (m) => h.guess(m.tma_request!),
      tma_exclude: (m) => h.exclude(m.feature_id!, m.cut_ids!, m.excluded!),
      tma_split: (m) => h.split(m.feature_id!, m.current_time!),
      tma_time_asked: (m) => h.time(m.current_time!),
      resolve_asked: (m) => h.resolve(m.feature_id!, m.keep as "port" | "starboard" | "ambiguous"),
      tma_resolve: (m) => m.resolution && h.resolveCuts(m.resolution),
      tma_select: (m) => h.select(m.feature_id!, m.current_time!),
      tma_menu: (m) => h.menu(m.feature_id!, m.current_time!),
      tma_cut_off: (m) => h.cutOff(m.error_cut_off!),
      tma_plot_drawn: (m) => h.drawn(m.plot_height!, m.pane_widths ?? []),
      tma_panes: (m) => h.panes(m.panes_shown ?? []),
    },
    check,
    refused,
  );

// --- The map --------------------------------------------------------------------------------------

export interface MapHandlers {
  ready(): void;
  selected(featureIds: string[]): unknown;
  timeChanged(time: TimeState): unknown;
  viewportChanged(viewport: Viewport): unknown;
  showHidden(): unknown;
  /** Dragged or nudged on the map: changed so, as one step. */
  annotationMoved(id: string, annotation: AnnotationSpec): unknown;
  /** Double-clicked: its properties form (CAP-03). */
  annotationChosen(id: string): unknown;
  trackEdited(id: string, edit: TrackEdit): unknown;
  fixChosen(id: string, at: string): unknown;
  resolve(cut: string, keep: "port" | "starboard"): unknown;
  cutChosen(cut: string): unknown;
  annotationDrawn(annotation: AnnotationSpec): unknown;
  imageRendered(drawn: { image: RenderedImage } | { problem: string }): unknown;
  latestAsked(): unknown;
  tmaPreview(id: string, preview?: { type: "LineString"; coordinates: number[][] }): unknown;
  tmaGuessed(request?: TmaRequest): unknown;
}
export const receiveMap = (h: MapHandlers, check: Check, refused: Refused) =>
  receiver(
    "map",
    {
      ready: () => h.ready(),
      selection_changed: (m) => h.selected(m.selection!.feature_ids),
      time_changed: (m) => h.timeChanged(m.time!),
      viewport_changed: (m) => h.viewportChanged(m.viewport!),
      show_hidden: () => h.showHidden(),
      edit_annotation: (m) => (m.annotation ? h.annotationMoved(m.feature_id!, m.annotation) : h.annotationChosen(m.feature_id!)),
      edit_track: (m) => h.trackEdited(m.feature_id!, m.track_edit!),
      fix_chosen: (m) => h.fixChosen(m.feature_id!, m.fix_time!),
      resolve_asked: (m) => m.feature_id && m.keep && h.resolve(m.feature_id, m.keep as "port" | "starboard"),
      cut_chosen: (m) => h.cutChosen(m.feature_id!),
      annotation_drawn: (m) => h.annotationDrawn(m.annotation!),
      image_rendered: (m) => h.imageRendered(m.image ? { image: m.image } : { problem: m.message ?? "The map could not draw the image." }),
      latest_asked: () => h.latestAsked(),
      tma_preview: (m) => h.tmaPreview(m.feature_id!, m.preview ?? undefined),
      tma_guessed: (m) => h.tmaGuessed(m.tma_request ?? undefined),
    },
    check,
    refused,
  );

// --- The tool form, the annotation form and the results -------------------------------------------

export interface FormHandlers {
  ready(): void;
  cancel(): void;
  run(tool: string, parameters: ParameterValue[]): unknown;
}
export const receiveForm = (h: FormHandlers, check: Check, refused: Refused) =>
  receiver("form", { ready: () => h.ready(), cancel: () => h.cancel(), run_tool: (m) => h.run(m.tool_name!, m.parameters ?? []) }, check, refused);

export interface AnnotationHandlers {
  ready(): void;
  cancel(): void;
  /** Add an annotation, or change the one named. */
  save(annotation: AnnotationSpec, id?: string): unknown;
  remove(id: string): unknown;
}
export const receiveAnnotation = (h: AnnotationHandlers, check: Check, refused: Refused) =>
  receiver(
    "annotation",
    { ready: () => h.ready(), cancel: () => h.cancel(), save_annotation: (m) => h.save(m.annotation!, m.feature_id ?? undefined), delete_annotation: (m) => h.remove(m.feature_id!) },
    check,
    refused,
  );

export const receiveResults = (h: { ready(): void }, check: Check, refused: Refused) => receiver("results", { ready: () => h.ready() }, check, refused);
