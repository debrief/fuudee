// A panel is registered in many places by hand (review of 7 Nov 2026, finding 7): VS Code's
// package.json and the code that registers its views, the playground's panel table, its page and
// its host, the blog posts' demos, the walkthroughs and the guides. This check reads them all and
// fails, saying where, when one names a panel another does not have.
//
// The playground's panels are vscode/play/panels.mjs (PANELS); VS Code's are package.json's
// contributes.views. The two are the same panels, matched by name (a panel's tab title is its VS
// Code view's name), except those in ONE_HOST below.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PANELS, DEFAULT_GROUPS } from "../play/panels.mjs";

const here = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(here, "..");
const read = (file) => readFileSync(path.join(here, file), "utf8");
const filesIn = (folder, test) => readdirSync(folder, { recursive: true }).map(String).filter((f) => test.test(f)).map((f) => path.join(folder, f));
const rel = (file) => path.relative(repo, file);
const problems = [];
const problem = (where, what) => problems.push(`${where}: ${what}`);

/** A panel only one host has, and why; every other is in both, by the same name. */
const ONE_HOST = {
  // VS Code's walkthroughs are its Get Started page (contributes.walkthroughs), not a view.
  Walkthroughs: () => (manifest.contributes.walkthroughs?.length ? undefined : "package.json has no contributes.walkthroughs"),
};
/** The playground's panels always on the page, whatever a demo lists (host.ts: "Time, the Outline ... are always there"). */
const ALWAYS = new Set(["time", "outline"]);
const singular = (name) => name.toLowerCase().replace(/s$/, "");

// --- The playground: the panel table, the page and the host -----------------------------------
const playIds = PANELS.map((p) => p.id);
const page = read("play/index.html");
const pageIds = new Set([...page.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
const sections = [...page.matchAll(/<section class="(panel|menu-panel)" id="panel-([\w-]+)"/g)].map((m) => ({ kind: m[1], name: m[2] }));
for (const id of playIds) {
  if (!sections.some((s) => s.kind === "panel" && `panel-${s.name}` === id)) problem("vscode/play/index.html", `no <section class="panel" id="${id}"> for ${id} in play/panels.mjs`);
  if (!DEFAULT_GROUPS.some((g) => g.panels.includes(id))) problem("vscode/play/panels.mjs", `${id} is in no group of DEFAULT_GROUPS, the default layout`);
}
for (const s of sections) if (s.kind === "panel" && !playIds.includes(`panel-${s.name}`)) problem("vscode/play/index.html", `section panel-${s.name} is not in PANELS (vscode/play/panels.mjs)`);
for (const id of DEFAULT_GROUPS.flatMap((g) => g.panels)) if (!playIds.includes(id)) problem("vscode/play/panels.mjs", `DEFAULT_GROUPS names ${id}, not in PANELS`);

// The names a demo may list (?panels=...): host.ts's OPTIONAL, and its default list.
const host = read("play/host.ts");
const listOf = (pattern, what) => {
  const m = host.match(pattern);
  if (!m) return problem("vscode/play/host.ts", `${what} not found; has it moved? (scripts/check-panels.mjs reads it)`), [];
  return m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
};
const optional = listOf(/const OPTIONAL = \[([^\]]*)\]/, "const OPTIONAL = [...]");
const byDefault = listOf(/params\.get\("panels"\) \?\? "([^"]*)"/, 'the default panels, params.get("panels") ?? "..."');
for (const name of optional) if (!sections.some((s) => s.name === name)) problem("vscode/play/host.ts", `OPTIONAL names "${name}", but play/index.html has no section panel-${name}`);
for (const id of playIds) {
  const name = id.replace(/^panel-/, "");
  if (!ALWAYS.has(name) && !optional.includes(name)) problem("vscode/play/host.ts", `${id} is not in OPTIONAL, so a demo cannot choose it (or add it to ALWAYS in scripts/check-panels.mjs)`);
}
if ([...optional].sort().join() !== [...byDefault].sort().join()) problem("vscode/play/host.ts", `the default panels (${byDefault.join(",")}) are not OPTIONAL's (${optional.join(",")})`);

// --- The blog's demos: data-demo="?panels=..." and data-page="..." -------------------------------
const docs = path.join(repo, "site", "docs");
const posts = filesIn(docs, /\.(md|html)$/).filter((f) => !/^(play|demo)\b/.test(path.relative(docs, f)));
let demos = 0;
for (const file of posts) {
  readFileSync(file, "utf8").split("\n").forEach((line, index) => {
    for (const m of line.matchAll(/data-demo="([^"]*)"/g)) {
      demos++;
      const params = new URLSearchParams(m[1].replace(/^\?/, ""));
      for (const name of params.get("panels")?.split(",") ?? []) {
        if (!optional.includes(name)) problem(`${rel(file)}:${index + 1}`, `data-demo names panel "${name}", not one the playground has (${optional.join(", ")})`);
      }
    }
    for (const m of line.matchAll(/data-page="([^"]*)"/g)) {
      if (!filesIn(path.join(here, "play"), /\.html$/).some((f) => path.basename(f) === m[1])) problem(`${rel(file)}:${index + 1}`, `data-page "${m[1]}" is not a page in vscode/play`);
    }
  });
}

