/**
 * Debrief data-file schema for TypeScript: generated types plus validation
 * against the same JSON Schema the Python side uses.
 *
 * Only structural validation lives here. Rules LinkML cannot express, such as
 * parallel arrays matching the geometry, are checked in Python (PRN-03).
 */
import Ajv2019 from "ajv/dist/2019.js";
import schema from "./generated/debrief.schema.json" with { type: "json" };
import type { DebriefFeatureCollection } from "./generated/debrief.js";
import { SCHEMA_VERSION } from "./generated/schemaVersion.js";

export * from "./generated/debrief.js";
export { SCHEMA_VERSION };

export class SchemaVersionError extends Error {
  constructor(
    readonly found: string | undefined,
    readonly supported: string = SCHEMA_VERSION,
  ) {
    super(
      found === undefined
        ? "The file does not record a data-file schema version."
        : compareVersions(found, supported) > 0
          ? `This plot needs data-file schema ${found}; this version of Debrief supports up to ${supported}. Update Debrief to open it.`
          : `This plot uses data-file schema ${found}, which this version of Debrief cannot migrate. It supports ${supported}.`,
    );
    this.name = "SchemaVersionError";
  }
}

export class PlotValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("; "));
    this.name = "PlotValidationError";
  }
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a)?.slice(1).map(Number) ?? [];
  const pb = SEMVER.exec(b)?.slice(1).map(Number) ?? [];
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const validate = new Ajv2019.default({ allErrors: true, strict: false }).compile(schema);

/** Validate a parsed plot document. Never returns a partially valid plot (SUB-14). */
export function validatePlot(document: unknown): DebriefFeatureCollection {
  const found =
    typeof document === "object" && document !== null
      ? (document as { schema_version?: unknown }).schema_version
      : undefined;
  if (typeof found !== "string") throw new SchemaVersionError(undefined);
  if (!SEMVER.test(found)) {
    throw new PlotValidationError([`schema_version "${found}" is not a semantic version`]);
  }
  // Before 1.0.0 there is no migration guarantee (SUB-13), so only an exact match opens.
  if (compareVersions(found, SCHEMA_VERSION) !== 0) throw new SchemaVersionError(found);

  if (!validate(document)) {
    throw new PlotValidationError(
      (validate.errors ?? []).map((e) => `${e.instancePath || "<root>"}: ${e.message}`),
    );
  }
  return document as unknown as DebriefFeatureCollection;
}

export function parsePlot(text: string): DebriefFeatureCollection {
  return validatePlot(JSON.parse(text));
}

export function serialisePlot(plot: DebriefFeatureCollection): string {
  validatePlot(plot as unknown);
  return JSON.stringify(plot, null, 2) + "\n";
}
