/** Text made safe to put in a webview page's HTML. Apart from html.ts, which needs VS Code, so pages the unit tests read can use it too. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
