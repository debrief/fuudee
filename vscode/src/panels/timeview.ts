/**
 * The time controller, a view at the top of the Debrief sidebar (CAP-28,
 * SUB-26). A webview, because its window is a band dragged on a strip and it plays;
 * the same component the playground shows (webview/timecontrol.ts). The
 * catalogues, outline, tools and history below it stay native views.
 *
 * It sets current time and the time window as shared state at once, so the
 * map follows a drag, and asks for the window to be saved in the plot when
 * the analyst lets go (windowSaved). It shows the window as saved too, so
 * it can say when a tool shows another.
 *
 * How context tracks are drawn (CAP-29) is chosen from the view's title menu
 * ("Context tracks: Visible", "Faint", "Hidden"), the plot's choice checked through
 * the context key debrief.contextTracks; the view's description says when the
 * analyst's setting draws faint as visible. That keeps the view short enough to
 * show whole at its first height.
 */
import * as vscode from "vscode";
import type { TimeRange } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import { receiveTime } from "../../webview/dispatch.js";
import type { Session } from "../session.js";
import { startup } from "../startup.js";
import { WebviewHost } from "./webviewhost.js";

export const TIME_VIEW = "debrief.time";
/** The context key holding the open plot's choice of context tracks; empty with no plot open. */
export const CONTEXT_TRACKS_KEY = "debrief.contextTracks";

export class TimeView implements vscode.WebviewViewProvider {
  private readonly host: WebviewHost<vscode.WebviewView>;

  constructor(
    extension: vscode.Uri,
    private readonly session: Session,
    private readonly windowSaved: (window: TimeRange) => void,
    private readonly log: (line: string) => void,
    /** Current time started or stopped playing: the Timeline follows it again when it starts. */
    private readonly playing: (playing: boolean) => void = () => undefined,
  ) {
    session.onPlot(() => this.showTime());
    session.onView(() => this.showTime());
    session.onState((change, origin) => {
      if (change.time && origin !== TIME_VIEW) this.showTime();
    });
    // The shared receiver (webview/dispatch.ts, PAR-13): each message checked, then handled here.
    const receive = receiveTime(
      {
        ready: () => {
          this.host.readied();
          this.showTime();
        },
        timeChanged: (time) => this.session.setTime(time, TIME_VIEW),
        windowChanged: (window) => this.windowSaved(window),
        playingChanged: (playing) => this.playing(playing),
      },
      checkMessage,
      (panel) => this.log(`webview_message_refused panel=${panel}`),
    );
    this.host = new WebviewHost(extension, { bundle: "time", marks: TIME_VIEW, receive: (raw) => void receive(raw) });
    this.showContext();
  }

  /** Whether the controller has loaded and shown the current plot's time, for tests and agents. */
  get showing(): boolean {
    return this.host.ready;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.host.resolve(view, "Time");
    this.showContext();
  }

  /** Current time, the window shown and as saved, and how context tracks are drawn. */
  private showTime(): void {
    this.showContext();
    if (!this.host.ready) return;
    const time = this.session.current ? this.session.time : undefined;
    const period = this.session.period();
    const saved = this.session.savedWindow;
    this.host.post({
      kind: "show_time",
      ...(time && { time }),
      ...(time && period && { time_range: period }),
      ...(time && saved && { saved_window: saved }),
      ...(time && { context_tracks: this.session.contextTracks(), minimum_context_contrast: this.session.minimumContextContrast }),
    });
    startup.shown(TIME_VIEW, !!time);
  }

  /** The plot's choice of context tracks, checked in the title menu; and the setting's effect, said beside the title. */
  private showContext(): void {
    const context = this.session.current ? this.session.contextTracks() : "";
    void vscode.commands.executeCommand("setContext", CONTEXT_TRACKS_KEY, context);
    const view = this.host.target;
    if (!view) return;
    const floor = context === "faint" && this.session.minimumContextContrast;
    view.description = floor ? "context tracks: faint shown as visible by your setting" : undefined;
  }
}
