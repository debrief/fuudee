import { mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addStore,
  CONFIG_VERSION,
  ConfigError,
  configPath,
  loadConfig,
  normaliseLocation,
  removeStore,
  sameLocation,
  timing,
  trackImportMode,
  updateConfig,
  withTrackImportMode,
} from "../src/index.js";

const vectors = join(__dirname, "../../../schemas/vectors");
const paths = JSON.parse(readFileSync(join(vectors, "config-paths.json"), "utf8")).cases as {
  name: string;
  platform: string;
  home: string;
  env: Record<string, string>;
  expected: string;
}[];
const locations = JSON.parse(readFileSync(join(vectors, "store-locations.json"), "utf8")) as {
  normalise: { platform: string; input: string; expected?: string; error?: boolean }[];
  same: { platform: string; a: string; b: string; expected: boolean }[];
};

describe("shared vectors", () => {
  it.each(paths.map((c) => [c.name, c] as const))("config path: %s", (_name, c) => {
    expect(configPath(c.env, c.platform, c.home)).toBe(c.expected);
  });
  it.each(locations.normalise.map((c) => [`${c.platform} ${c.input}`, c] as const))("normalise %s", (_n, c) => {
    if (c.error) expect(() => normaliseLocation(c.input, c.platform)).toThrow(/full path/);
    else expect(normaliseLocation(c.input, c.platform)).toBe(c.expected);
  });
  it.each(locations.same.map((c) => [`${c.platform} ${c.a}`, c] as const))("same location %s", (_n, c) => {
    expect(sameLocation(c.a, c.b, c.platform)).toBe(c.expected);
  });
});

const scratch = () => mkdtempSync(join(tmpdir(), "debrief-config-"));
const saved = { ...timing };
afterEach(() => Object.assign(timing, saved));

describe("reading and changing", () => {
  it("treats a missing file as an empty configuration", () => {
    expect(loadConfig(join(scratch(), "absent.json"))).toEqual({ config_version: 1, stores: [] });
  });

  it("adds and removes a store, leaving no temporary or lock file", () => {
    const dir = scratch();
    const file = join(dir, "nested", "config.json");
    const config = updateConfig((c) => addStore(c, { title: "Team exercises", location: join(dir, "cat") })[0], file);
    expect(config.stores[0].id).toBe("team-exercises");
    expect(loadConfig(file)).toEqual(config);
    expect(updateConfig((c) => removeStore(c, "team-exercises"), file).stores).toEqual([]);
    expect(readdirSync(join(dir, "nested"))).toEqual(["config.json"]);
  });

  it("gives distinct ids and does not list a location twice", () => {
    const dir = scratch();
    const [config, first] = addStore(loadConfig(join(dir, "c.json")), { title: "Exercise", location: join(dir, "a") });
    const [withSecond, second] = addStore(config, { title: "Exercise", location: join(dir, "b") });
    expect([first.id, second.id]).toEqual(["exercise", "exercise-2"]);
    const [again, existing] = addStore(withSecond, { title: "Other", location: `${join(dir, "a")}/` });
    expect(existing).toEqual(first);
    expect(again).toBe(withSecond);
  });

  it("keeps a change another process made meanwhile", () => {
    const file = join(scratch(), "config.json");
    updateConfig((c) => addStore(c, { title: "A", location: "/data/a" })[0], file);
    // Another process writes between our load and our change; updateConfig re-reads under the lock.
    const stale = loadConfig(file);
    updateConfig((c) => addStore(c, { title: "B", location: "/data/b" })[0], file);
    updateConfig((c) => addStore(c, { title: "C", location: "/data/c" })[0], file);
    expect(stale.stores).toHaveLength(1);
    expect(loadConfig(file).stores.map((s) => s.location)).toEqual(["/data/a", "/data/b", "/data/c"]);
  });

  it("times out on a held lock and clears a stale one", () => {
    const file = join(scratch(), "config.json");
    writeFileSync(`${file}.lock`, "12345\n");
    timing.lockWaitMs = 200;
    const change = (c: Parameters<typeof addStore>[0]) => addStore(c, { title: "X", location: "/x" })[0];
    expect(() => updateConfig(change, file)).toThrow(/Another Debrief process/);
    const old = (Date.now() - timing.lockStaleMs - 1000) / 1000;
    utimesSync(`${file}.lock`, old, old);
    expect(updateConfig(change, file).stores).toHaveLength(1);
  });

  it("refuses a newer configuration and never overwrites it", () => {
    const file = join(scratch(), "config.json");
    const original = JSON.stringify({ config_version: CONFIG_VERSION + 1, stores: [], future: true });
    writeFileSync(file, original);
    expect(() => loadConfig(file)).toThrow(/newer version of Debrief/);
    expect(() => updateConfig((c) => addStore(c, { title: "X", location: "/x" })[0], file)).toThrow(ConfigError);
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("tolerates a byte order mark", () => {
    const file = join(scratch(), "config.json");
    writeFileSync(file, "﻿" + JSON.stringify({ config_version: 1, stores: [] }));
    expect(loadConfig(file).stores).toEqual([]);
  });

  it.each([
    ["bad JSON", "{not json"],
    ["invalid", JSON.stringify({ config_version: 1, stores: [{ id: "x" }] })],
  ])("names the file when it is %s", (_name, content) => {
    const file = join(scratch(), "config.json");
    writeFileSync(file, content);
    expect(() => loadConfig(file)).toThrow(/config\.json/);
  });

  it("refuses a file with a store id used twice, as Python does", () => {
    const file = join(__dirname, "../../../schemas/fixtures/user_config/invalid/semantic/duplicate-store-id.json");
    expect(() => loadConfig(file)).toThrow(/used twice/);
  });

  it("writes the same bytes Python writes", () => {
    const fixture = join(__dirname, "../../../schemas/fixtures/user_config/valid/two-stores.json");
    const file = join(scratch(), "config.json");
    const config = loadConfig(fixture);
    updateConfig(() => config, file);
    expect(readFileSync(file, "utf8")).toBe(readFileSync(fixture, "utf8"));
  });
});

describe("the track import mode", () => {
  it("is ask until remembered, and clearing it asks again, as in Python", () => {
    const file = join(mkdtempSync(join(tmpdir(), "debrief-mode-")), "config.json");
    expect(trackImportMode(loadConfig(file))).toBe("ask");
    updateConfig((c) => withTrackImportMode(c, "otg"), file);
    expect(trackImportMode(loadConfig(file))).toBe("otg");
    // Remembered: version 2, which an earlier Debrief says to update for, rather than that the file is not valid.
    expect(JSON.parse(readFileSync(file, "utf8")).config_version).toBe(CONFIG_VERSION);
    updateConfig((c) => withTrackImportMode(c, "ask"), file);
    expect(trackImportMode(loadConfig(file))).toBe("ask");
    expect(JSON.parse(readFileSync(file, "utf8"))).not.toHaveProperty("track_import_mode");
    expect(JSON.parse(readFileSync(file, "utf8")).config_version).toBe(1);
    expect(() => withTrackImportMode(loadConfig(file), "sideways" as never)).toThrow(ConfigError);
  });
});
