/**
 * Where Bearings shows in VS Code (product owner, 28 Oct 2026): in its own container in the
 * panel below the editor (a WebviewView, 25 Oct 2026), or popped out into an editor tab (a
 * WebviewPanel) moved straight into a window of its own, for a second monitor, as legacy
 * Debrief's Stacked Dots could be. VS Code moves only editors into other windows, never panel
 * views, so popping out opens the same page as an editor and runs VS Code's own "View: Move
 * Editor into New Window" (workbench.action.moveEditorToNewWindow) with it active. Where that
 * cannot be done (a VS Code in a browser, one without the command, or the command failing), it
 * stays an editor tab the analyst can drag, and that is said once a session.
 *
 * One live instance at a time: one controller (bearingsview.ts) drives whichever surface is
 * live, so the popped-out view is linked exactly as the panel's is. While popped out, the
 * panel's view shows a placeholder with Bring back and Focus that window. Closing the tab or
 * its window brings Bearings back to the panel.
 *
 * After VS Code reloads, a popped-out Bearings is not restored: the plot is not reopened after a
 * reload (nor is the map), so there would be nothing for it to be linked to. The serializer closes
 * the editor VS Code restores and Bearings is back in the panel, ready for the plot when opened.
 */
import * as vscode from "vscode";
import { startup } from "../startup.js";
import { BEARINGS_VIEW, type BearingsSurface, type BearingsView } from "./bearingsview.js";
import { placeholderHtml } from "./bearingsplaceholder.js";
import { webviewHtml } from "./html.js";

/** The popped-out Bearings' editor (WebviewPanel) type. */
export const BEARINGS_WINDOW = "debrief.bearingsWindow";
/** VS Code's command that moves the active editor into a new window of its own (VS Code 1.85 on). */
export const MOVE_TO_NEW_WINDOW = "workbench.action.moveEditorToNewWindow";

/** How a pop out ended: in a window of its own, or left an editor tab, and why. */
export interface PoppedOut {
  where: "window" | "tab";
  reason?: string;
}

/** A command run (VS Code's, or a test's stand-in). */
export type RunCommand = (command: string, ...args: unknown[]) => Thenable<unknown>;

export class BearingsHost implements vscode.WebviewViewProvider, vscode.WebviewPanelSerializer {
  private view?: vscode.WebviewView;
  private viewSurface?: BearingsSurface;
  private panel?: vscode.WebviewPanel;
  /** Why the popped-out view could not go into a window of its own this session: not tried again. */
  private noWindow?: string;
  /** Whether that was said: once a session. */
  private said = false;
  /** How the last pop out ended, for tests and agents. */
  popped?: PoppedOut;
  /** How many times the move into a new window was asked for, for tests (under xvfb a window cannot be seen to move). */
  moveAsked = 0;

  constructor(
    private readonly extension: vscode.Uri,
    private readonly controller: BearingsView,
    private readonly log: (line: string) => void,
    private readonly run: RunCommand = (command, ...args) => vscode.commands.executeCommand(command, ...args),
  ) {
    controller.open = async () => void (await this.run(`${BEARINGS_VIEW}.focus`));
  }

  /** The popped-out editor, while open: for tests and agents. */
  get poppedOutPanel(): vscode.WebviewPanel | undefined {
    return this.panel;
  }

  /** Whether the panel's view shows the placeholder, not Bearings. */
  get placeholderShown(): boolean {
    return !!this.view && !!this.panel;
  }

  // --- The panel's view -------------------------------------------------------------------

