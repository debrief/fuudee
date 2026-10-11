/**
 * Debrief data-file schema for TypeScript: generated types plus validation
 * against the same JSON Schema the Python side uses.
 *
 * Only structural validation lives here. Rules LinkML cannot express, such as
 * parallel arrays matching the geometry, are checked in Python (PRN-03).
 */
import Ajv2019 from "ajv/dist/2019.js";
import type { ValidateFunction } from "ajv";
import schema from "./generated/debrief.schema.json" with { type: "json" };
import type {
  DebriefFeatureCollection,
  FormatSettings,
  SharedState,
  StacCatalog,
  StacItem,
  ToolDeclaration,
  ToolResult,
  UserConfig,
} from "./generated/debrief.js";
import { SCHEMA_VERSION } from "./generated/schemaVersion.js";

export * from "./generated/debrief.js";
export { SCHEMA_VERSION };

/** The documents Debrief reads and writes, and the type each one validates to. */
export interface DocumentTypes {
  plot: DebriefFeatureCollection;
  stac_item: StacItem;
  stac_catalog: StacCatalog;
  tool_declaration: ToolDeclaration;
  tool_result: ToolResult;
  shared_state: SharedState;
  format_settings: FormatSettings;
  user_config: UserConfig;
}
export type DocumentKind = keyof DocumentTypes;

const ROOT_CLASS: Record<DocumentKind, string> = {
  plot: "DebriefFeatureCollection",
  stac_item: "StacItem",
  stac_catalog: "StacCatalog",
  tool_declaration: "ToolDeclaration",
  tool_result: "ToolResult",
  shared_state: "SharedState",
  format_settings: "FormatSettings",
  user_config: "UserConfig",
};

export const DOCUMENT_KINDS = Object.keys(ROOT_CLASS) as DocumentKind[];

export class SchemaVersionError extends Error {
  constructor(
    readonly found: string | undefined,
    readonly supported: string = SCHEMA_VERSION,
  ) {
    super(
      found === undefined
        ? "The file does not record a data-file schema version."
        : compareVersions(found, supported) > 0
          ? `This file needs data-file schema ${found}; this version of Debrief supports up to ${supported}. Update Debrief to open it.`
          : `This file uses data-file schema ${found}, which this version of Debrief cannot migrate. It supports ${supported}.`,
    );
    this.name = "SchemaVersionError";
  }
}

export class DocumentValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("; "));
    this.name = "DocumentValidationError";
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

function recordedVersion(kind: DocumentKind, document: unknown): unknown {
  if (typeof document !== "object" || document === null) return undefined;
  const record = document as Record<string, unknown>;
  switch (kind) {
    case "plot":
      return record.schema_version;
    case "stac_item": {
      const properties = record.properties;
      return typeof properties === "object" && properties !== null
        ? (properties as Record<string, unknown>)["debrief:schema_version"]
        : undefined;
    }
    case "stac_catalog":
      return record["debrief:schema_version"];
    default:
      return null; // messages, not files: no version
  }
}

function checkVersion(kind: DocumentKind, document: unknown): void {
  const found = recordedVersion(kind, document);
  if (found === null) return;
  if (typeof found !== "string") throw new SchemaVersionError(undefined);
  if (!SEMVER.test(found)) {
    throw new DocumentValidationError([`schema version "${found}" is not a semantic version`]);
  }
  // Before 1.0.0 there is no migration guarantee (SUB-13), so only an exact match opens.
  if (compareVersions(found, SCHEMA_VERSION) !== 0) throw new SchemaVersionError(found);
}

const ajv = new Ajv2019.default({ allErrors: true, strict: false });
ajv.addSchema(schema, "debrief");
const validators = new Map<DocumentKind, ValidateFunction>();

function validatorFor(kind: DocumentKind): ValidateFunction {
  let validate = validators.get(kind);
  if (!validate) {
    validate = ajv.compile({ $ref: `debrief#/$defs/${ROOT_CLASS[kind]}` });
    validators.set(kind, validate);
  }
  return validate;
}

/** Validate a parsed document. Never returns a partially valid one (SUB-14). */
export function validateDocument<K extends DocumentKind>(
  kind: K,
  document: unknown,
): DocumentTypes[K] {
  checkVersion(kind, document);
  const validate = validatorFor(kind);
  if (!validate(document)) {
    throw new DocumentValidationError(
      (validate.errors ?? []).map((e) => `${e.instancePath || "<root>"}: ${e.message}`),
    );
  }
  return document as DocumentTypes[K];
}

export function parseDocument<K extends DocumentKind>(kind: K, text: string): DocumentTypes[K] {
  return validateDocument(kind, JSON.parse(text));
}

export function serialiseDocument<K extends DocumentKind>(
  kind: K,
  document: DocumentTypes[K],
): string {
  validateDocument(kind, document as unknown);
  return JSON.stringify(document, null, 2) + "\n";
}

export function validatePlot(document: unknown): DebriefFeatureCollection {
  return validateDocument("plot", document);
}

export function parsePlot(text: string): DebriefFeatureCollection {
  return parseDocument("plot", text);
}

export function serialisePlot(plot: DebriefFeatureCollection): string {
  return serialiseDocument("plot", plot);
}
