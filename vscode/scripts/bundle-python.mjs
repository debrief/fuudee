// Puts a Python for one platform into vscode/python, for its VSIX: a relocatable CPython
// (python-build-standalone, the release and checksums pinned in python-runtime.json) with
// Debrief's Python packages and their dependencies installed in it, the versions uv.lock
// pins, hash-checked. Nothing is fetched when the analyst installs or first runs Debrief.
//
//   node scripts/bundle-python.mjs --target linux-x64
//
// Targets: win32-x64, linux-x64, linux-arm64, darwin-arm64, darwin-x64. Wheels are chosen
// for the target, so any target can be bundled on any machine; the release workflow bundles
// each on its own platform so it can be tried there. Downloads are kept in .python-cache
// (or DEBRIEF_PYTHON_CACHE) and checked against the pinned sha256 every time.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extension = path.resolve(here, "..");
const repo = path.resolve(extension, "..");
const manifest = JSON.parse(readFileSync(path.join(extension, "python-runtime.json"), "utf8"));

const arg = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const target = arg("target") ?? `${process.platform}-${process.arch}`;
const spec = manifest.targets[target];
if (!spec) {
  console.error(`No Python is pinned for ${target}; python-runtime.json has ${Object.keys(manifest.targets).join(", ")}.`);
  process.exit(1);
}
const windows = target.startsWith("win32");
const minor = manifest.python.split(".").slice(0, 2).join(".");
const out = path.join(extension, "python");
const cache = path.resolve(process.env.DEBRIEF_PYTHON_CACHE || path.join(extension, ".python-cache"));
const work = path.join(cache, `work-${target}`);

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
  return result;
}
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

// --- The interpreter --------------------------------------------------------------------
mkdirSync(cache, { recursive: true });
const url = manifest.url.replaceAll("{release}", manifest.release).replaceAll("{python}", manifest.python).replaceAll("{triple}", spec.triple);
const archiveName = decodeURIComponent(url.split("/").pop());
const archive = path.join(cache, archiveName);
if (!existsSync(archive) || sha256(archive) !== spec.sha256) {
  rmSync(archive, { force: true });
  run("curl", ["-fsSL", "--retry", "3", "-o", archiveName, url], { cwd: cache });
}
const got = sha256(archive);
if (got !== spec.sha256) {
  rmSync(archive, { force: true });
  throw new Error(`${archiveName} has sha256 ${got}, not the pinned ${spec.sha256}.`);
}
console.log(`${archiveName}: sha256 matches python-runtime.json`);

rmSync(out, { recursive: true, force: true });
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
// Relative names and a working folder: GNU tar on Windows reads "C:" as a remote host.
run("tar", ["-xzf", path.relative(extension, archive).split(path.sep).join("/")], { cwd: extension });
if (!existsSync(out)) throw new Error(`${archiveName} did not hold a python folder.`);

const lib = windows ? path.join(out, "Lib") : path.join(out, "lib", `python${minor}`);
const site = path.join(lib, "site-packages");

// What Debrief never uses: Tcl/Tk and IDLE, the test suite, headers, static libraries, pip.
const prune = [
  "include", "share", "libs", "tcl", "Scripts",
  ...["test", "idlelib", "tkinter", "turtledemo", "ensurepip", "lib2to3", "pydoc_data"].map((m) => path.relative(out, path.join(lib, m))),
  ...["_tkinter.pyd", "tcl86t.dll", "tk86t.dll"].map((f) => path.join("DLLs", f)),
];
for (const name of prune) rmSync(path.join(out, name), { recursive: true, force: true });
if (!windows) {
  for (const name of readdirSync(path.join(out, "lib"))) {
    if (/^(tcl|tk|itcl|thread|tdbc|sqlite)\d|^libtcl|^libtk|^pkgconfig$|\.a$/.test(name)) rmSync(path.join(out, "lib", name), { recursive: true, force: true });
  }
  // On Linux the interpreter is linked statically; libpython is only for embedding Python.
  if (target.startsWith("linux")) for (const name of readdirSync(path.join(out, "lib"))) if (name.startsWith("libpython")) rmSync(path.join(out, "lib", name));
  // Only the interpreter itself: pip's, IDLE's and 2to3's scripts have nothing to run.
  for (const name of readdirSync(path.join(out, "bin"))) if (name !== `python${minor}`) rmSync(path.join(out, "bin", name), { force: true });
  for (const name of readdirSync(lib)) if (name.startsWith("config-")) rmSync(path.join(lib, name), { recursive: true, force: true });
  for (const name of readdirSync(path.join(lib, "lib-dynload"))) if (name.startsWith("_tkinter")) rmSync(path.join(lib, "lib-dynload", name));
}
for (const name of readdirSync(site)) if (/^pip($|-)/.test(name)) rmSync(path.join(site, name), { recursive: true, force: true });

