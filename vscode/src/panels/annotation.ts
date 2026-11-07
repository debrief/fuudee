/**
 * The annotation form (CAP-03 to CAP-05): one panel beside the map, to add an
 * annotation or change the one chosen. Saving and deleting go through the
 * Python service as one recorded, undoable step each.
 */
import * as vscode from "vscode";
import type { AnnotationSpec, TimeRange } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import { receiveAnnotation } from "../../webview/dispatch.js";
import { WebviewHost } from "./webviewhost.js";

export interface AnnotationActions {
  /** Add the annotation, or change featureId to it. Returns a problem to show, if any. */
  save: (spec: AnnotationSpec, featureId?: string) => Promise<string | undefined>;
  /** Delete featureId. Returns a problem to show, if any. */
  remove: (featureId: string) => Promise<string | undefined>;
  /** The form closed: saved, or cancelled or closed without saving (a drawing it was naming is then let go). */
  closed?: (saved: boolean) => void;
}

interface Showing {
  spec?: AnnotationSpec;
  featureId?: string;
  timeRange?: TimeRange;
  currentTime?: string;
}

export class AnnotationPanel {
  private readonly host: WebviewHost<vscode.WebviewPanel>;
  private showing?: Showing;
  private saved = false;

  constructor(
    extension: vscode.Uri,
    private readonly actions: AnnotationActions,
    private readonly log: (line: string) => void,
  ) {
    this.host = new WebviewHost(extension, {
      bundle: "annotation",
      receive: (raw) => void this.receive(raw),
      disposed: () => this.actions.closed?.(this.saved),
    });
  }

  /** The annotation whose form is open (or "" while adding one), for tests and agents. */
  get open(): string | undefined {
    return this.host.target ? (this.showing?.featureId ?? "") : undefined;
  }

  /** Open the form: to change featureId, described by spec; or, without featureId, to add one (spec giving its start). */
  show(showing: Showing): void {
    this.showing = showing;
    const title = showing.featureId ? `Annotation: ${showing.spec?.name ?? ""}` : "Add annotation";
    let panel = this.host.target;
    if (!panel) {
      panel = this.host.open("debrief.annotation", title, vscode.ViewColumn.Beside);
      this.saved = false;
    } else {
      panel.reveal(undefined, false);
    }
    panel.title = title;
    this.send();
  }

  close(): void {
    this.host.target?.dispose();
  }

  private send(): void {
    if (!this.showing) return;
    const { spec, featureId, timeRange, currentTime } = this.showing;
    this.host.post({
      kind: "show_annotation_form",
      ...(spec && { annotation: spec }),
      ...(featureId && { feature_id: featureId }),
      ...(timeRange && { time_range: timeRange }),
      ...(currentTime && { current_time: currentTime }),
    });
  }

  /** The shared receiver (webview/dispatch.ts, PAR-13): each message checked, then handled here. */
  private readonly receive = receiveAnnotation(
    {
      ready: () => {
        this.host.readied();
        this.send();
      },
      cancel: () => this.close(),
      save: (annotation, id) => this.saveOrRemove(id, () => this.actions.save(annotation, id)),
      remove: (id) => this.saveOrRemove(id, () => this.actions.remove(id)),
    },
    checkMessage,
    // Never the message: it can quote what the analyst typed (NFR-14).
    (panel) => this.log(`webview_message_refused panel=${panel}`),
  );

  private async saveOrRemove(id: string | undefined, act: () => Promise<string | undefined>): Promise<void> {
    // The form may have been showing another annotation when the message was sent.
    if (id !== this.showing?.featureId) return;
    this.host.post({ kind: "form_busy", message: "Saving…" });
    const problem = await act();
    if (problem) this.host.post({ kind: "form_error", message: problem });
    else {
      this.saved = true;
      this.close();
    }
  }
}
