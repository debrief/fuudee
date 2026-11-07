/**
 * A panel view that pops out into a window of its own (review of 7 Nov 2026, finding 7),
 * generalised from Bearings' (product owner, 28 Oct 2026): in its own container in the panel below
 * the editor (a WebviewView), or popped out into an editor tab (a WebviewPanel) moved straight into
 * a window of its own, for a second monitor, as legacy Debrief's Stacked Dots could be. VS Code
 * moves only editors into other windows, never panel views, so popping out opens the same page as
 * an editor and runs VS Code's own "View: Move Editor into New Window"
 * (workbench.action.moveEditorToNewWindow) with it active. Where that cannot be done (a VS Code in
 * a browser, one without the command, or the command failing), it stays an editor tab the analyst
 * can drag, and that is said once a session.
 *
 * One live instance at a time: one controller drives whichever surface is live, so the popped-out
 * view is linked exactly as the panel's is. While popped out, the panel's view shows a placeholder
 * (no script: links to the commands it names). Closing the tab or its window brings the view back
 * to the panel.
 *
 * After VS Code reloads, a popped-out view is not restored: the plot is not reopened after a reload
 * (nor is the map), so there would be nothing for it to be linked to. The serializer closes the
 * editor VS Code restores and the view is back in the panel, ready for the plot when opened.
 */
import * as vscode from "vscode";
import type { WebviewMessage } from "@debrief/schemas";
import { startup } from "../startup.js";
import { webviewHtml } from "./html.js";
import { createPanel, resourceRoots } from "./webviewhost.js";
import { PopOut, type PoppedOut, type PoppedWindow } from "../../webview/panels/popout.js";

/** VS Code's command that moves the active editor into a new window of its own (VS Code 1.85 on). */
export const MOVE_TO_NEW_WINDOW = "workbench.action.moveEditorToNewWindow";

/** Where the view is live: the panel's view, or popped out. */
export type PoppableWhere = "panel" | "window";

/** A surface the view's page shows in: the panel's WebviewView, or the popped-out WebviewPanel. */
export interface PoppableSurface {
  readonly where: PoppableWhere;
  /** Post a message to its page; whether the page was there to take it. */
  post(message: WebviewMessage): PromiseLike<boolean>;
  /** Whether it is in sight now. */
  readonly visible: boolean;
  /** Bring it into sight; with preserveFocus, the keyboard left where it was. */
  show(preserveFocus: boolean): void;
}

/** What drives the view's page, wherever it is live (bearingsview.ts's BearingsView, for Bearings). */
export interface PoppableController {
  /** Opens the panel's view when there is no surface yet: set here. */
  open: (preserveFocus: boolean) => Promise<void>;
  attach(surface: PoppableSurface): void;
  detach(surface: PoppableSurface): void;
  /** A surface shown or hidden. */
  shown(surface: PoppableSurface): void;
  /** A message from a surface's page. */
  receive(raw: unknown, surface: PoppableSurface): unknown;
  /** The view in sight, wherever it is live. */
  reveal(preserveFocus?: boolean): Promise<void>;
}

/** What differs between views that pop out. */
export interface Poppable {
  /** The panel's view (WebviewView) id. */
  view: string;
  /** The popped-out editor's (WebviewPanel's) type. */
  window: string;
  /** Its title, on the editor tab and the page, and as said. */
  title: string;
  /** Its page's bundle (html.ts webviewHtml). */
  bundle: string;
  /** What its log lines begin with: "bearings" for bearings_popped_out. */
  log: string;
  /** The context key set while it is popped out. */
  contextKey: string;
  /** The panel's placeholder while popped out (inWindow: in a window of its own, not a tab), and the commands its links run. */
  placeholder(inWindow: boolean): string;
  placeholderCommands: readonly string[];
  /** What its page is given to start from (the panes the last page showed, say). */
  data?(): Record<string, string>;
}

export type { PoppedOut };

/** The popped-out editor, as the shared pop-out (webview/panels/popout.ts) holds it. */
interface EditorWindow extends PoppedWindow {
  panel: vscode.WebviewPanel;
  surface: PoppableSurface;
}

