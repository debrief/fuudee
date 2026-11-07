// Older files open only through registered migrations (SUB-13, SUB-14), as in Python
// (python/debrief-schemas/tests/test_migrations.py). The registry is empty, so these tests
// register a migration of their own, from a version before the current one, and take it away.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MIGRATION_AGENT,
  MIGRATIONS,
  parseDocument,
  parsePlot,
  registerMigration,
  SCHEMA_VERSION,
  SchemaVersionError,
  serialisePlot,
  type DebriefFeatureCollection,
  type MigrateFunction,
} from "../src/index.js";

const fixtures = join(__dirname, "../../../schemas/fixtures");
const fixture = (kind: string, name: string) =>
  JSON.parse(readFileSync(join(fixtures, kind, "valid", `${name}.json`), "utf8")) as Record<string, any>;

const OLDER = "0.0.0"; // before every version Debrief has had
const MIDDLE = "0.0.1"; // between it and the current version
const same: MigrateFunction = (_kind, document) => document;

/** A test-only migration: at OLDER a track's name was called its title. */
const titleToName: MigrateFunction = (kind, document) => {
  expect(kind).toBe("plot");
  for (const feature of document.features as Array<{ properties: Record<string, unknown> }>) {
    const props = feature.properties;
    if (props.kind === "track" && "title" in props) {
      props.name = props.title;
      delete props.title;
    }
  }
  return document;
};

function olderTrack() {
  const plot = fixture("plot", "minimal-track");
  plot.schema_version = OLDER;
  const props = plot.features[0].properties;
  props.title = props.name;
  delete props.name;
  return plot;
}

const undo: Array<() => void> = [];
const register = (...args: Parameters<typeof registerMigration>) => undo.push(registerMigration(...args));
afterEach(() => {
  while (undo.length) undo.pop()!();
  expect(MIGRATIONS.size).toBe(0);
});

describe("migrations", () => {
  it("starts with none registered, so only the current version opens", () => {
    expect(MIGRATIONS.size).toBe(0);
    expect(SCHEMA_VERSION).not.toBe(OLDER);
  });

  it("opens an older file with a migration, recording it in provenance", () => {
    register(OLDER, SCHEMA_VERSION, titleToName, "a track's title is its name");
    const older = olderTrack();
    const given = structuredClone(older);

    const plot = parsePlot(JSON.stringify(older));

    expect(older).toEqual(given);
    expect(plot.schema_version).toBe(SCHEMA_VERSION);
    expect(plot.features[0].properties).toMatchObject({ name: "NELSON" });
    const record = plot.provenance.at(-1)!;
    expect(record.kind).toBe("migration");
    expect(record.agent).toEqual({ kind: "software_agent", name: MIGRATION_AGENT });
    expect(record.notes).toEqual([`Data-file schema ${OLDER} to ${SCHEMA_VERSION}: a track's title is its name`]);
    expect(record.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Written out, it is a file of the current version.
    expect(JSON.parse(serialisePlot(plot)).schema_version).toBe(SCHEMA_VERSION);
  });

  it("follows a chain of migrations, recording each", () => {
    register(OLDER, MIDDLE, titleToName, "a track's title is its name");
    register(MIDDLE, SCHEMA_VERSION, same, "nothing else");
    const plot = parsePlot(JSON.stringify(olderTrack()));
    expect(plot.provenance.map((r) => r.notes![0].split(":")[0])).toEqual([
      `Data-file schema ${OLDER} to ${MIDDLE}`,
      `Data-file schema ${MIDDLE} to ${SCHEMA_VERSION}`,
    ]);
  });

  it("opens an older STAC item with a migration at the current version", () => {
    register(OLDER, SCHEMA_VERSION, same, "nothing changed");
    const item = fixture("stac_item", "serial-item");
    item.properties["debrief:schema_version"] = OLDER;
    const loaded = parseDocument("stac_item", JSON.stringify(item));
    expect(loaded.properties["debrief:schema_version"]).toBe(SCHEMA_VERSION);
  });

  it("refuses an older file without a migration, naming its version", () => {
    const text = JSON.stringify(olderTrack());
    expect(() => parsePlot(text)).toThrow(SchemaVersionError);
    expect(() => parsePlot(text)).toThrow(new RegExp(`schema ${OLDER}, which .* cannot migrate`));
  });

  it("refuses a chain stopping short of the current version", () => {
    register(OLDER, MIDDLE, titleToName, "a track's title is its name");
    expect(() => parsePlot(JSON.stringify(olderTrack()))).toThrow(new RegExp(OLDER.replace(/\./g, "\\.")));
  });

  it("refuses a newer file whatever is registered", () => {
    register(OLDER, SCHEMA_VERSION, same, "nothing changed");
    const plot = fixture("plot", "minimal-track");
    plot.schema_version = "99.0.0";
    expect(() => parsePlot(JSON.stringify(plot))).toThrow(/needs data-file schema 99\.0\.0/);
  });

  it("never migrates when writing", () => {
    register(OLDER, SCHEMA_VERSION, same, "nothing changed");
    const plot = { ...fixture("plot", "minimal-track"), schema_version: OLDER } as DebriefFeatureCollection;
    expect(() => serialisePlot(plot)).toThrow(SchemaVersionError);
  });

  it.each([
    ["0.0.2", "0.0.1", /goes forward/],
    ["0.0.1", "0.0.1", /goes forward/],
    ["0.0.1", "x", /not a semantic version/],
  ])("refuses a migration from %s to %s", (from, to, why) => {
    expect(() => registerMigration(from, to, same, "note")).toThrow(why);
  });

  it("takes one migration from each version", () => {
    register("0.0.1", "0.0.2", same, "note");
    expect(() => registerMigration("0.0.1", "0.0.3", same, "note")).toThrow(/already registered/);
  });
});
