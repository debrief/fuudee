/**
 * The bearing view in VS Code's Debrief sidebar (CAP-21, CAP-22): the same component as
 * the playground's (tmacontrol.ts), in a view of its own. The extension host asks the tool
 * service for a sensor's cuts and a solution's residuals and makes every change; this page
 * shows them, works the residuals out again while a solution is dragged on the map, and
 * says what the analyst asked for.
 */
import { pageReady, pageShown } from "./timing.js";
import "./tma.css";
import "./time.css";
import type { TimeState, TmaView } from "@debrief/schemas";
import type { LonLat } from "./geodesic.js";
import { TmaControl } from "./tmacontrol.js";
import { host, onMessage } from "./vscode.js";

const root = document.getElementById("root")!;
root.classList.add("tma-root");
root.innerHTML = `<div id="tma"></div>`;

const control = new TmaControl(document.getElementById("tma")!, {
  choose: (feature_id) => host.postMessage({ kind: "tma_chosen", feature_id }),
  create: (tma_request) => host.postMessage({ kind: "tma_create", tma_request }),
  guess: (tma_request) => host.postMessage({ kind: "tma_guess", tma_request }),
  exclude: (feature_id, cut_ids, excluded) => host.postMessage({ kind: "tma_exclude", feature_id, cut_ids, excluded }),
  split: (feature_id, current_time) => host.postMessage({ kind: "tma_split", feature_id, current_time }),
  time: (current_time) => host.postMessage({ kind: "tma_time_asked", current_time }),
  resolve: (feature_id, keep) => host.postMessage({ kind: "resolve_asked", feature_id, keep }),
});
(window as unknown as { debriefTma: TmaControl }).debriefTma = control;

onMessage((message) => {
  if (message.kind === "show_tma") {
    control.show(message.tma as TmaView | undefined);
    pageShown(!!message.tma);
  } else if (message.kind === "set_time") {
    const time = message.time as TimeState;
    control.setTime(Date.parse(time.current), time.range);
  } else if (message.kind === "tma_preview") {
    const preview = message.preview as { coordinates: LonLat[] } | undefined;
    control.preview(message.feature_id as string, preview?.coordinates);
  } else if (message.kind === "tma_made") {
    // The host's answer to a solution asked for: made, or why not.
    control.made(message.message as string | undefined);
  }
});
pageReady();
host.postMessage({ kind: "ready" });
