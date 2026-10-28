/**
 * The panel's Bearings view while Bearings is popped out into a window of its own (product owner,
 * 28 Oct 2026): a line saying where it is, and Bring back and Focus that window as links to the
 * two commands, with no script. Apart from bearingshost.ts, so the unit tests can read it.
 */
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The panel's placeholder while Bearings is popped out: what to do, as links to the two commands. */
export function placeholderHtml(inWindow: boolean): string {
  const where = inWindow ? "its own window" : "an editor tab of its own";
  const focus = inWindow ? "Focus that window" : "Show that tab";
  const csp = ["default-src 'none'", "style-src 'unsafe-inline'"].join("; ");
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bearings</title>
<style>
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 12px 16px; }
p { margin: 0 0 10px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
a.button { display: inline-block; padding: 4px 12px; border-radius: 2px; text-decoration: none; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid var(--vscode-button-border, transparent); }
a.button:hover { background: var(--vscode-button-hoverBackground); }
a.button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
a.button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
a.button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
</style>
</head>
<body>
<p role="status">${escapeHtml(`Bearings is open in ${where}.`)}</p>
<p class="actions">
<a class="button" role="button" href="command:debrief.bringBackBearings" title="Close the popped-out Bearings and show it here again">Bring back</a>
<a class="button secondary" role="button" href="command:debrief.focusBearingsWindow" title="Bring the popped-out Bearings to the front">${escapeHtml(focus)}</a>
</p>
</body>
</html>`;
}
