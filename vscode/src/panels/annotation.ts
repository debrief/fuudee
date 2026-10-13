/**
 * The annotation form (CAP-03 to CAP-05): one panel beside the map, to add an
 * annotation or change the one chosen. Saving and deleting go through the
 * Python service as one recorded, undoable step each.
 */
import * as vscode from "vscode";
import type { AnnotationSpec, TimeRange } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import { webviewHtml } from "./html.js";

export interface AnnotationActions {
  /** Add the annotation, or change featureId to it. Returns a problem to show, if any. */
  save: (spec: AnnotationSpec, featureId?: string) => Promise<string | undefined>;
  /** Delete featureId. Returns a problem to show, if any. */
  remove: (featureId: string) => Promise<string | undefined>;
}

interface Showing {
  spec?: AnnotationSpec;
  featureId?: string;
  timeRange?: TimeRange;
  currentTime?: string;
}

export class AnnotationPanel {
  private panel?: vscode.WebviewPanel;
  private ready = false;
  private showing?: Showing;

  constructor(
    private readonly extension: vscode.Uri,
    private readonly actions: AnnotationActions,
    private readonly log: (line: string) => void,
  ) {}

  /** The annotation whose form is open (or "" while adding one), for tests and agents. */
  get open(): string | undefined {
    return this.panel ? (this.showing?.featureId ?? "") : undefined;
  }

  /** Open the form: to change featureId, described by spec; or, without featureId, to add one (spec giving its start). */
  show(showing: Showing): void {
    this.showing = showing;
    const title = showing.featureId ? `Annotation: ${showing.spec?.name ?? ""}` : "Add annotation";
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("debrief.annotation", title, vscode.ViewColumn.Beside, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extension, "dist", "webview")],
      });
      this.ready = false;
      this.panel.webview.html = webviewHtml(this.panel.webview, this.extension, "annotation", title);
      this.panel.onDidDispose(() => (this.panel = undefined));
      this.panel.webview.onDidReceiveMessage((raw) => void this.receive(raw));
    } else {
      this.panel.reveal(undefined, false);
    }
    this.panel.title = title;
    this.send();
  }

  close(): void {
    this.panel?.dispose();
  }

  private send(): void {
    if (!this.panel || !this.ready || !this.showing) return;
    const { spec, featureId, timeRange, currentTime } = this.showing;
    void this.panel.webview.postMessage(
      checkMessage({
        kind: "show_annotation_form",
        ...(spec && { annotation: spec }),
        ...(featureId && { feature_id: featureId }),
        ...(timeRange && { time_range: timeRange }),
        ...(currentTime && { current_time: currentTime }),
      }),
    );
  }

  private async receive(raw: unknown): Promise<void> {
    let message;
    try {
      message = checkMessage(raw);
    } catch {
      // Not the message: it can quote what the analyst typed (NFR-14).
      this.log("webview_message_refused panel=annotation");
      return;
    }
    if (message.kind === "ready") {
      this.ready = true;
      this.send();
    } else if (message.kind === "cancel") {
      this.close();
    } else if (message.kind === "save_annotation" || message.kind === "delete_annotation") {
      // The form may have been showing another annotation when the message was sent.
      if ((message.feature_id ?? undefined) !== this.showing?.featureId) return;
      void this.panel?.webview.postMessage(checkMessage({ kind: "form_busy", message: "Saving…" }));
      const problem =
        message.kind === "save_annotation"
          ? await this.actions.save(message.annotation!, message.feature_id ?? undefined)
          : await this.actions.remove(message.feature_id!);
      if (problem) void this.panel?.webview.postMessage(checkMessage({ kind: "form_error", message: problem }));
      else this.close();
    }
  }
}
