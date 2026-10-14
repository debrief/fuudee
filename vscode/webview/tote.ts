/**
 * The Tote in VS Code's Debrief sidebar (CAP-06): the same component as the
 * playground's (totecontrol.ts), in a view of its own below the Time view. The
 * extension host asks the tool service for the values at each current time and
 * saves the choice of tracks in the plot's island; this page only shows them and
 * says what the analyst chose.
 */
import "./tote.css";
import "./time.css";
import type { ToteResult, ToteTrack, ToteView } from "@debrief/schemas";
import { ToteControl } from "./totecontrol.js";
import { host, onMessage } from "./vscode.js";

const root = document.getElementById("root")!;
root.innerHTML = `<p class="empty">Open a plot to compare tracks at current time.</p><div id="tote"></div>`;
const empty = root.querySelector<HTMLElement>(".empty")!;
const panel = document.getElementById("tote")!;

const control = new ToteControl(panel, { changed: (view) => host.postMessage({ kind: "tote_changed", tote_view: view }) });

onMessage((message) => {
  if (message.kind !== "show_tote") return;
  const tracks = message.tote_tracks as ToteTrack[] | undefined;
  const view = message.tote_view as ToteView | undefined;
  const result = message.tote as ToteResult | undefined;
  const open = !!(tracks || view || result);
  empty.hidden = open;
  panel.hidden = !open;
  control.show(open ? { tracks, view, result } : undefined);
});
host.postMessage({ kind: "ready" });
