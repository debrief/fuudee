import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

/** A webview page loading one bundle, with a strict content security policy. */
export function webviewHtml(webview: vscode.Webview, extension: vscode.Uri, bundle: string, title: string): string {
  const nonce = randomBytes(16).toString("base64");
  const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(extension, "dist", "webview", name));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`, // vscrui styles components inline
    `font-src ${webview.cspSource}`,
    `connect-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`, // not user-facing
  ].join("; ");
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="${asset(`${bundle}.css`)}">
</head>
<body data-land="${asset("land.geojson")}">
<div id="root"></div>
<script nonce="${nonce}" src="${asset(`${bundle}.js`)}"></script>
</body>
</html>`;
}
