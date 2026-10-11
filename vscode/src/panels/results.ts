/** Non-spatial results in a temporary panel (TL-13). */
import * as vscode from "vscode";
import type { ToolResult } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import { webviewHtml } from "./html.js";

export class ResultsPanel {
  private panel?: vscode.WebviewPanel;
  private ready = false;
  private pending?: { title: string; result: ToolResult };

  constructor(private readonly extension: vscode.Uri) {}

  show(title: string, result: ToolResult): void {
    this.pending = { title, result };
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("debrief.results", `Results: ${title}`, vscode.ViewColumn.Beside, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extension, "dist", "webview")],
      });
      this.ready = false;
      this.panel.webview.html = webviewHtml(this.panel.webview, this.extension, "results", "Results");
      this.panel.onDidDispose(() => (this.panel = undefined));
      this.panel.webview.onDidReceiveMessage((raw) => {
        if (checkMessage(raw).kind === "ready") {
          this.ready = true;
          this.send();
        }
      });
    } else {
      this.panel.reveal(undefined, true);
    }
    this.panel.title = `Results: ${title}`;
    this.send();
  }

  private send(): void {
    if (!this.panel || !this.ready || !this.pending) return;
    void this.panel.webview.postMessage(
      checkMessage({ kind: "show_results", result_title: this.pending.title, result: this.pending.result }),
    );
  }
}
