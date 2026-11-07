/**
 * A tool's form, generated from its declaration (TL-07, CAP-24): one panel,
 * reused for whichever tool the analyst opens. Its page is kept while its tab is
 * hidden (webviewhost.ts), so what the analyst typed is still there when it is shown.
 */
import * as vscode from "vscode";
import type { ParameterValue, TimeRange, ToolDeclaration } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import { receiveForm } from "../../webview/dispatch.js";
import { WebviewHost } from "./webviewhost.js";

export type RunRequest = (tool: ToolDeclaration, parameters: ParameterValue[]) => Promise<string | undefined>;

export class FormPanel {
  private readonly host: WebviewHost<vscode.WebviewPanel>;
  private pending?: { tool: ToolDeclaration; names: string[]; timeRange?: TimeRange; currentTime?: string };

  constructor(
    extension: vscode.Uri,
    private readonly run: RunRequest,
    private readonly log: (line: string) => void,
  ) {
    this.host = new WebviewHost(extension, { bundle: "form", receive: (raw) => void this.receive(raw) });
  }

  /** The tool whose form is open, if any. */
  get showing(): string | undefined {
    return this.host.target ? this.pending?.tool.name : undefined;
  }

  /** Open the form; its time fields start at currentTime, when there is one. */
  show(tool: ToolDeclaration, selectedNames: string[], timeRange?: TimeRange, currentTime?: string): void {
    this.pending = { tool, names: selectedNames, timeRange, currentTime };
    const open = this.host.target;
    const panel = open ?? this.host.open("debrief.form", tool.title, vscode.ViewColumn.Beside);
    if (open) open.reveal(undefined, false);
    panel.title = tool.title;
    this.send();
  }

  close(): void {
    this.host.target?.dispose();
  }

  /** The selection changed while the form is open: say what the tool will now act on. */
  updateSelection(names: string[]): void {
    if (!this.pending || !this.host.target) return;
    this.pending = { ...this.pending, names };
    this.send();
  }

  private send(): void {
    if (!this.pending) return;
    const { tool, names, timeRange, currentTime } = this.pending;
    this.host.post({
      kind: "show_form",
      tool,
      selected_names: names,
      ...(timeRange && { time_range: timeRange }),
      ...(currentTime && { current_time: currentTime }),
    });
  }

  /** The shared receiver (webview/dispatch.ts, PAR-13): each message checked, then handled here. */
  private readonly receive = receiveForm(
    {
      ready: () => {
        this.host.readied();
        this.send();
      },
      cancel: () => this.close(),
      run: async (toolName, parameters) => {
        // The form may have been showing another tool when the message was sent.
        if (!this.pending || toolName !== this.pending.tool.name) return;
        this.host.post({ kind: "form_busy", message: "Running…" });
        const problem = await this.run(this.pending.tool, parameters);
        if (problem) this.host.post({ kind: "form_error", message: problem });
        else this.close();
      },
    },
    checkMessage,
    // Never the message: it can quote what the analyst typed (NFR-14).
    (panel) => this.log(`webview_message_refused panel=${panel}`),
  );
}
