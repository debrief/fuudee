/**
 * Debrief per-user configuration: the stores an analyst knows about (SEC-06).
 *
 * The same file the Python services read, found by the same rules
 * (schemas/vectors/config-paths.json) and validated against the same schema.
 * The duplicate-id rule is Python's (PRN-03); addStore never creates one.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, openSync, fsyncSync, closeSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseDocument, serialiseDocument, type KnownStore, type UserConfig } from "@debrief/schemas";

/** The newest configuration layout this build understands. Matches Python's CONFIG_VERSION. */
export const CONFIG_VERSION = 1;
const FILE_NAME = "config.json";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Where this user's configuration lives. DEBRIEF_CONFIG overrides the default. */
export function configPath(
  env: Record<string, string | undefined> = process.env,
  platform: string = process.platform,
  home: string = homedir(),
): string {
  const p = platform === "win32" ? path.win32 : path.posix;
  if (env.DEBRIEF_CONFIG) return p.normalize(env.DEBRIEF_CONFIG);
  if (platform === "win32") {
    return p.join(env.APPDATA || p.join(home, "AppData", "Roaming"), "Debrief", FILE_NAME);
  }
  if (platform === "darwin") return p.join(home, "Library", "Application Support", "Debrief", FILE_NAME);
  const xdg = env.XDG_CONFIG_HOME ?? "";
  return p.join(p.isAbsolute(xdg) ? xdg : p.join(home, ".config"), "debrief", FILE_NAME);
}

function checkVersion(text: string, file: string): void {
  let version: unknown;
  try {
    version = (JSON.parse(text) as { config_version?: unknown }).config_version;
  } catch {
    return; // validation reports it
  }
  if (typeof version === "number" && version > CONFIG_VERSION) {
    throw new ConfigError(
      `${file} was written by a newer version of Debrief (configuration version ${version}; ` +
        `this version understands ${CONFIG_VERSION}). Update Debrief, or point DEBRIEF_CONFIG at another file.`,
    );
  }
}

/** The user's configuration. A missing file is an empty configuration. */
export function loadConfig(file: string = configPath()): UserConfig {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { config_version: CONFIG_VERSION, stores: [] };
    throw e;
  }
  checkVersion(text, file);
  try {
    return parseDocument("user_config", text);
  } catch (e) {
    throw new ConfigError(`${file} is not a valid Debrief configuration: ${(e as Error).message}`);
  }
}

/** Write the configuration atomically. Never overwrites a newer Debrief's file. */
export function saveConfig(config: UserConfig, file: string = configPath()): void {
  if (existsSync(file)) checkVersion(readFileSync(file, "utf8"), file);
  const text = serialiseDocument("user_config", config); // validates
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    const handle = openSync(temporary, "w");
    try {
      writeFileSync(handle, text, "utf8");
      fsyncSync(handle);
    } finally {
      closeSync(handle);
    }
    renameSync(temporary, file);
  } catch (e) {
    rmSync(temporary, { force: true });
    throw e;
  }
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
  protection_level?: string;
  read_only?: boolean;
}

/**
 * A copy of the configuration with one more file store, and that store. The id
 * comes from the title. A store already listed at the same location is returned
 * unchanged rather than added twice.
 */
export function addStore(config: UserConfig, store: NewStore): [UserConfig, KnownStore] {
  const location = path.resolve(store.location);
  const existing = config.stores.find((s) => s.location === location);
  if (existing) return [config, existing];
  const added: KnownStore = {
    id: storeId(store.title, new Set(config.stores.map((s) => s.id))),
    title: store.title,
    kind: "file",
    location,
    ...(store.protection_level !== undefined && { protection_level: store.protection_level }),
    ...(store.read_only !== undefined && { read_only: store.read_only }),
  };
  return [{ ...config, stores: [...config.stores, added] }, added];
}

/** A copy of the configuration without the named store. The store's files are untouched. */
export function removeStore(config: UserConfig, id: string): UserConfig {
  if (!config.stores.some((s) => s.id === id)) throw new ConfigError(`No store with id "${id}"`);
  return { ...config, stores: config.stores.filter((s) => s.id !== id) };
}