// --- Debrief's packages -------------------------------------------------------------------
// The third-party ones as uv.lock pins them, each wheel checked against the lock's hashes.
const requirements = path.join(work, "requirements.txt");
run("uv", ["export", "--frozen", "--no-dev", "--all-packages", "--no-emit-workspace", "--format", "requirements-txt", "--quiet", "-o", requirements], { cwd: repo });
const install = ["pip", "install", "--quiet", "--target", site, "--python-platform", spec.triple, "--python-version", minor, "--only-binary", ":all:", "--no-deps", "--no-cache"];
// For macOS, wheels for the oldest macOS the target supports (python-runtime.json's macos).
const wheelEnv = { ...process.env, ...(spec.macos ? { MACOSX_DEPLOYMENT_TARGET: spec.macos } : {}) };
run("uv", [...install, "--require-hashes", "-r", requirements], { cwd: repo, env: wheelEnv });
// Debrief's own, built as wheels from this checkout.
const wheels = path.join(work, "wheels");
run("uv", ["build", "--all-packages", "--wheel", "--quiet", "-o", wheels], { cwd: repo });
run("uv", [...install, ...readdirSync(wheels).filter((w) => w.endsWith(".whl")).map((w) => path.join(wheels, w))], { cwd: repo, env: wheelEnv });

// What the packages carry that never runs: their tests, scripts and caches.
function sweep(folder) {
  for (const name of readdirSync(folder)) {
    const full = path.join(folder, name);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (!stat.isDirectory()) continue;
    if (name === "tests" || name === "__pycache__") rmSync(full, { recursive: true, force: true });
    else sweep(full);
  }
}
rmSync(path.join(site, "bin"), { recursive: true, force: true });
// olefile's Python 2 module, which Python 3 cannot even compile.
rmSync(path.join(site, "olefile", "olefile2.py"), { force: true });
sweep(lib);

// A VSIX is a zip and holds no symbolic links: keep the real files and drop the links. The
// extension starts the interpreter by its real name (src/runtime.ts).
function unlink(folder) {
  for (const name of readdirSync(folder)) {
    const full = path.join(folder, name);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) rmSync(full);
    else if (stat.isDirectory()) unlink(full);
  }
}
unlink(out);

// --- Compiled once, here --------------------------------------------------------------------
// Unchecked-hash .pyc files stay valid however the VSIX's dates are unpacked, so the first
// start does not compile, and nothing needs writing into the extension's folder.
const interpreter = windows ? path.join(out, "python.exe") : path.join(out, "bin", `python${minor}`);
const native = target === `${process.platform}-${process.arch}`;
let compiler = interpreter;
if (!native) {
  const found = spawnSync("uv", ["python", "find", minor], { encoding: "utf8", cwd: repo });
  compiler = found.stdout.trim();
  if (found.status !== 0 || !compiler) throw new Error(`Bundling for ${target} here needs a Python ${minor} to compile with: uv python install ${minor}`);
}
run(compiler, ["-I", "-m", "compileall", "-q", "-j", "0", "--invalidation-mode", "unchecked-hash", lib]);

if (native) {
  // It runs, finds Debrief's packages, and only those of its own folder.
  run(interpreter, ["-I", "-c", "import sys, debrief_tools, debrief_sample, numpy, pyproj, pydantic; assert all(p.startswith(sys.prefix) for p in sys.path if p), sys.path; print('Bundled', sys.version.split()[0], 'for', sys.platform)"]);
}
rmSync(work, { recursive: true, force: true });
// Which platform this is for, so a VSIX is never packaged with another platform's Python.
writeFileSync(path.join(out, "debrief-bundle.json"), `${JSON.stringify({ target, python: manifest.python, release: manifest.release, triple: spec.triple }, null, 1)}\n`);

let files = 0;
let bytes = 0;
(function count(folder) {
  for (const name of readdirSync(folder)) {
    const full = path.join(folder, name);
    const stat = lstatSync(full);
    if (stat.isDirectory()) count(full);
    else {
      files += 1;
      bytes += stat.size;
    }
  }
})(out);
console.log(`python/ for ${target}: Python ${manifest.python} (${manifest.release}), ${files} files, ${(bytes / 1048576).toFixed(1)} MB`);
