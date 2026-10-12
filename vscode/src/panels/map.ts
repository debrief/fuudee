/**
 * The plot's map, in a webview beside the editor (SUB-30, SUB-03). It shows all
 * three pieces of shared state and sets selection and viewport (SUB-26,
 * SUB-27). Current time and the time window are set in the time controller,
 * at the top of the sidebar (panels/timeview.ts); the map draws the window.
 */
import * as vscode from "vscode";
import type { Session } from "../session.js";
import { checkMessage } from "../messages.js";
import { webviewHtml } from "./html.js";
import { displayed, hiddenIds } from "../hidden.js";

export class MapPanel {
  private panel?: vscode.WebviewPanel;
  private ready = false;
  /** The plot the map last drew, once it is ready. */
  showing?: string;
  /** How many hidden features the map last said there were. */
  hiddenCount?: number;

  constructor(
    private readonly extension: vscode.Uri,
    private readonly session: Session,
    private readonly log: (line: string) => void,
  ) {
    session.onPlot(() => this.showPlot());
    session.onSelection((ids, origin) => {
      if (origin !== "map") this.post({ kind: "set_selection", selection: this.selectionMessage(ids) });
    });
    session.onState((change, origin) => {
      if (origin === "map" || origin === "plot") return; // the map set it, or show_plot carries it
      if (change.time) this.post({ kind: "set_time", time: change.time });
      if (change.viewport) this.post({ kind: "set_viewport", viewport: change.viewport });
    });
  }

  private selectionMessage(ids: string[]) {
    return { plot: this.session.current?.item.id ?? "", feature_ids: ids };
  }

  reveal(): void {
    const opened = this.session.current;
    if (!opened) return;
    const title = opened.item.properties.title ?? opened.item.id;
    if (this.panel) {
      this.panel.title = title;
      this.panel.reveal(undefined, true);
      return;
    }
    this.panel = vscode.window.createWebviewPanel("debrief.map", title, vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extension, "dist", "webview")],
    });
    this.ready = false;
    this.panel.webview.html = webviewHtml(this.panel.webview, this.extension, "map", title);
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.showing = undefined;
    });
    this.panel.webview.onDidReceiveMessage((raw) => {
      let message;
      try {
        message = checkMessage(raw);
      } catch (error) {
        // Not the message: it can quote plot content (NFR-14).
        this.log("webview_message_refused panel=map");
        return;
      }
      if (message.kind === "ready") {
        this.ready = true;
        this.showPlot();
      } else if (message.kind === "selection_changed") {
        this.session.select(message.selection!.feature_ids, "map");
      } else if (message.kind === "time_changed") {
        this.session.setTime(message.time!, "map");
      } else if (message.kind === "viewport_changed") {
        this.session.setViewport(message.viewport!, "map");
      } else if (message.kind === "show_hidden") {
        void vscode.commands.executeCommand("debrief.showAllHidden");
      }
    });
  }

  private showPlot(): void {
    const opened = this.session.current;
    if (!opened || !this.panel) return;
    this.panel.title = opened.item.properties.title ?? opened.item.id;
    // Hiding is shared, so the map says how many are hidden, with a way to show them (SUB-22).
    const hidden = hiddenIds(opened.plot).length;
    this.post({
      kind: "show_plot",
      plot: displayed(opened.plot), // hidden features left out (SUB-22)
      plot_title: this.panel.title,
      selection: this.selectionMessage(this.session.selection),
      hidden_count: hidden,
      ...(this.session.time && { time: this.session.time }),
    });
    if (this.ready) {
      this.showing = opened.item.id;
      this.hiddenCount = hidden;
    }
  }

  private post(message: unknown): void {
    if (this.panel && this.ready) void this.panel.webview.postMessage(checkMessage(message));
  }
}
