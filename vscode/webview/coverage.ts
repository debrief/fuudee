/**
 * Coverage in VS Code's Debrief sidebar (CAP-08 to CAP-12): the same component as the
 * playground's (coveragecontrol.ts), in a view of its own below Catalogues. The extension
 * host asks the tool service for the open plot's coverage and makes each choice through
 * it; this page only shows the coverage and says what the analyst chose.
 */
import { pageReady, pageShown } from "./timing.js";
import "./coverage.css";
import "./time.css";
import type { CoverageReport, TimeState } from "@debrief/schemas";
import { CoverageControl } from "./coveragecontrol.js";
import { host, onMessage } from "./vscode.js";

const root = document.getElementById("root")!;
const control = new CoverageControl(root, {
  choose: (track, period, source) => host.postMessage({ kind: "source_chosen", feature_id: track, time_range: period, source }),
  link: (track, source, linked) => host.postMessage({ kind: "link_changed", feature_id: track, source, linked }),
  take: (item) => host.postMessage({ kind: "take_asked", item_revision: item }),
  dismiss: (item) => host.postMessage({ kind: "dismiss_asked", item_revision: item }),
  reviewed: () => host.postMessage({ kind: "review_cleared" }),
});

onMessage((message) => {
  if (message.kind === "show_coverage") {
    const report = message.coverage as CoverageReport | undefined;
    // A message alone says why a choice was not made, and leaves what is shown.
    if (message.message !== undefined && !report) return control.say(String(message.message));
    control.show(report);
    const time = message.time as TimeState | undefined;
    control.setTime(time ? Date.parse(time.current) : undefined);
    pageShown(!!report);
  } else if (message.kind === "set_time") {
    control.setTime(Date.parse((message.time as TimeState).current));
  }
});
pageReady();
host.postMessage({ kind: "ready" });
