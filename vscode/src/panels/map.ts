/** The plot's map, in a webview beside the editor (SUB-30, SUB-03). */
import * as vscode from "vscode";
import type { Session } from "../session.js";
import { checkMessage } from "../messages.js";
import { webviewHtml } from "./html.js";

export class MapPanel {
  private panel?: vscode.WebviewPanel;
  private ready = false;

  constructor(
    private readonly extension: vscode.Uri,
    private readonly session: Session,
    private readonly log: (line: string) => void,
  ) {
    session.onPlot(() => this.showPlot());
    session.onSelection((ids, origin) => {
      if (origin !== "map") this.post({ kind: "set_selection", selection: this.selectionMessage(ids) });
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
    this.panel.onDidDispose(() => (this.panel = undefined));
    this.panel.webview.onDidReceiveMessage((raw) => {
      let message;
      try {
        message = checkMessage(raw);
      } catch (error) {
        this.log(`Map sent a message Debrief did not accept: ${(error as Error).message}`);
        return;
      }
      if (message.kind === "ready") {
        this.ready = true;
        this.showPlot();
      } else if (message.kind === "selection_changed") {
        this.session.select(message.selection!.feature_ids, "map");
      }
    });
  }

  private showPlot(): void {
    const opened = this.session.current;
    if (!opened || !this.panel) return;
    this.panel.title = opened.item.properties.title ?? opened.item.id;
    this.post({
      kind: "show_plot",
      plot: opened.plot,
      plot_title: this.panel.title,
      selection: this.selectionMessage(this.session.selection),
    });
  }

  private post(message: unknown): void {
    if (this.panel && this.ready) void this.panel.webview.postMessage(checkMessage(message));
  }
}
