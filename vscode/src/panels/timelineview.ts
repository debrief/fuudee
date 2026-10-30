/**
 * The Timeline, a view in the Debrief sidebar (CAP-05, CAP-19, CAP-20): narrative
 * entries, time-only annotations and fix comments in one list on one Zulu time axis.
 * A webview, the same component as the playground's Timeline panel
 * (webview/timelinecontrol.ts), replacing the native tree it was: a native tree cannot
 * search, filter, follow current time without taking the keyboard, or hold sixty
 * thousand entries (NFR-06). The product owner decided on 15 Oct 2026 that the
 * narrative is read here rather than in a view of its own.
 *
 * The entries go to the page once a plot opens or changes; current time follows as it
 * moves. Choosing an entry moves current time to it (debrief.goToTime); adding,
 * changing and deleting a narrative entry are steps in the plot's history, made by the
 * extension through the tool service (save, remove).
 */
import * as vscode from "vscode";
import type { NarrativeSpec, TimelineEntry } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import { receiveTimeline } from "../../webview/dispatch.js";
import type { Session } from "../session.js";
import { currentEntry, narrativeOnMapOf, timelineEntries, timelineTracks } from "../timeline.js";
import { startup } from "../startup.js";
import { webviewHtml } from "./html.js";

export const TIMELINE_VIEW = "debrief.timeline";

export class TimelineView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private ready = false;
  /** The open plot's entries, in the Timeline's order, for commands, tests and agents. */
  entries: TimelineEntry[] = [];
  private starts: number[] = [];
  /** Whether the narrative box on the map was on in what the page was last shown. */
  private onMapShown?: boolean;
  /** Whether current time is playing, as the time controller last said. */
  private playingNow = false;
  /** A form asked for before the page was ready: opened when it is. */
  private formWanted?: { feature?: string };

  constructor(
    private readonly extension: vscode.Uri,
    private readonly session: Session,
    private readonly goTo: (id: string) => void,
    private readonly save: (spec: NarrativeSpec, id?: string) => Promise<{ problem?: string; feature?: string }>,
    private readonly remove: (id: string) => Promise<string | undefined>,
    private readonly log: (line: string) => void,
    /** The analyst turned the narrative box on the map off or on: save it in the plot's island. */
    private readonly saveOnMap: (on: boolean) => Promise<string | undefined> = async () => undefined,
    /** Undo or redo pressed in the Timeline outside a text box: as Ctrl+Z on the map. */
    private readonly historyMove: (move: "undo" | "redo") => void = () => undefined,
  ) {
    session.onPlot((opened) => {
      this.entries = opened ? timelineEntries(opened.plot) : [];
      this.starts = this.entries.map((e) => Date.parse(e.start));
      this.showAll();
    });
    // The island changed: say so only if the narrative box on the map was turned off or on.
    session.onView(() => {
      if (this.session.current && narrativeOnMapOf(this.session.current.plot) !== this.onMapShown) this.showAll();
    });
    session.onState((change) => {
      if (change.time && this.session.time) this.post({ kind: "set_time", time: this.session.time });
    });
  }

  /** Whether the page has loaded, for tests and agents. */
  get showing(): boolean {
    return this.ready && !!this.view;
  }

  /** The entry current time is at (the last at or before it), for tests and agents. */
  get currentId(): string | undefined {
    const time = this.session.time;
    if (!time) return undefined;
    return this.entries[currentEntry(this.starts, Date.parse(time.current))]?.id;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    startup.mark(TIMELINE_VIEW, "resolve");
    this.view = view;
    this.ready = false;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extension, "dist", "webview")],
    };
    view.webview.html = webviewHtml(view.webview, this.extension, "timeline", "Timeline");
    startup.mark(TIMELINE_VIEW, "html");
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
    view.webview.onDidReceiveMessage((raw) => this.receive(raw));
  }

  /** A message from the page. Tests send one as the page would: they cannot press a key in it. The shared receiver (webview/dispatch.ts, PAR-13). */
  receive(raw: unknown): void {
    if (startup.fromPage(TIMELINE_VIEW, raw)) return;
    void this.receiver(raw);
  }
  private readonly receiver = receiveTimeline(
    {
      ready: () => {
        startup.mark(TIMELINE_VIEW, "ready");
        this.ready = true;
        this.showAll();
        if (this.playingNow) this.post({ kind: "playing_changed", playing: true });
        if (this.formWanted) this.openForm(this.formWanted.feature);
      },
      chosen: (id) => this.goTo(id),
      save: (narrative, id) =>
        void this.save(narrative, id).then(({ problem, feature }) => this.post({ kind: "narrative_saved", ...(problem ? { message: problem } : feature && { feature_id: feature }) })),
      narrativeOnMap: (on) =>
        void this.saveOnMap(on).then((problem) => {
          if (!problem) return;
          void vscode.window.showWarningMessage(problem);
          this.showAll(); // what is saved, again
        }),
      history: (move) => this.historyMove(move),
      remove: (id) => void this.remove(id).then((problem) => problem && void vscode.window.showWarningMessage(problem)),
    },
    checkMessage,
    (panel) => this.log(`webview_message_refused panel=${panel}`),
  );

  /** Open the page's form: to add an entry, or change one. Shows the view first. */
  openForm(feature?: string): void {
    this.formWanted = { feature };
    if (!this.view || !this.ready) {
      void vscode.commands.executeCommand(`${TIMELINE_VIEW}.focus`);
      return;
    }
    this.view.show?.(true);
    this.formWanted = undefined;
    this.post({ kind: "open_narrative_form", ...(feature && { feature_id: feature }) });
  }

  /** Current time started or stopped playing: the page follows it again when it starts. */
  setPlaying(playing: boolean): void {
    if (playing === this.playingNow) return;
    this.playingNow = playing;
    this.post({ kind: "playing_changed", playing });
  }

  /** Whether the page follows current time, the narrative box on the map's state and the like, for tests and agents. */
  get playing(): boolean {
    return this.playingNow;
  }

  private showAll(): void {
    const opened = this.session.current;
    this.onMapShown = opened ? narrativeOnMapOf(opened.plot) : undefined;
    if (!opened) return this.post({ kind: "show_timeline" });
    const time = this.session.time;
    this.post({
      kind: "show_timeline",
      timeline_entries: this.entries,
      timeline_tracks: timelineTracks(opened.plot),
      ...(time && { time }),
      // Which plot: the same one shown again keeps the reader's place; another is read from current time.
      plot_id: `${opened.store.id}/${opened.item.id}`,
      ...(this.onMapShown === false && { narrative_on_map: false }),
    });
  }

  private post(message: Record<string, unknown>): void {
    if (!this.view || !this.ready) return;
    void this.view.webview.postMessage(checkMessage(message));
    if (message.kind === "show_timeline") startup.shown(TIMELINE_VIEW, !!message.timeline_entries);
  }
}
