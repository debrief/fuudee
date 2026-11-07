/**
 * The webview end of the host connection. Messages are boundary types (CON-08) both ways: the host
 * checks what the page sends, and the page checks what the host sends (pagecheck.ts).
 */
import type { WebviewMessage } from "@debrief/schemas";
import { checkReceived } from "./pagecheck.js";

/** A page's own startup marks (timing.ts): not a webview message, taken by the host before it checks one (src/startup.ts). */
export interface StartupTiming {
  startup_timing: Record<string, number>;
}

interface VsCodeApi {
  postMessage(message: WebviewMessage | StartupTiming): void;
  /** The page's own state, kept by VS Code while the view is hidden and shown again. */
  getState(): unknown;
  setState(state: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

export const host: VsCodeApi = acquireVsCodeApi();

/** Which page this is (its bundle's name: map, bearings, form and so on), for the log. Read now, while its script runs. */
const page = (document.currentScript as HTMLScriptElement | null)?.src.match(/([\w-]+)\.js(?:[?#].*)?$/)?.[1] ?? "unknown";

/**
 * The host's messages, each checked before the handler sees it. One that fails is refused and said
 * in the console, never with the message (it can quote plot content, NFR-14), as the hosts do.
 */
export function onMessage(handler: (message: WebviewMessage) => void): void {
  window.addEventListener("message", (event) => {
    let message: WebviewMessage;
    try {
      message = checkReceived(event.data);
    } catch {
      console.warn(`webview_message_refused page=${page}`);
      return;
    }
    handler(message);
  });
}
