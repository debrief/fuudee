/** The webview end of the host connection. Messages are validated by the host (CON-08). */
interface VsCodeApi {
  postMessage(message: unknown): void;
  /** The page's own state, kept by VS Code while the view is hidden and shown again. */
  getState(): unknown;
  setState(state: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

export const host: VsCodeApi = acquireVsCodeApi();

export function onMessage(handler: (message: Record<string, unknown> & { kind: string }) => void): void {
  window.addEventListener("message", (event) => handler(event.data));
}
