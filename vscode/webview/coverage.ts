/**
 * Coverage in VS Code's Debrief sidebar (CAP-08 to CAP-12): the same component as the
 * playground's (coveragecontrol.ts), in a view of its own below Catalogues. The extension
 * host asks the tool service for the open plot's coverage and makes each choice through
 * it; this page only shows the coverage and says what the analyst chose.
 */
import { pageReady, pageShown } from "./timing.js";
import "./coverage.css";
import "./time.css";
import { CoverageControl } from "./coveragecontrol.js";
import { coverageEvents } from "./dispatch.js";
import { host, onMessage } from "./vscode.js";

const root = document.getElementById("root")!;
const control = new CoverageControl(root, coverageEvents((m) => host.postMessage(m)));

onMessage((message) => {
  if (message.kind === "show_coverage") {
    const report = message.coverage ?? undefined;
    // A message alone says why a choice was not made, and leaves what is shown.
    if (message.message !== undefined && message.message !== null && !report) return control.say(message.message);
    control.show(report);
    const time = message.time;
    control.setTime(time ? Date.parse(time.current) : undefined);
    pageShown(!!report);
  } else if (message.kind === "set_time") {
    control.setTime(Date.parse(message.time.current));
  }
});
pageReady();
host.postMessage({ kind: "ready" });
