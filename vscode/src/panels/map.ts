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
  /** How the map was last told to draw tracks outside the window, for tests and agents. */
  context?: string;

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
    // How tracks outside the window are drawn: the plot's choice, the analyst's setting applied (CAP-29).
    session.onView(() => {
      if (!this.session.current || !this.panel || !this.ready) return;
      this.context = this.session.contextShown();
      this.post({ kind: "set_context", context_tracks: this.context });
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
    this.panel.webview.onDidReceiveMessage((raw) => void this.receive(raw));
  }

  /** A message from the map webview; tests may pass one as if the map had sent it. Resolves once it is acted on. */
  async receive(raw: unknown): Promise<void> {
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
    } else if (message.kind === "edit_annotation" && message.annotation) {
      // Dragged or nudged on the map: changed so, as one step. Refused, the map shows it as it is.
      const done = await vscode.commands.executeCommand<{ problem?: string } | undefined>("debrief.editAnnotation", message.feature_id, message.annotation);
      if (done?.problem) this.refresh();
    } else if (message.kind === "edit_annotation") {
      // Double-clicked on the map: its properties form (CAP-03).
      void vscode.commands.executeCommand("debrief.editAnnotation", message.feature_id);
    } else if (message.kind === "edit_track") {
      // A track's move or rotate handle let go of, or nudged: changed so, as one step. Refused, the map shows it as it is.
      const done = await vscode.commands.executeCommand<{ problem?: string } | undefined>("debrief.editTrack", message.feature_id, message.track_edit);
      if (done?.problem) this.refresh();
    } else if (message.kind === "annotation_drawn") {
      // Drawn on the map: the form, to name it and add it as one step.
      await vscode.commands.executeCommand("debrief.addDrawnAnnotation", message.annotation);
    }
  }

  /** Draw the plot again as it is: after a change on the map was refused, or a drawing's form closed unsaved. */
  refresh(): void {
    if (this.ready) this.showPlot();
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
      context_tracks: this.session.contextShown(),
      ...(this.session.time && { time: this.session.time }),
    });
    if (this.ready) {
      this.showing = opened.item.id;
      this.hiddenCount = hidden;
      this.context = this.session.contextShown();
    }
  }

  private post(message: unknown): void {
    if (this.panel && this.ready) void this.panel.webview.postMessage(checkMessage(message));
  }
}
