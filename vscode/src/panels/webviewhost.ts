/**
 * What every Debrief webview's host does the same way (review 7 Nov 2026, finding 7): the
 * webview's options and the folder its page may load from, the page, whether the page has said
 * it is ready, what happens when VS Code disposes of it, the startup marks
 * (docs/notes/webview-startup.md), and posting to the page. Each panel or view owns one
 * WebviewHost and keeps only what is its own: what it shows, and what it does with what its
 * page says (the shared receivers, webview/dispatch.ts, PAR-13).
 *
 * Posting is ready-gated, as it always was: a message posted before the page says it is ready
 * (or after it is gone) is dropped, not queued, because each host sends everything its page
 * shows again when the page says it is ready. What must wait for a page that is opening (the
 * map's export, its first-guess clicks) waits for whenReady().
 *
 * Every message posted is the generated union's (CON-08): typed when it is written, and checked
 * against the schema before it goes, as every message is.
 *
 * Whether a webview's page is kept while it is hidden is decided here, for all of them
 * (RETAIN_CONTEXT_WHEN_HIDDEN), not where each is registered or opened.
 */
import * as vscode from "vscode";
import type { MessageKind, MessageOf } from "@debrief/schemas";
import { checkMessage } from "../messages.js";
import { startup } from "../startup.js";
import { webviewHtml } from "./html.js";

/**
 * Whether each webview's page is kept while it is hidden, by view or panel type. Kept, a page
 * hidden and shown again is as it was, with what the analyst typed in a form, where a list was
 * scrolled to and the map's zoom. Coverage is not: everything it shows is sent again each time
 * it comes into sight, and it holds nothing typed.
 */
export const RETAIN_CONTEXT_WHEN_HIDDEN: Readonly<Record<string, boolean>> = {
  "debrief.time": true,
  "debrief.tote": true,
  "debrief.timeline": true,
  "debrief.bearings": true,
  "debrief.bearingsWindow": true,
  "debrief.coverage": false,
  "debrief.map": true,
  "debrief.form": true,
  "debrief.results": true,
  "debrief.annotation": true,
};

/** Whether this view or panel type's page is kept while hidden; false for one not listed. */
export function retained(type: string): boolean {
  return RETAIN_CONTEXT_WHEN_HIDDEN[type] ?? false;
}

/** The only folder a Debrief page may load from: the built webview bundles. */
export function resourceRoots(extension: vscode.Uri): vscode.Uri[] {
  return [vscode.Uri.joinPath(extension, "dist", "webview")];
}

/** A sidebar or panel view registered, its page kept while hidden or not as decided above. */
export function registerView(id: string, provider: vscode.WebviewViewProvider): vscode.Disposable {
  return vscode.window.registerWebviewViewProvider(id, provider, retained(id) ? { webviewOptions: { retainContextWhenHidden: true } } : undefined);
}

/** An editor panel opened with scripts on, the bundles its only resources, kept while hidden or not as decided above. */
export function createPanel(type: string, title: string, column: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean }, extension: vscode.Uri): vscode.WebviewPanel {
  return vscode.window.createWebviewPanel(type, title, column, {
    enableScripts: true,
    ...(retained(type) && { retainContextWhenHidden: true }),
    localResourceRoots: resourceRoots(extension),
  });
}

export interface HostedPage {
  /** The page's bundle in dist/webview. */
  bundle: string;
  /** The name its startup marks are kept under (startup.ts); none, for a page not measured. */
  marks?: string;
  /** What the page says: each message, as it came. */
  receive: (raw: unknown) => void;
  /** VS Code disposed of the view or panel. */
  disposed?: () => void;
}

type Hosted = vscode.WebviewView | vscode.WebviewPanel;

export class WebviewHost<T extends Hosted = Hosted> {
  private hosted?: T;
  private isReady = false;
  private waiting: Array<() => void> = [];

  constructor(
    private readonly extension: vscode.Uri,
    private readonly page: HostedPage,
  ) {}

  /** The view or panel, while VS Code has it. */
  get target(): T | undefined {
    return this.hosted;
  }

  /** Whether the page is there and has said it is ready. */
  get ready(): boolean {
    return this.isReady && !!this.hosted;
  }

  /** A view VS Code resolved: its options set, then its page. */
  resolve(view: T & vscode.WebviewView, title: string): void {
    this.mark("resolve");
    view.webview.options = { enableScripts: true, localResourceRoots: resourceRoots(this.extension) };
    this.adopt(view, title);
  }

  /** An editor panel opened (createPanel, its options already set): its page. */
  open(type: string, title: string, column: vscode.ViewColumn): T & vscode.WebviewPanel {
    this.mark("resolve");
    const panel = createPanel(type, title, column, this.extension) as T & vscode.WebviewPanel;
    this.adopt(panel, title);
    return panel;
  }

  private adopt(hosted: T, title: string): void {
    this.hosted = hosted;
    this.isReady = false;
    hosted.webview.html = webviewHtml(hosted.webview, this.extension, this.page.bundle, title);
    this.mark("html");
    hosted.onDidDispose(() => {
      if (this.hosted !== hosted) return;
      this.hosted = undefined;
      this.isReady = false;
      this.page.disposed?.();
    });
    hosted.webview.onDidReceiveMessage((raw) => {
      if (this.page.marks && startup.fromPage(this.page.marks, raw)) return;
      this.page.receive(raw);
    });
  }

  /** The page said it is ready: posts go to it from now on, and whoever waited for it goes on. Call before sending it everything again. */
  readied(): void {
    this.mark("ready");
    this.isReady = true;
    const waiting = this.waiting;
    this.waiting = [];
    for (const go of waiting) go();
  }

  /** Once a page is ready: at once if one is; else when one says so, or rejected after timeoutMs. */
  whenReady(timeoutMs?: number): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const go = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer =
        timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              this.waiting = this.waiting.filter((w) => w !== go);
              reject(new Error("The page was not ready in time."));
            }, timeoutMs);
      this.waiting.push(go);
    });
  }

  /** Post to the page, checked against the schema, if it is ready; whether it was posted. */
  post<K extends MessageKind>(message: MessageOf<K>): boolean {
    const hosted = this.hosted;
    if (!hosted || !this.isReady) return false;
    void hosted.webview.postMessage(checkMessage(message));
    return true;
  }

  private mark(event: string): void {
    if (this.page.marks) startup.mark(this.page.marks, event);
  }
}
