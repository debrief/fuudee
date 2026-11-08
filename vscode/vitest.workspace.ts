import { defineWorkspace } from "vitest/config";

// Two projects (review, 7 Nov 2026, finding 10): the pure modules in Node, and the webview's
// *control.ts classes in jsdom, with a canvas that records what is drawn and a ResizeObserver
// the test calls (test/webview/setup.ts). The controls' drawing is still checked in a browser
// by the playground and VS Code suites; these hold their state and layout.
export default defineWorkspace([
  { test: { name: "unit", include: ["test/unit/**/*.test.ts"], environment: "node" } },
  { test: { name: "webview", include: ["test/webview/**/*.test.ts"], environment: "jsdom", setupFiles: ["test/webview/setup.ts"] } },
]);
