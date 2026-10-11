/**
 * Stands in for VS Code inside a playground frame. Debrief's webviews (map, tool
 * form, results) call acquireVsCodeApi() and listen for "message" events; here
 * their messages go to the page that hosts them, and the page's messages
 * arrive as ordinary window messages. The webviews themselves are unchanged.
 */
const frame = new URLSearchParams(location.search).get("frame") ?? "map";
(globalThis as unknown as { acquireVsCodeApi: () => { postMessage(message: unknown): void } }).acquireVsCodeApi = () => ({
  postMessage: (message: unknown) => parent.postMessage({ debriefFrame: frame, message }, location.origin),
});
if (new URLSearchParams(location.search).get("theme") === "light") document.documentElement.classList.add("light");
