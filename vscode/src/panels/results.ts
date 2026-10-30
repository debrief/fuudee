/** Non-spatial results in a temporary panel (TL-13). */
import * as vscode from "vscode";
import type { ToolDeclaration, ToolResult } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import { receiveResults } from "../../webview/dispatch.js";
import { webviewHtml } from "./html.js";

export class ResultsPanel {
  private panel?: vscode.WebviewPanel;
  private ready = false;
  private pending?: { tool: ToolDeclaration; result: ToolResult };

  constructor(private readonly extension: vscode.Uri) {}

  show(tool: ToolDeclaration, result: ToolResult): void {
    const title = tool.title;
    this.pending = { tool, result };
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("debrief.results", `Results: ${title}`, vscode.ViewColumn.Beside, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extension, "dist", "webview")],
      });
      this.ready = false;
      this.panel.webview.html = webviewHtml(this.panel.webview, this.extension, "results", "Results");
      this.panel.onDidDispose(() => (this.panel = undefined));
      // The shared receiver (webview/dispatch.ts, PAR-13): a message Debrief's page never sends is ignored.
      const receive = receiveResults(
        {
          ready: () => {
            this.ready = true;
            this.send();
          },
        },
        checkMessage,
        () => undefined,
      );
      this.panel.webview.onDidReceiveMessage((raw) => void receive(raw));
    } else {
      this.panel.reveal(undefined, true);
    }
    this.panel.title = `Results: ${title}`;
    this.send();
  }

  private send(): void {
    if (!this.panel || !this.ready || !this.pending) return;
    void this.panel.webview.postMessage(
      checkMessage({
        kind: "show_results",
        tool: this.pending.tool,
        result_title: this.pending.tool.title,
        result: this.pending.result,
      }),
    );
  }
}
