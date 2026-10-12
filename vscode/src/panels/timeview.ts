/**
 * The time controller, a view at the top of the Debrief sidebar (CAP-28,
 * SUB-26). A webview, because its window slider has two handles and it plays;
 * the same component the playground shows (webview/timecontrol.ts). The
 * catalogues, outline, tools and history below it stay native views.
 *
 * It sets current time and the time window as shared state at once, so the
 * map follows a drag, and asks for the window to be saved in the plot when
 * the analyst lets go (windowSaved).
 */
import * as vscode from "vscode";
import type { TimeRange } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import type { Session } from "../session.js";
import { webviewHtml } from "./html.js";

export const TIME_VIEW = "debrief.time";

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
    session.onState((change, origin) => {
      if (change.time && origin !== TIME_VIEW) this.showTime();
    });
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
  }

  private showTime(): void {
    if (!this.view || !this.ready) return;
    const time = this.session.current ? this.session.time : undefined;
    const period = this.session.period();
    void this.view.webview.postMessage(
      checkMessage({ kind: "show_time", ...(time && { time }), ...(time && period && { time_range: period }) }),
    );
  }
}
