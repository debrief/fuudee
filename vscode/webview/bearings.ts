/**
 * The bearing view in VS Code's panel, beside the Terminal (CAP-21, CAP-22; product owner, 25 Oct 2026): the same component as
 * the playground's (tmacontrol.ts), in a view of its own. The extension host asks the tool
 * service for a sensor's cuts and a solution's residuals and makes every change; this page
 * shows them, works the residuals out again while a solution is dragged on the map, and
 * says what the analyst asked for.
 *
 * The same page shows in an editor tab or a window of its own when Bearings is popped out
 * (product owner, 28 Oct 2026): the host hands it the panes the last page showed (data-state),
 * and it says which show whenever they change (tma_panes), so they follow it there and back.
 */
import { pageReady, pageShown } from "./timing.js";
import "./tma.css";
import "./time.css";
import type { TimeState, TmaView } from "@debrief/schemas";
import type { LonLat } from "./geodesic.js";
import { TmaControl } from "./tmacontrol.js";
import { bearingsEvents } from "./dispatch.js";
import { PANES, readPanes, type PanesShown } from "./stackeddots.js";
import { host, onMessage } from "./vscode.js";

const root = document.getElementById("root")!;
root.classList.add("tma-root");
root.innerHTML = `<div id="tma"></div>`;

/** The panes the host says the last page showed (popped out, or back), else this view's own state. */
const given = (() => {
  try {
    return document.body.dataset.state ? (JSON.parse(document.body.dataset.state) as unknown) : undefined;
  } catch {
    return undefined;
  }
})();
const remembered = given ?? host.getState();
const tellPanes = (panes: PanesShown) => host.postMessage({ kind: "tma_panes", panes_shown: PANES.filter((p) => panes[p]) });

const control = new TmaControl(
  document.getElementById("tma")!,
  bearingsEvents((m) => host.postMessage(m)),
  undefined,
  // Which panes show: the view's own state, kept by VS Code (product owner, 25 Oct 2026), and the
  // host told, so a popped-out view, or the panel's again, shows the same (product owner, 28 Oct 2026).
  {
    load: () => remembered,
    save: (state) => {
      host.setState(state);
      tellPanes(state.panes);
    },
  },
);
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

// VS Code changes theme by changing the page's classes and variables: the plot drawn again in it.
const themeOf = () => [document.body.className, document.documentElement.className, document.documentElement.getAttribute("style") ?? ""].join("|");
let shownTheme = themeOf();
const themeChanged = () => {
  const theme = themeOf();
  if (theme === shownTheme) return;
  shownTheme = theme;
  control.themeChanged();
};
new MutationObserver(themeChanged).observe(document.body, { attributes: true, attributeFilter: ["class"] });
new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });

pageReady();
tellPanes(readPanes((remembered as { panes?: unknown } | undefined)?.panes));
host.postMessage({ kind: "ready" });