  resolveWebviewView(view: vscode.WebviewView): void {
    startup.mark(BEARINGS_VIEW, "resolve");
    this.view = view;
    const surface: BearingsSurface = {
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
    startup.mark(BEARINGS_VIEW, "html");
    view.onDidDispose(() => {
      if (this.view !== view) return;
      this.view = undefined;
      this.viewSurface = undefined;
      this.controller.detach(surface);
    });
    view.onDidChangeVisibility(() => this.controller.shown(surface));
    view.webview.onDidReceiveMessage((raw) => void this.controller.receive(raw, surface));
  }

  /** The panel's view as things stand: Bearings, or while popped out the placeholder. */
  private dressView(): void {
    const view = this.view;
    if (!view) return;
    const root = vscode.Uri.joinPath(this.extension, "dist", "webview");
    if (this.panel) {
      // No script: the buttons are links to the commands, and only those two.
      view.webview.options = { enableScripts: false, enableCommandUris: ["debrief.bringBackBearings", "debrief.focusBearingsWindow"], localResourceRoots: [root] };
      view.webview.html = placeholderHtml(this.popped?.where !== "tab");
    } else {
      view.webview.options = { enableScripts: true, localResourceRoots: [root] };
      view.webview.html = this.page(view.webview);
    }
  }

  /** Bearings' page, with the panes the last page showed. */
  private page(webview: vscode.Webview): string {
    const panes = this.controller.panes;
    return webviewHtml(webview, this.extension, "bearings", "Bearings", panes ? { state: JSON.stringify({ panes }) } : {});
  }

  // --- Popped out -------------------------------------------------------------------------

  /**
   * Bearings popped out: opened as an editor tab and moved into a window of its own, the panel
   * left a placeholder. Popped out already: that tab or window brought to the front.
   */
  async popOut(): Promise<PoppedOut> {
    if (this.panel) {
      this.panel.reveal(undefined, false);
      return this.popped ?? { where: "tab" };
    }
    const panel = vscode.window.createWebviewPanel(
      BEARINGS_WINDOW,
      "Bearings",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(this.extension, "dist", "webview")] },
    );
    this.adopt(panel);
    const popped = await this.intoWindow(panel);
    this.popped = popped;
    this.log(`bearings_popped_out where=${popped.where}`);
    // The placeholder says where it went.
    this.dressView();
    if (popped.reason && !this.said) {
      this.said = true;
      void vscode.window.showInformationMessage(`Bearings is open in an editor tab: ${popped.reason}. Drag the tab out of the window, or to another editor group.`);
    }
    return popped;
  }

  /** An editor showing Bearings: live, linked, the panel a placeholder until it closes. */
  private adopt(panel: vscode.WebviewPanel): void {
    this.panel = panel;
    panel.iconPath = vscode.Uri.joinPath(this.extension, "media", "debrief.svg");
    const surface: BearingsSurface = {
      where: "window",
      post: (message) => panel.webview.postMessage(message),
      get visible() {
        return panel.visible;
      },
      show: (preserveFocus) => panel.reveal(undefined, preserveFocus),
    };
    panel.webview.html = this.page(panel.webview);
    panel.webview.onDidReceiveMessage((raw) => void this.controller.receive(raw, surface));
    panel.onDidChangeViewState(() => this.controller.shown(surface));
    panel.onDidDispose(() => this.cameBack(panel, surface));
    this.controller.attach(surface);
    this.dressView();
    void this.run("setContext", "debrief.bearingsPoppedOut", true);
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
        this.log(`bearings_new_window_failed message_length=${(error as Error).message?.length ?? 0}`);
        reason = "VS Code could not move it into a new window";
      }
    }
    if (reason) {
      this.noWindow = reason;
      return { where: "tab", reason };
    }
    return { where: "window" };
  }

  /** The popped-out editor closed (or its window): Bearings back in the panel, in sight, the keyboard left where it was. */
  private cameBack(panel: vscode.WebviewPanel, surface: BearingsSurface): void {
    if (this.panel !== panel) return;
    this.panel = undefined;
    this.controller.detach(surface);
    void this.run("setContext", "debrief.bearingsPoppedOut", false);
    this.dressView();
    this.log("bearings_back_in_panel");
    if (this.viewSurface) this.viewSurface.show(true);
    else void this.controller.reveal(true);
  }

  /** Bring back: the popped-out editor closed, Bearings in the panel again. */
  async bringBack(): Promise<void> {
    if (this.panel) this.panel.dispose();
    await this.controller.reveal(false);
  }

  /** The popped-out tab, or its window, brought to the front with the keyboard in it. */
  focusWindow(): void {
    this.panel?.reveal(undefined, false);
  }

  /**
   * VS Code restoring a popped-out Bearings after a reload: closed, Bearings back in the panel.
   * Debrief does not reopen the plot after a reload (nor the map), so it would be linked to nothing.
   */
  async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
    this.log("bearings_window_restored_closed");
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
