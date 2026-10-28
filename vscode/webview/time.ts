/**
 * The time controller in VS Code's Debrief sidebar (CAP-28, SUB-26): the same
 * component as the playground's (timecontrol.ts), in a view of its own above
 * the catalogues, outline, tools and history. The extension host owns shared
 * state and saves the window; this page only shows and sets them. How context
 * tracks are drawn is chosen from the view's title menu, not here.
 */
import { pageReady, pageShown } from "./timing.js";
import "./timecontrol.css";
import "./time.css";
import type { TimeRange, TimeState } from "@debrief/schemas";
import type { ContextTracks } from "./contrast.js";
import { TimeControl } from "./timecontrol.js";
import { host, onMessage } from "./vscode.js";

const root = document.getElementById("root")!;
root.innerHTML = `<p class="empty">Open a plot to set current time and its time window.</p><div id="timebar"></div>`;
const empty = root.querySelector<HTMLElement>(".empty")!;

// Tell the host at most once a frame, however fast a slider moves. A timer, not
// requestAnimationFrame, so playing goes on with the view collapsed.
let pending: TimeState | undefined;
const control = new TimeControl(
  document.getElementById("timebar")!,
  {
    moved: (time) => {
      const first = !pending;
      pending = time;
      if (first) {
        setTimeout(() => {
          const time = pending;
          pending = undefined;
          if (time) host.postMessage({ kind: "time_changed", time });
        }, 16);
      }
    },
    windowSaved: (window) => {
      // Whatever moved last reaches the host before the window is saved.
      if (pending) host.postMessage({ kind: "time_changed", time: pending });
      pending = undefined;
      host.postMessage({ kind: "window_changed", time_range: window });
    },
    playing: (playing) => host.postMessage({ kind: "playing_changed", playing }),
  },
  {
    contextInView: false,
    // Whether the window's details are open: VS Code's state for this view, kept while it is hidden and across reloads.
    windowOpen: {
      get: () => (host.getState() as { windowOpen?: boolean } | undefined)?.windowOpen,
      set: (open) => host.setState({ ...((host.getState() as object | undefined) ?? {}), windowOpen: open }),
    },
  },
);

onMessage((message) => {
  if (message.kind !== "show_time") return;
  const time = message.time as TimeState | undefined;
  empty.hidden = !!time;
  // The plot's choice of context tracks is shown in the window's summary; it is chosen from the view's title menu.
  control.show(time, message.time_range as TimeRange | undefined, {
    saved: message.saved_window as TimeRange | undefined,
    context: message.context_tracks as ContextTracks | undefined,
  });
  pageShown(!!time);
});
pageReady();
host.postMessage({ kind: "ready" });
