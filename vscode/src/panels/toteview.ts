/**
 * The Tote, a view in the Debrief sidebar below the Time view (CAP-06, CAP-07).
 * A webview, the same component the playground shows (webview/totecontrol.ts).
 *
 * The values come from the tool service, one request per change of current time
 * (debrief/tote; decision 11 Oct, docs/spikes/tote-latency.md): one at a time,
 * and when it returns, one more for the latest time if current time moved
 * meanwhile, so playing never queues requests and the table is never more than
 * one round trip behind (NFR-04).
 *
 * Which tracks the Tote compares is view state in the plot's island, like the time
 * window (decision, 14 Oct 2026): every choice is saved there at once (saveTote),
 * never a step in the history, and a colleague's choice made meanwhile is shown,
 * never overwritten (SUB-28). Only while the view is showing is anything asked for.
 */
import * as vscode from "vscode";
import type { MessageOf, ToteResult, ToteView as ToteChoice } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import { receiveTote } from "../../webview/dispatch.js";
import type { Session } from "../session.js";
import { latencySummary, sameTote, toteOf, ToteRequests, toteTracks } from "../../webview/totelogic.js";
import { startup } from "../startup.js";
import { WebviewHost } from "./webviewhost.js";

export const TOTE_VIEW = "debrief.tote";

interface Asked {
  plot: string;
  time: string;
  tote: ToteChoice;
}

export class ToteView implements vscode.WebviewViewProvider {
  private readonly host: WebviewHost<vscode.WebviewView>;
  /** A choice the analyst made that is being saved: shown at once, before the save returns. */
  private choosing?: ToteChoice;
  private readonly requests: ToteRequests<Asked>;
  /** The values last shown, for tests and agents. */
  last?: ToteResult;

  constructor(
    extension: vscode.Uri,
    private readonly session: Session,
    ask: (plot: string, time: string, tote: ToteChoice) => Promise<ToteResult | undefined>,
    private readonly save: (tote: ToteChoice) => Promise<string | undefined>,
    private readonly log: (line: string) => void,
  ) {
    this.requests = new ToteRequests<Asked>(
      (asked) => ask(asked.plot, asked.time, asked.tote),
      (result, asked) => {
        // An answer for a plot no longer open, or a choice since changed, is not shown.
        if (asked.plot !== this.session.current?.item.id || !sameTote(asked.tote, this.choice())) return;
        this.last = result;
        this.post({ kind: "show_tote", ...(result && { tote: result }) });
      },
      (error) => this.log(`tote_failed message_length=${error.message.length}`),
    );
    session.onPlot(() => {
      this.requests.reset();
      this.choosing = undefined;
      this.last = undefined;
      this.showAll();
    });
    session.onView(() => {
      if (this.choosing && sameTote(this.choosing, toteOf(this.session.current?.plot))) this.choosing = undefined;
      this.showAll();
    });
    session.onState((change) => {
      if (change.time) this.refresh();
    });
    // The shared receiver (webview/dispatch.ts, PAR-13): each message checked, then handled here.
    const receive = receiveTote(
      {
        ready: () => {
          this.host.readied();
          this.showAll();
        },
        toteChanged: (tote) => void this.choose(tote),
      },
      checkMessage,
      (panel) => this.log(`webview_message_refused panel=${panel}`),
    );
    this.host = new WebviewHost(extension, { bundle: "tote", marks: TOTE_VIEW, receive: (raw) => void receive(raw) });
  }

  /** Whether the Tote view has loaded, for tests and agents. */
  get showing(): boolean {
    return this.host.ready;
  }

  /** How long each answer took, from asking to showing; for the latency checks. */
  latency() {
    return latencySummary(this.requests.timings);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.host.resolve(view, "Tote");
    view.onDidChangeVisibility(() => view.visible && this.refresh());
  }

  /** The choice shown: one being saved, else the plot's. */
  choice(): ToteChoice {
    return this.choosing ?? toteOf(this.session.current?.plot);
  }

  /** The analyst (or a command) chose tracks: show them at once, and save the choice in the island. */
  async choose(tote: ToteChoice): Promise<string | undefined> {
    if (!this.session.current) return "Open a plot first.";
    this.choosing = tote;
    this.refresh();
    const problem = await this.save(tote);
    if (problem) {
      // Not saved: show what the plot has again, so the view never claims otherwise.
      this.choosing = undefined;
      this.showAll();
    }
    return problem;
  }

  /** The tracks, the choice and the values: on opening a plot, and when its view changes. */
  private showAll(): void {
    const opened = this.session.current;
    if (!opened) return this.post({ kind: "show_tote" });
    this.post({ kind: "show_tote", tote_tracks: toteTracks(opened.plot), tote_view: this.choice() });
    this.refresh();
  }

  /** Ask for the values at current time, if the view is showing them. */
  refresh(): void {
    const opened = this.session.current;
    const time = this.session.time?.current;
    if (!opened || !time || !this.host.target?.visible || !this.host.ready) return;
    const tote = this.choice();
    if (!tote.primary && !tote.secondaries?.length) return;
    this.requests.request({ plot: opened.item.id, time, tote });
  }

  private post(message: MessageOf<"show_tote">): void {
    if (this.host.post(message)) startup.shown(TOTE_VIEW, !!message.tote_tracks);
  }
}
