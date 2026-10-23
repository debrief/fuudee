// DEV-10: interface colours come only from VS Code theme tokens (CON-06, NFR-13).
// A hard-coded colour is allowed only in webview/palette.ts, which holds data colours (DEV-07),
// and play/theme.css, which stands in for VS Code's theme in the browser: it defines the tokens.
// The browser's page and its docked layout (play/, Dockview styled by dock.css) are held to it too.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;
const ALLOWED = new Set(["webview/palette.ts", "play/theme.css"]);
const problems = [];
for (const folder of ["webview", "src", "play"]) {
  for (const name of readdirSync(folder, { recursive: true })) {
    const file = path.join(folder, String(name)).replaceAll(path.sep, "/");
    if (!/\.(css|ts|tsx)$/.test(file) || ALLOWED.has(file)) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, index) => {
      for (const match of line.matchAll(COLOUR)) problems.push(`${file}:${index + 1}: hard-coded colour ${match[0]}`);
    });
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  console.error("\nUse a --vscode-* theme variable for interface colours, or webview/palette.ts for data colours.");
  process.exit(1);
}
console.log("No hard-coded interface colours.");
