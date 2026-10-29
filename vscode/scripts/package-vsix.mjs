// Packages Debrief as a VSIX for one platform, with its Python bundled (DEP-01, DEP-02):
//
//   npm run package:vsix -- --target linux-x64                 # vsix/debrief-linux-x64-<version>.vsix
//   npm run package:vsix -- --target linux-x64 --keep-python   # reuse python/ if it is for linux-x64
//
// The target defaults to this machine's. vsce runs vscode:prepublish, the production build;
// .vscodeignore says what goes in. Nothing here publishes to the Marketplace.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extension = path.resolve(here, "..");
const at = process.argv.indexOf("--target");
const target = at > 0 ? process.argv[at + 1] : `${process.platform}-${process.arch}`;
const { version } = JSON.parse(readFileSync(path.join(extension, "package.json"), "utf8"));

function run(command, args) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", cwd: extension });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const marker = path.join(extension, "python", "debrief-bundle.json");
const bundledFor = () => (existsSync(marker) ? JSON.parse(readFileSync(marker, "utf8")).target : undefined);
if (!(process.argv.includes("--keep-python") && bundledFor() === target)) {
  run(process.execPath, [path.join(here, "bundle-python.mjs"), "--target", target]);
}
if (bundledFor() !== target) throw new Error(`python/ is for ${bundledFor() ?? "no platform"}, not ${target}.`);

// The repository's licence, in the VSIX beside the extension.
copyFileSync(path.join(extension, "..", "LICENSE"), path.join(extension, "LICENSE"));

const require = createRequire(import.meta.url);
const vsce = path.join(path.dirname(require.resolve("@vscode/vsce/package.json")), "vsce");
const out = path.join(extension, "vsix", `debrief-${target}-${version}.vsix`);
mkdirSync(path.dirname(out), { recursive: true });
run(process.execPath, [vsce, "package", "--target", target, "--no-dependencies", "--out", out]);
console.log(`${path.relative(extension, out)}: ${(statSync(out).size / 1048576).toFixed(1)} MB`);
