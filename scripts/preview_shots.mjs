// Screenshots the pages a pull request changes, for its description.
//
//   node scripts/preview_shots.mjs <built site> <out folder> <changed files...>
//
// Changed files are repository paths. Pages under site/docs are found through
// the pages.json the site build writes (site/hooks/page_map.py); a change only
// elsewhere in the site (theme, playground, config) shows the home page.
// Writes PNGs and shots.json, [{source, url, title, file}], to the out folder.
// Playwright is loaded from PLAYWRIGHT_DIR, so the repository needs no copy.
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const [site, out, ...changed] = process.argv.slice(2);
const { chromium } = createRequire(join(process.env.PLAYWRIGHT_DIR ?? process.cwd(), "/"))("playwright");
const MAX_PAGES = 6;
const WIDTH = 1280;
const MAX_HEIGHT = 2400;

const pages = JSON.parse(readFileSync(join(site, "pages.json"), "utf8"));
const sources = changed
  .filter((path) => path.startsWith("site/docs/") && path.endsWith(".md"))
  .map((path) => path.slice("site/docs/".length))
  .filter((source) => source in pages);
if (!sources.length) sources.push("index.md");

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".wasm": "application/wasm" };
const server = createServer((request, response) => {
  let path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(site, path);
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, colorScheme: "light" });
const shots = [];
for (const source of sources.slice(0, MAX_PAGES)) {
  const url = pages[source];
  await page.goto(base + url, { waitUntil: "networkidle" });
  const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), MAX_HEIGHT);
  const file = `${source.replace(/\.md$/, "").replace(/[^A-Za-z0-9]+/g, "-")}.png`;
  await page.screenshot({ path: join(out, file), fullPage: true, clip: { x: 0, y: 0, width: WIDTH, height } });
  shots.push({ source, url, title: (await page.title()).replace(/ - Debrief v4$/, ""), file });
}
await browser.close();
server.close();
writeFileSync(join(out, "shots.json"), JSON.stringify({ shots, more: Math.max(0, sources.length - MAX_PAGES) }, null, 1));
console.log(`Screenshot ${shots.length} page(s): ${shots.map((s) => s.source).join(", ")}`);
