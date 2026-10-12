/**
 * A tool's form, generated from its declaration (TL-07, CAP-24): one panel,
 * reused for whichever tool the analyst opens.
 */
import * as vscode from "vscode";
import type { ParameterValue, TimeRange, ToolDeclaration } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import { webviewHtml } from "./html.js";

export type RunRequest = (tool: ToolDeclaration, parameters: ParameterValue[]) => Promise<string | undefined>;

export class FormPanel {
  private panel?: vscode.WebviewPanel;
  private ready = false;
  private pending?: { tool: ToolDeclaration; names: string[]; timeRange?: TimeRange; currentTime?: string };

  constructor(
    private readonly extension: vscode.Uri,
    private readonly run: RunRequest,
    private readonly log: (line: string) => void,
  ) {}

  /** The tool whose form is open, if any. */
  get showing(): string | undefined {
    return this.panel ? this.pending?.tool.name : undefined;
  }

  /** Open the form; its time fields start at currentTime, when there is one. */
  show(tool: ToolDeclaration, selectedNames: string[], timeRange?: TimeRange, currentTime?: string): void {
    this.pending = { tool, names: selectedNames, timeRange, currentTime };
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("debrief.form", tool.title, vscode.ViewColumn.Beside, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extension, "dist", "webview")],
      });
      this.ready = false;
      this.panel.webview.html = webviewHtml(this.panel.webview, this.extension, "form", tool.title);
      this.panel.onDidDispose(() => (this.panel = undefined));
      this.panel.webview.onDidReceiveMessage((raw) => void this.receive(raw));
    } else {
      this.panel.reveal(undefined, false);
    }
    this.panel.title = tool.title;
    this.send();
  }

  close(): void {
    this.panel?.dispose();
  }

  /** The selection changed while the form is open: say what the tool will now act on. */
  updateSelection(names: string[]): void {
    if (!this.pending || !this.panel) return;
    this.pending = { ...this.pending, names };
    this.send();
  }

  private send(): void {
    if (!this.panel || !this.ready || !this.pending) return;
    const { tool, names, timeRange, currentTime } = this.pending;
    void this.panel.webview.postMessage(
      checkMessage({
        kind: "show_form",
        tool,
        selected_names: names,
        ...(timeRange && { time_range: timeRange }),
        ...(currentTime && { current_time: currentTime }),
      }),
    );
  }

  private async receive(raw: unknown): Promise<void> {
    let message;
    try {
      message = checkMessage(raw);
    } catch (error) {
      // Not the message: it can quote what the analyst typed (NFR-14).
      this.log("webview_message_refused panel=form");
      return;
    }
    if (message.kind === "ready") {
      this.ready = true;
      this.send();
    } else if (message.kind === "cancel") {
      this.close();
    } else if (message.kind === "run_tool" && this.pending) {
      // The form may have been showing another tool when the message was sent.
      if (message.tool_name !== this.pending.tool.name) return;
      void this.panel?.webview.postMessage(checkMessage({ kind: "form_busy", message: "Running…" }));
      const problem = await this.run(this.pending.tool, message.parameters ?? []);
      if (problem) void this.panel?.webview.postMessage(checkMessage({ kind: "form_error", message: problem }));
      else this.close();
    }
  }
}
