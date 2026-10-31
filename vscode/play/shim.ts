/**
 * Stands in for VS Code inside a playground frame. Debrief's webviews (map, tool
 * form, results, Bearings) call acquireVsCodeApi() and listen for "message" events; here
 * their messages go to the page that hosts them, and the page's messages
 * arrive as ordinary window messages. The webviews themselves are unchanged.
 * Bearings popped out is a window of its own (product owner, 28 Oct 2026), not a frame:
 * the page that opened it hosts it. Its state (which panes show) is kept in this
 * browser, under the same key as the panel's, so the panes follow it there and back.
 */
const frame = new URLSearchParams(location.search).get("frame") ?? "map";
const hostWindow: Window = window.opener ?? parent;
const stateKey = `debrief.play.${frame}`;
(globalThis as unknown as { acquireVsCodeApi: () => { postMessage(message: unknown): void; getState(): unknown; setState(state: unknown): void } }).acquireVsCodeApi = () => ({
  postMessage: (message: unknown) => hostWindow.postMessage({ debriefFrame: frame, message }, location.origin),
  getState: () => {
    try {
      const text = localStorage.getItem(stateKey);
      return text ? (JSON.parse(text) as unknown) : undefined;
    } catch {
      return undefined;
    }
  },
  setState: (state: unknown) => {
    try {
      localStorage.setItem(stateKey, JSON.stringify(state));
    } catch {
      // Not remembered: the panes stay as chosen in this window.
    }
  },
});
if (new URLSearchParams(location.search).get("theme") === "light") document.documentElement.classList.add("light");

// Undo and redo keys work wherever the reader is, as in VS Code: Ctrl+Z, Ctrl+Shift+Z
// and Ctrl+Y go to the page, which owns the history. Not while typing in a field,
// where they undo the typing.
document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || !/^[zy]$/i.test(event.key)) return;
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
  event.preventDefault();
  const { key, ctrlKey, metaKey, shiftKey } = event;
  hostWindow.postMessage({ debriefKey: { key, ctrlKey, metaKey, shiftKey } }, location.origin);
});