// --- VS Code: package.json's views, registered in the code, and named where they are used -------
const manifest = JSON.parse(read("package.json"));
const containers = new Set(Object.values(manifest.contributes.viewsContainers ?? {}).flat().map((c) => c.id));
const views = Object.entries(manifest.contributes.views ?? {}).flatMap(([container, list]) => {
  if (!containers.has(container) && !["explorer", "scm", "debug", "test"].includes(container)) problem("vscode/package.json", `views are in container "${container}", which viewsContainers does not declare`);
  return list.map((v) => ({ ...v, container }));
});
const viewIds = new Set(views.map((v) => v.id));
const sources = filesIn(path.join(here, "src"), /\.ts$/).map((f) => ({ file: f, text: readFileSync(f, "utf8") }));
const constants = new Map(sources.flatMap(({ text }) => [...text.matchAll(/export const (\w+) = "([\w.]+)"/g)].map((m) => [m[1], m[2]])));
const registered = new Set(
  sources.flatMap(({ text }) =>
    [...text.matchAll(/\b(?:registerView|registerWebviewViewProvider|createTreeView|registerTreeDataProvider)\(\s*(?:"([\w.]+)"|(\w+))/g)].map((m) => m[1] ?? constants.get(m[2])),
  ),
);
const retainedText = read("src/panels/webviewhost.ts").match(/export const RETAIN_CONTEXT_WHEN_HIDDEN[^{]*\{([^}]*)\}/)?.[1] ?? "";
const retained = new Set([...retainedText.matchAll(/"([\w.]+)":\s*(true|false)/g)].map((m) => m[1]));
for (const view of views) {
  if (!registered.has(view.id)) problem("vscode/src", `view ${view.id} (package.json) is never registered: no registerView, createTreeView or registerTreeDataProvider for it`);
  if (view.type === "webview" && !retained.has(view.id)) problem("vscode/src/panels/webviewhost.ts", `webview view ${view.id} has no entry in RETAIN_CONTEXT_WHEN_HIDDEN: decide whether its page is kept while hidden`);
}
for (const id of registered) if (id && !viewIds.has(id)) problem("vscode/src", `${id} is registered as a view, but package.json's contributes.views does not have it`);
// Where a view is named: "view": in viewsWelcome, view == / focusedView == in when clauses, and
// debrief.<view>.focus commands, in package.json, the walkthroughs and the code.
const tours = read("walkthroughs/tours.json");
const naming = [{ file: "vscode/package.json", text: read("package.json") }, { file: "vscode/walkthroughs/tours.json", text: tours }, ...sources.map((s) => ({ file: rel(s.file), text: s.text }))];
let named = 0;
for (const { file, text } of naming) {
  text.split("\n").forEach((line, index) => {
    for (const m of line.matchAll(/"view":\s*"([\w.]+)"|\b(?:view|focusedView)\s*===?\s*'?(debrief\.\w+)|\b(debrief\.\w+)\.focus\b/g)) {
      named++;
      const id = m[1] ?? m[2] ?? m[3];
      if (!viewIds.has(id)) problem(`${file}:${index + 1}`, `names view ${id}, which package.json's contributes.views does not have`);
    }
  });
}

// --- The two hosts: the same panels, by name --------------------------------------------------
const vscodeNames = new Map(views.map((v) => [singular(v.name), v.id]));
for (const { id, title } of PANELS) {
  if (title in ONE_HOST) {
    const why = ONE_HOST[title]();
    if (why) problem("vscode/package.json", `${title}: ${why}`);
  } else if (!vscodeNames.has(singular(title))) problem("vscode/package.json", `the playground's ${title} (${id}) has no VS Code view named "${title}" in contributes.views`);
}
for (const view of views) {
  if (!PANELS.some((p) => singular(p.title) === singular(view.name))) problem("vscode/play/panels.mjs", `VS Code's view ${view.id} ("${view.name}") has no playground panel titled "${view.name}" in PANELS`);
}

// --- The walkthroughs: what a step's button shows in the playground -----------------------------
for (const tour of JSON.parse(tours).tours) {
  for (const step of tour.steps) {
    for (const m of (step.play?.action ?? "").matchAll(/\bfocus:([\w-]+)/g)) {
      if (!pageIds.has(m[1])) problem("vscode/walkthroughs/tours.json", `${tour.id}.${step.id}: focus:${m[1]}, but play/index.html has no element with id "${m[1]}"`);
    }
  }
}

// --- The guides: the browser layout's list of panels -------------------------------------------
const layoutGuide = "site/docs/guides/interaction-models/browser-layout.md";
const listed = readFileSync(path.join(repo, layoutGuide), "utf8").match(/\*\*Panels\.\*\* ([^.]*), listed once in `vscode\/play\/panels\.mjs`/)?.[1];
if (!listed) problem(layoutGuide, "its **Panels.** item, naming every panel and \"listed once in `vscode/play/panels.mjs`\", is missing or reworded");
else {
  const names = listed.split(/, | and /).map(singular);
  for (const { title } of PANELS) if (!names.includes(singular(title))) problem(layoutGuide, `**Panels.** does not name ${title}`);
  for (const name of names) if (!PANELS.some((p) => singular(p.title) === name)) problem(layoutGuide, `**Panels.** names "${name}", not a panel in PANELS`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\nThe panels are not registered alike everywhere (${problems.length} found). Adding or renaming a panel: docs/engineering.md, "Add a panel".`);
  process.exit(1);
}
console.log(`Panels agree: ${PANELS.length} in the playground, ${views.length} VS Code views, ${demos} demos in ${posts.length} pages, ${named} places naming a view, the walkthroughs and the browser layout guide.`);
