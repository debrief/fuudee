/**
 * Coverage, a view in the Debrief sidebar below Catalogues (CAP-08 to CAP-12): the same
 * component as the playground's (webview/coveragecontrol.ts). Collation is done in the
 * catalogue browser (CAP-08): the Catalogues tree lists each item's tracks and the
 * periods each has data for, marks new data and products that may need review; this view
 * shows the open plot's platforms with every source of data for each, so the analyst
 * chooses which item supplies each period with coverage visible (CAP-09).
 *
 * The extension asks the tool service for the coverage (debrief/coverage) whenever the
 * plot or the catalogues change, and passes each choice back to it: choosing a source,
 * linking a platform and taking new data are steps in the plot's history; setting new
 * data aside and clearing a review flag are view state in its island.
 */
import * as vscode from "vscode";
import type { CoverageReport, ItemRevision, SourceTrackRef, TimeRange } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import type { Session } from "../session.js";
import { startup } from "../startup.js";
import { webviewHtml } from "./html.js";

export const COVERAGE_VIEW = "debrief.coverage";

/** What the analyst asked of the view: each made by the extension through the tool service. */
export type CoverageAsk =
  | { kind: "prefer"; feature: string; period: TimeRange; source: SourceTrackRef }
  | { kind: "link"; feature: string; source: SourceTrackRef; linked: boolean }
  | { kind: "take"; source: { catalogue: string; item: string; revision?: string } }
  | { kind: "dismiss"; source: ItemRevision }
  | { kind: "reviewed" };

export class CoverageView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private ready = false;
  /** The coverage last shown, for tests and agents. */
  report?: CoverageReport;

  constructor(
    private readonly extension: vscode.Uri,
    private readonly session: Session,
    /** Make what the analyst asked: a problem to say if it was not done. */
    private readonly act: (ask: CoverageAsk) => Promise<string | undefined>,
    private readonly log: (line: string) => void,
  ) {
    session.onState((change) => {
      if (change.time && this.session.time) this.post({ kind: "set_time", time: this.session.time });
    });
  }

  /** Whether the page has loaded, for tests and agents. */
  get showing(): boolean {
    return this.ready && !!this.view;
  }

  /** Whether the view is on screen: coverage is asked for only then. */
  get visible(): boolean {
    return !!this.view?.visible;
  }

  /** The open plot's coverage, or none. */
  show(report: CoverageReport | undefined): void {
    this.report = report;
    this.post({ kind: "show_coverage", ...(report && { coverage: report }), ...(this.session.time && report && { time: this.session.time }) });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    startup.mark(COVERAGE_VIEW, "resolve");
    this.view = view;
    this.ready = false;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extension, "dist", "webview")],
    };
    view.webview.html = webviewHtml(view.webview, this.extension, "coverage", "Coverage");
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
    view.onDidChangeVisibility(() => view.visible && this.show(this.report));
    view.webview.onDidReceiveMessage((raw) => this.receive(raw));
  }

  /** A message from the page; tests send one as the page would. */
  receive(raw: unknown): void {
    if (startup.fromPage(COVERAGE_VIEW, raw)) return;
    let message;
    try {
      message = checkMessage(raw);
    } catch {
      this.log("webview_message_refused panel=coverage");
      return;
    }
    let ask: CoverageAsk | undefined;
    if (message.kind === "ready") {
      startup.mark(COVERAGE_VIEW, "ready");
      this.ready = true;
      this.show(this.report);
      return;
    } else if (message.kind === "source_chosen") {
      ask = { kind: "prefer", feature: message.feature_id!, period: message.time_range!, source: message.source! };
    } else if (message.kind === "link_changed") {
      ask = { kind: "link", feature: message.feature_id!, source: message.source!, linked: message.linked === true };
    } else if (message.kind === "take_asked") {
      ask = { kind: "take", source: message.item_revision! };
    } else if (message.kind === "dismiss_asked") {
      ask = { kind: "dismiss", source: message.item_revision! };
    } else if (message.kind === "review_cleared") {
      ask = { kind: "reviewed" };
    }
    if (!ask) return;
    void this.act(ask).then((problem) => {
      // Done: the plot or its island changed, and the view is shown again with the latest.
      if (problem) this.post({ kind: "show_coverage", message: problem });
    });
  }

  private post(message: Record<string, unknown>): void {
    if (!this.view || !this.ready) return;
    void this.view.webview.postMessage(checkMessage(message));
    if (message.kind === "show_coverage" && !("message" in message)) startup.shown(COVERAGE_VIEW, !!message.coverage);
  }
}
