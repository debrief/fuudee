/** Non-spatial results in a temporary panel (TL-13), kept while its tab is hidden (webviewhost.ts). */
import * as vscode from "vscode";
import type { ToolDeclaration, ToolResult } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import { receiveResults } from "../../webview/dispatch.js";
import { WebviewHost } from "./webviewhost.js";

export class ResultsPanel {
  private readonly host: WebviewHost<vscode.WebviewPanel>;
  private pending?: { tool: ToolDeclaration; result: ToolResult };

  constructor(extension: vscode.Uri) {
    // The shared receiver (webview/dispatch.ts, PAR-13): a message Debrief's page never sends is ignored.
    const receive = receiveResults(
      {
        ready: () => {
          this.host.readied();
          this.send();
        },
      },
      checkMessage,
      () => undefined,
    );
    this.host = new WebviewHost(extension, { bundle: "results", receive: (raw) => void receive(raw) });
  }

  show(tool: ToolDeclaration, result: ToolResult): void {
    const title = `Results: ${tool.title}`;
    this.pending = { tool, result };
    const open = this.host.target;
    // The page's own title is "Results"; the tab's names the tool.
    const panel = open ?? this.host.open("debrief.results", "Results", vscode.ViewColumn.Beside);
    if (open) open.reveal(undefined, true);
    panel.title = title;
    this.send();
  }

  private send(): void {
    if (!this.pending) return;
    this.host.post({
      kind: "show_results",
      tool: this.pending.tool,
      result_title: this.pending.tool.title,
      result: this.pending.result,
    });
  }
}
