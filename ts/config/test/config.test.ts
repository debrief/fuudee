import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addStore, CONFIG_VERSION, ConfigError, configPath, loadConfig, removeStore, saveConfig } from "../src/index.js";

interface PathCase {
  name: string;
  platform: string;
  home: string;
  env: Record<string, string>;
  expected: string;
}
const vectors = JSON.parse(
  readFileSync(join(__dirname, "../../../schemas/vectors/config-paths.json"), "utf8"),
).cases as PathCase[];

describe("configPath matches the shared vectors", () => {
  it.each(vectors.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(configPath(c.env, c.platform, c.home)).toBe(c.expected);
  });
});

const scratch = () => mkdtempSync(join(tmpdir(), "debrief-config-"));

describe("reading and writing", () => {
  it("treats a missing file as an empty configuration", () => {
    expect(loadConfig(join(scratch(), "absent.json"))).toEqual({ config_version: CONFIG_VERSION, stores: [] });
  });

  it("adds, saves, loads and removes a store", () => {
    const dir = scratch();
    const file = join(dir, "nested", "config.json");
    const [config, store] = addStore(loadConfig(file), {
      title: "Team exercises",
      location: join(dir, "cat"),
      protection_level: "OFFICIAL",
    });
    expect(store.id).toBe("team-exercises");
    saveConfig(config, file);
    expect(loadConfig(file)).toEqual(config);
    expect(removeStore(config, "team-exercises").stores).toEqual([]);
    expect(readdirSync(join(dir, "nested")).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("gives distinct ids and does not list a location twice", () => {
    const dir = scratch();
    let [config, first] = addStore(loadConfig(join(dir, "c.json")), { title: "Exercise", location: join(dir, "a") });
    const [withSecond, second] = addStore(config, { title: "Exercise", location: join(dir, "b") });
    expect([first.id, second.id]).toEqual(["exercise", "exercise-2"]);
    const [again, existing] = addStore(withSecond, { title: "Other", location: join(dir, "a") });
    expect(existing).toEqual(first);
    expect(again).toBe(withSecond);
  });

  it("refuses a newer configuration and never overwrites it", () => {
    const file = join(scratch(), "config.json");
    const original = JSON.stringify({ config_version: CONFIG_VERSION + 1, stores: [], future: true });
    writeFileSync(file, original);
    expect(() => loadConfig(file)).toThrow(/newer version of Debrief/);
    expect(() => saveConfig({ config_version: CONFIG_VERSION, stores: [] }, file)).toThrow(ConfigError);
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("names the file when it is invalid", () => {
    const file = join(scratch(), "config.json");
    writeFileSync(file, JSON.stringify({ config_version: 1, stores: [{ id: "x" }] }));
    expect(() => loadConfig(file)).toThrow(/config\.json is not a valid Debrief configuration/);
  });

  it("reads the shared example configuration", () => {
    const fixture = join(__dirname, "../../../schemas/fixtures/user_config/valid/two-stores.json");
    expect(loadConfig(fixture).stores.map((s) => s.id)).toEqual(["my-analysis", "team-exercises"]);
  });
});