/** A command run (VS Code's, or a test's stand-in). */
export type RunCommand = (command: string, ...args: unknown[]) => Thenable<unknown>;

export class PoppableView<C extends PoppableController> implements vscode.WebviewViewProvider, vscode.WebviewPanelSerializer {
  private view?: vscode.WebviewView;
  private viewSurface?: PoppableSurface;
  /** Why the popped-out view could not go into a window of its own this session: not tried again. */
  private noWindow?: string;
  /** Whether that was said: once a session. */
  private said = false;
  /** The lifecycle the playground's pop-out shares: popped out, brought back, closed. */
  private readonly popOutState = new PopOut<EditorWindow>({
    open: () => this.openEditor(),
    poppedOut: (window) => this.adopt(window),
    placed: (window) => this.intoWindow(window.panel),
    settled: (_, popped) => this.settled(popped),
    cameBack: (window) => this.cameBack(window.surface),
  });
  /** How many times the move into a new window was asked for, for tests (under xvfb a window cannot be seen to move). */
  moveAsked = 0;

  constructor(
    private readonly poppable: Poppable,
    private readonly extension: vscode.Uri,
    protected readonly controller: C,
    private readonly log: (line: string) => void,
    private readonly run: RunCommand = (command, ...args) => vscode.commands.executeCommand(command, ...args),
  ) {
    controller.open = async () => void (await this.run(`${poppable.view}.focus`));
  }

  /** The popped-out editor, while open: for tests and agents. */
  get poppedOutPanel(): vscode.WebviewPanel | undefined {
    return this.popOutState.window?.panel;
  }

  /** How the last pop out ended, for tests and agents. */
  get popped(): PoppedOut | undefined {
    return this.popOutState.popped;
  }

  private get panel(): vscode.WebviewPanel | undefined {
    return this.poppedOutPanel;
  }

  /** Whether the panel's view shows the placeholder, not the view's page. */
  get placeholderShown(): boolean {
    return !!this.view && !!this.panel;
  }

  // --- The panel's view -------------------------------------------------------------------

  resolveWebviewView(view: vscode.WebviewView): void {
    startup.mark(this.poppable.view, "resolve");
    this.view = view;
    const surface: PoppableSurface = {
      where: "panel",
      post: (message) => view.webview.postMessage(message),
      get visible() {
        return view.visible;
      },
      show: (preserveFocus) => view.show(preserveFocus),
    };
    this.viewSurface = surface;
    this.controller.attach(surface);
    this.dressView();
    startup.mark(this.poppable.view, "html");
    view.onDidDispose(() => {
      if (this.view !== view) return;
      this.view = undefined;
      this.viewSurface = undefined;
      this.controller.detach(surface);
    });
    view.onDidChangeVisibility(() => this.controller.shown(surface));
    view.webview.onDidReceiveMessage((raw) => void this.controller.receive(raw, surface));
  }

  /** The panel's view as things stand: the page, or while popped out the placeholder. */
  private dressView(): void {
    const view = this.view;
    if (!view) return;
    const root = resourceRoots(this.extension);
    if (this.panel) {
      // No script: the buttons are links to the commands, and only those.
      view.webview.options = { enableScripts: false, enableCommandUris: [...this.poppable.placeholderCommands], localResourceRoots: root };
      view.webview.html = this.poppable.placeholder(this.popped?.where !== "tab");
    } else {
      view.webview.options = { enableScripts: true, localResourceRoots: root };
      view.webview.html = this.page(view.webview);
    }
  }

  /** The view's page, with what it starts from. */
  private page(webview: vscode.Webview): string {
    return webviewHtml(webview, this.extension, this.poppable.bundle, this.poppable.title, this.poppable.data?.() ?? {});
  }

  // --- Popped out -------------------------------------------------------------------------

  /**
   * Popped out: opened as an editor tab and moved into a window of its own, the panel left a
   * placeholder. Popped out already: that tab or window brought to the front.
   */
  async popOut(): Promise<PoppedOut> {
    return (await this.popOutState.popOut())!;
  }

