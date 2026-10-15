/**
 * The Timeline in VS Code's Debrief sidebar (CAP-05, CAP-20): the same component as the
 * playground's (timelinecontrol.ts), in a view of its own. The extension host sends the
 * plot's entries in the Timeline's order and current time; this page lists them, follows
 * current time and says what the analyst chose, added, changed or deleted. The filter is
 * the analyst's own, kept with the view (VS Code's webview state), never in the plot.
 */
import "./timeline.css";
import "./time.css";
import type { TimeState, TimelineEntry, ToteTrack } from "@debrief/schemas";
import { TimelineControl } from "./timelinecontrol.js";
import { host, onMessage } from "./vscode.js";

document.body.classList.add("tl-page");
const root = document.getElementById("root")!;
const control = new TimelineControl(
  root,
  {
    choose: (id) => host.postMessage({ kind: "timeline_chosen", feature_id: id }),
    save: (narrative, id) => host.postMessage({ kind: "save_narrative", narrative, ...(id && { feature_id: id }) }),
    remove: (id) => host.postMessage({ kind: "delete_narrative", feature_id: id }),
  },
  undefined,
  {
    load: () => (host.getState() as { filter?: unknown } | undefined)?.filter,
    save: (filter) => host.setState({ filter }),
  },
);

onMessage((message) => {
  if (message.kind === "show_timeline") {
    const entries = message.timeline_entries as TimelineEntry[] | undefined;
    const tracks = message.timeline_tracks as ToteTrack[] | undefined;
    control.show(entries || tracks ? { entries: entries ?? [], tracks } : undefined);
    control.setTime(message.time as TimeState | undefined);
  } else if (message.kind === "set_time") {
    control.setTime(message.time as TimeState);
  } else if (message.kind === "narrative_saved") {
    control.saved(message.feature_id as string | undefined, message.message as string | undefined);
  } else if (message.kind === "open_narrative_form") {
    control.openForm(message.feature_id as string | undefined);
  }
});
host.postMessage({ kind: "ready" });
