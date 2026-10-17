// DEV-10: words an analyst reads use the glossary's terms. The "Not" column of the
// language guide's term table is the list of words to avoid; this check finds them
// in the extension's user-facing text: package.json titles and descriptions, and
// string literals in the extension and webviews.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const guide = readFileSync("../site/docs/guides/style-guide/language.md", "utf8");
const rows = guide.split("## Terms")[1].split("##")[0].split("\n").filter((l) => /^\| [a-z]/.test(l));
// "file" and "function" are too general to ban outright: "Import REP file" is right.
const GENERAL = new Set(["file", "function", "input file", "raw file", "heading", "record", "row", "point"]);
const avoid = rows.flatMap((row) => {
  const [write, not] = row.split("|").slice(1, 3).map((c) => c.trim());
  return not.split(",").map((w) => w.trim()).filter((w) => w && !GENERAL.has(w)).map((w) => ({ w, write }));
});

const texts = [];
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const walk = (value, where) => {
  if (typeof value === "string") texts.push({ where, text: value });
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, `${where}.${k}`);
};
for (const key of ["displayName", "description"]) walk(manifest[key], `package.json ${key}`);
for (const part of ["viewsContainers", "views", "viewsWelcome", "walkthroughs", "commands", "configuration"]) {
  walk(manifest.contributes[part], `package.json ${part}`);
}
// The walkthroughs' one source, the playground's words included (CAP-25).
walk(JSON.parse(readFileSync("walkthroughs/tours.json", "utf8")).tours, "walkthroughs/tours.json");
// The extension and webviews; of the playground, which plays the part of VS Code, its walkthroughs panel.
const sources = [...["src", "webview"].flatMap((folder) => readdirSync(folder, { recursive: true }).map((name) => path.join(folder, String(name)))), "play/tours.ts"];
for (const file of sources) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  readFileSync(file, "utf8").split("\n").forEach((line, index) => {
    if (/^\s*(\/\/|\*|\/\*|import )/.test(line) || line.includes("// not user-facing")) return;
    for (const m of line.matchAll(/"([^"\n]*)"|`([^`\n]*)`|>([^<>{}\n]+)</g)) {
      texts.push({ where: `${file}:${index + 1}`, text: m[1] ?? m[2] ?? m[3] });
    }
  });
}

const problems = [];
for (const { where, text } of texts) {
  if (!/\s/.test(text.trim()) && !/^[A-Z]/.test(text)) continue; // identifiers, not prose
  for (const { w, write } of avoid) {
    if (new RegExp(`\\b${w}s?\\b`, "i").test(text)) problems.push(`${where}: "${text}" uses "${w}"; write "${write}"`);
  }
  if (/\b(color|analyze|behavior|center)\b/i.test(text)) problems.push(`${where}: "${text}" is not British English`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Checked ${texts.length} pieces of text against ${avoid.length} terms to avoid.`);
