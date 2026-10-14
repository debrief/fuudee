/**
 * Debrief per-user configuration: the stores an analyst knows about (SEC-06).
 *
 * The same file the Python services read and change (python/debrief-config),
 * found, normalised and locked by the same rules, held to the shared vectors
 * in schemas/vectors/. Every change goes through updateConfig: take the lock
 * beside the file, re-read it, apply the change, write a temporary file and
 * rename it over the original, so a change made meanwhile by another process
 * is kept, not overwritten.
 */
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseDocument, serialiseDocument, type KnownStore, type UserConfig } from "@debrief/schemas";

/** The newest configuration layout this build understands. Matches Python's CONFIG_VERSION: 1, the stores; 2, also track_import_mode. */
export const CONFIG_VERSION = 2;
/** The layout a file needs: 1 while it holds only stores, so an earlier Debrief still reads it; 2 once it remembers how tracks imported are plotted. As debrief_config. */
export const STORES_VERSION = 1;
export const IMPORT_MODE_VERSION = 2;
const FILE_NAME = "config.json";
export const timing = { lockWaitMs: 5000, lockStaleMs: 30000, replaceWaitMs: 2000 };

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const flavour = (platform: string) => (platform === "win32" ? path.win32 : path.posix);

/** Lexical normalisation only: never touches the filesystem. */
function normalise(location: string, platform: string): string {
  const p = flavour(platform);
  let normal = p.normalize(location);
  const root = p.parse(normal).root;
  while (normal.length > root.length && normal.endsWith(p.sep)) normal = normal.slice(0, -1);
  return normal;
}

/**
 * Where this user's configuration lives. DEBRIEF_CONFIG overrides the default.
 * On Windows this is the roaming profile.
 */
export function configPath(
  env: Record<string, string | undefined> = process.env,
  platform: string = process.platform,
  home: string = homedir(),
): string {
  const p = flavour(platform);
  if (env.DEBRIEF_CONFIG) return normalise(env.DEBRIEF_CONFIG, platform);
  if (platform === "win32") {
    return p.join(env.APPDATA || p.join(home, "AppData", "Roaming"), "Debrief", FILE_NAME);
  }
  if (platform === "darwin") return p.join(home, "Library", "Application Support", "Debrief", FILE_NAME);
  const xdg = env.XDG_CONFIG_HOME ?? "";
  return p.join(p.isAbsolute(xdg) ? xdg : p.join(home, ".config"), "debrief", FILE_NAME);
}

/** The form a store location is stored in. It must already be absolute. */
export function normaliseLocation(location: string, platform: string = process.platform): string {
  const p = flavour(platform);
  // On Windows a full path names a drive or a share: "\\Data" and "C:Data" are relative to something.
  const full = p.isAbsolute(location) && (platform !== "win32" || p.parse(p.normalize(location)).root.length >= 3);
  if (!full) throw new ConfigError(`A store location must be a full path; "${location}" is not`);
  return normalise(location, platform);
}

/** Whether two stored locations name the same folder. Windows paths ignore case. */
export function sameLocation(a: string, b: string, platform: string = process.platform): boolean {
  return platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

const empty = (): UserConfig => ({ config_version: STORES_VERSION, stores: [] });

function read(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8").replace(/^﻿/, ""); // tolerate the BOM Notepad writes
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new ConfigError(`Cannot read ${file}: ${(e as Error).message}`);
  }
}

function parse(text: string, file: string): UserConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ConfigError(`${file} is not a valid Debrief configuration: ${(e as Error).message}`);
  }
  const version = (raw as { config_version?: unknown } | null)?.config_version;
  if (Number.isInteger(version) && (version as number) > CONFIG_VERSION) {
    throw new ConfigError(
      `${file} was written by a newer version of Debrief (configuration version ${version}; ` +
        `this version understands ${CONFIG_VERSION}). Update Debrief, or point DEBRIEF_CONFIG at another file.`,
    );
  }
  let config: UserConfig;
  try {
    config = parseDocument("user_config", text);
  } catch (e) {
    throw new ConfigError(`${file} is not a valid Debrief configuration: ${(e as Error).message}`);
  }
  // Python's validation rejects these too; checked here so removeStore can never take two.
  const ids = config.stores.map((s) => s.id);
  const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
  if (repeated !== undefined) {
    throw new ConfigError(`${file} is not a valid Debrief configuration: store id "${repeated}" is used twice`);
  }
  return config;
}

