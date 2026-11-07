/**
 * Where Bearings shows in VS Code (product owner, 28 Oct 2026): in its own container in the
 * panel below the editor (a WebviewView, 25 Oct 2026), or popped out into an editor tab moved
 * straight into a window of its own, for a second monitor, as legacy Debrief's Stacked Dots could
 * be: a PoppableView (poppableview.ts, which says how). One controller (bearingsview.ts) drives
 * whichever surface is live. While popped out, the panel's view shows a placeholder with Bring back
 * and Focus that window (bearingsplaceholder.ts).
 */
import type * as vscode from "vscode";
import { BEARINGS_VIEW, type BearingsView } from "./bearingsview.js";
import { placeholderHtml } from "./bearingsplaceholder.js";
import { PoppableView, type RunCommand } from "./poppableview.js";

export { MOVE_TO_NEW_WINDOW, type PoppedOut, type RunCommand } from "./poppableview.js";

/** The popped-out Bearings' editor (WebviewPanel) type. */
export const BEARINGS_WINDOW = "debrief.bearingsWindow";

export class BearingsHost extends PoppableView<BearingsView> {
  constructor(extension: vscode.Uri, controller: BearingsView, log: (line: string) => void, run?: RunCommand) {
    super(
      {
        view: BEARINGS_VIEW,
        window: BEARINGS_WINDOW,
        title: "Bearings",
        bundle: "bearings",
        log: "bearings",
        contextKey: "debrief.bearingsPoppedOut",
        placeholder: placeholderHtml,
        placeholderCommands: ["debrief.bringBackBearings", "debrief.focusBearingsWindow"],
        // The panes the last page showed.
        data: (): Record<string, string> => (controller.panes ? { state: JSON.stringify({ panes: controller.panes }) } : {}),
      },
      extension,
      controller,
      log,
      run,
    );
  }
}