  /** The view opened as an editor tab, made active. */
  private openEditor(): EditorWindow {
    const panel = createPanel(this.poppable.window, this.poppable.title, { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, this.extension);
    const surface: PoppableSurface = {
      where: "window",
      post: (message) => panel.webview.postMessage(message),
      get visible() {
        return panel.visible;
      },
      show: (preserveFocus) => panel.reveal(undefined, preserveFocus),
    };
    return { panel, surface, focus: () => panel.reveal(undefined, false), close: () => panel.dispose() };
  }

  /** An editor showing the view: live, linked, the panel a placeholder until it closes. */
  private adopt(window: EditorWindow): void {
    const { panel, surface } = window;
    panel.iconPath = vscode.Uri.joinPath(this.extension, "media", "debrief.svg");
    panel.webview.html = this.page(panel.webview);
    panel.webview.onDidReceiveMessage((raw) => void this.controller.receive(raw, surface));
    panel.onDidChangeViewState(() => this.controller.shown(surface));
    panel.onDidDispose(() => this.popOutState.closed(window));
    this.controller.attach(surface);
    this.dressView();
    void this.run("setContext", this.poppable.contextKey, true);
  }

  /** Placed: logged, the placeholder saying where it went, and a tab's reason said once a session. */
  private settled(popped: PoppedOut): void {
    this.log(`${this.poppable.log}_popped_out where=${popped.where}`);
    this.dressView();
    if (popped.reason && !this.said) {
      this.said = true;
      void vscode.window.showInformationMessage(`${this.poppable.title} is open in an editor tab: ${popped.reason}. Drag the tab out of the window, or to another editor group.`);
    }
  }

  /** Into a window of its own, if VS Code can here; else left a tab, and why. */
  private async intoWindow(panel: vscode.WebviewPanel): Promise<PoppedOut> {
    if (this.noWindow) return { where: "tab", reason: this.noWindow };
    let reason: string | undefined;
    if (vscode.env.uiKind === vscode.UIKind.Web) reason = "VS Code in a browser cannot open a window of its own";
    else if (!(await vscode.commands.getCommands(false)).includes(MOVE_TO_NEW_WINDOW)) reason = "this VS Code cannot move an editor into a new window";
    if (!reason) {
      // The command moves the active editor: this one, once VS Code has made it active.
      await activeSoon(panel);
      this.moveAsked++;
      try {
        await this.run(MOVE_TO_NEW_WINDOW);
      } catch (error) {
        this.log(`${this.poppable.log}_new_window_failed message_length=${(error as Error).message?.length ?? 0}`);
        reason = "VS Code could not move it into a new window";
      }
    }
    if (reason) {
      this.noWindow = reason;
      return { where: "tab", reason };
    }
    return { where: "window" };
  }

  /** The popped-out editor closed (or its window): the view back in the panel, in sight, the keyboard left where it was. */
  private cameBack(surface: PoppableSurface): void {
    this.controller.detach(surface);
    void this.run("setContext", this.poppable.contextKey, false);
    this.dressView();
    this.log(`${this.poppable.log}_back_in_panel`);
    if (this.viewSurface) this.viewSurface.show(true);
    else void this.controller.reveal(true);
  }

  /** Bring back: the popped-out editor closed, the view in the panel again. */
  async bringBack(): Promise<void> {
    this.popOutState.bringBack();
    await this.controller.reveal(false);
  }

  /** The popped-out tab, or its window, brought to the front with the keyboard in it. */
  focusWindow(): void {
    this.popOutState.focusWindow();
  }

  /**
   * VS Code restoring a popped-out view after a reload: closed, the view back in the panel.
   * Debrief does not reopen the plot after a reload (nor the map), so it would be linked to nothing.
   */
  async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
    this.log(`${this.poppable.log}_window_restored_closed`);
    panel.dispose();
  }
}

/** Until the editor is active (VS Code makes it so a moment after it is made), or a second passes. */
function activeSoon(panel: vscode.WebviewPanel): Promise<void> {
  if (panel.active) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, 1000);
    const watch = panel.onDidChangeViewState(() => panel.active && done());
    function done() {
      clearTimeout(timer);
      watch.dispose();
      resolve();
    }
  });
}