/** The user's configuration. A missing file is an empty configuration. */
export function loadConfig(file: string = configPath()): UserConfig {
  const text = read(file);
  return text === undefined ? empty() : parse(text, file);
}

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The advisory lock shared with Python: a file created exclusively beside the config. */
function withLock<T>(file: string, body: () => T): T {
  const lock = `${file}.lock`;
  mkdirSync(path.dirname(file), { recursive: true });
  const deadline = Date.now() + timing.lockWaitMs;
  for (;;) {
    try {
      const handle = openSync(lock, "wx", 0o600);
      writeSync(handle, `${process.pid}\n`);
      closeSync(handle);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new ConfigError(`Cannot lock ${file}: ${(e as Error).message}`);
      }
      try {
        if (Date.now() - statSync(lock).mtimeMs > timing.lockStaleMs) {
          rmSync(lock, { force: true }); // left by a process that died
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() > deadline) {
        throw new ConfigError(`Another Debrief process is changing ${file}. Try again in a moment.`);
      }
      sleep(50);
    }
  }
  try {
    return body();
  } finally {
    rmSync(lock, { force: true });
  }
}

const IN_USE = new Set(["EPERM", "EACCES", "EBUSY"]);

/** Rename over the original, retrying while Windows reports it in use. */
function replace(temporary: string, file: string): void {
  const deadline = Date.now() + timing.replaceWaitMs;
  for (;;) {
    try {
      renameSync(temporary, file);
      return;
    } catch (e) {
      if (!IN_USE.has((e as NodeJS.ErrnoException).code ?? "") || Date.now() > deadline) throw e;
      sleep(50);
    }
  }
}

function write(config: UserConfig, file: string): void {
  const text = serialiseDocument("user_config", config); // validates
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    const handle = openSync(temporary, "wx", 0o600);
    try {
      writeSync(handle, text);
      fsyncSync(handle);
    } finally {
      closeSync(handle);
    }
    replace(temporary, file);
  } catch (e) {
    rmSync(temporary, { force: true });
    throw new ConfigError(`Cannot write ${file}: ${(e as Error).message}`);
  }
  if (process.platform !== "win32") {
    const directory = openSync(path.dirname(file), "r"); // make the rename itself durable
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
}

/**
 * Apply a change to the configuration on disk and return the result. The file
 * is re-read under the lock; a file from a newer Debrief is never overwritten.
 */
export function updateConfig(change: (config: UserConfig) => UserConfig, file: string = configPath()): UserConfig {
  return withLock(file, () => {
    const text = read(file);
    const current = text === undefined ? empty() : parse(text, file);
    const changed = change(current);
    if (JSON.stringify(changed) !== JSON.stringify(current)) write(changed, file);
    return changed;
  });
}

function storeId(title: string, taken: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || "store";
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}

export interface NewStore {
  title: string;
  location: string;
  read_only?: boolean;
}

/**
 * A copy of the configuration with one more file store, and that store. The id
 * comes from the title. A store already listed at the same location is returned
 * unchanged rather than added twice.
 */
export function addStore(
  config: UserConfig,
  store: NewStore,
  platform: string = process.platform,
): [UserConfig, KnownStore] {
  const location = normaliseLocation(store.location, platform);
  const existing = config.stores.find((s) => sameLocation(s.location, location, platform));
  if (existing) return [config, existing];
  const added: KnownStore = {
    id: storeId(store.title, new Set(config.stores.map((s) => s.id))),
    title: store.title,
    kind: "file",
    location,
    ...(store.read_only !== undefined && { read_only: store.read_only }),
  };
  return [{ ...config, stores: [...config.stores, added] }, added];
}

/** A copy of the configuration without the named store. The store's files are untouched. */
export function removeStore(config: UserConfig, id: string): UserConfig {
  if (!config.stores.some((s) => s.id === id)) throw new ConfigError(`No store with id "${id}"`);
  return { ...config, stores: config.stores.filter((s) => s.id !== id) };
}

/** How tracks imported are plotted (CAP-01): ask for each track, or the one choice remembered for future imports. User state, kept here, never in a catalogue or a plot file. */
export type TrackImportMode = "ask" | "otg" | "dr";
export const TRACK_IMPORT_MODES: readonly TrackImportMode[] = ["ask", "otg", "dr"];

/** "ask" (the default, also when not set), "otg" or "dr". As debrief_config.track_import_mode. */
export function trackImportMode(config: UserConfig): TrackImportMode {
  return (config.track_import_mode as TrackImportMode | undefined | null) ?? "ask";
}

/** A copy of the configuration remembering mode for future imports; "ask" clears it. As debrief_config.with_track_import_mode. */
export function withTrackImportMode(config: UserConfig, mode: TrackImportMode): UserConfig {
  if (!TRACK_IMPORT_MODES.includes(mode)) throw new ConfigError(`"${mode}" is not a track import mode: ask, otg or dr`);
  const rest = { ...config };
  delete rest.track_import_mode;
  // Remembered, version 2, so an earlier Debrief says to update rather than that the file is not valid; cleared, 1 again.
  if (mode === "ask") return { ...rest, config_version: config.config_version <= IMPORT_MODE_VERSION ? STORES_VERSION : config.config_version };
  return { ...rest, config_version: Math.max(config.config_version, IMPORT_MODE_VERSION), track_import_mode: mode as UserConfig["track_import_mode"] };
}
