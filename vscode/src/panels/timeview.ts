/**
 * The time controller, a view at the top of the Debrief sidebar (CAP-28,
 * SUB-26). A webview, because its window slider has two handles and it plays;
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
import type { Session } from "../session.js";
import { webviewHtml } from "./html.js";

export const TIME_VIEW = "debrief.time";
/** The context key holding the open plot's choice of context tracks; empty with no plot open. */
export const CONTEXT_TRACKS_KEY = "debrief.contextTracks";

export class TimeView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private ready = false;

  constructor(
    private readonly extension: vscode.Uri,
    private readonly session: Session,
    private readonly windowSaved: (window: TimeRange) => void,
    private readonly log: (line: string) => void,
  ) {
    session.onPlot(() => this.showTime());
    session.onView(() => this.showTime());
    session.onState((change, origin) => {
      if (change.time && origin !== TIME_VIEW) this.showTime();
    });
    this.showContext();
  }

  /** Whether the controller has loaded and shown the current plot's time, for tests and agents. */
  get showing(): boolean {
    return this.ready && !!this.view;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.ready = false;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extension, "dist", "webview")],
    };
    view.webview.html = webviewHtml(view.webview, this.extension, "time", "Time");
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
    view.webview.onDidReceiveMessage((raw) => {
      let message;
      try {
        message = checkMessage(raw);
      } catch {
        this.log("webview_message_refused panel=time");
        return;
      }
      if (message.kind === "ready") {
        this.ready = true;
        this.showTime();
      } else if (message.kind === "time_changed") {
        this.session.setTime(message.time!, TIME_VIEW);
      } else if (message.kind === "window_changed") {
        this.windowSaved(message.time_range!);
      }
    });
    this.showContext();
  }

  /** Current time, the window shown and as saved, and how context tracks are drawn. */
  private showTime(): void {
    this.showContext();
    if (!this.view || !this.ready) return;
    const time = this.session.current ? this.session.time : undefined;
    const period = this.session.period();
    const saved = this.session.savedWindow;
    void this.view.webview.postMessage(
      checkMessage({
        kind: "show_time",
        ...(time && { time }),
        ...(time && period && { time_range: period }),
        ...(time && saved && { saved_window: saved }),
        ...(time && { context_tracks: this.session.contextTracks(), minimum_context_contrast: this.session.minimumContextContrast }),
      }),
    );
  }

  /** The plot's choice of context tracks, checked in the title menu; and the setting's effect, said beside the title. */
  private showContext(): void {
    const context = this.session.current ? this.session.contextTracks() : "";
    void vscode.commands.executeCommand("setContext", CONTEXT_TRACKS_KEY, context);
    if (!this.view) return;
    const floor = context === "faint" && this.session.minimumContextContrast;
    this.view.description = floor ? "context tracks: faint shown as visible by your setting" : undefined;
  }
}
