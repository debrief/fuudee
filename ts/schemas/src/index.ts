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
  WebviewMessage,
  Delta,
  HistoryHead,
  ProvRecord,
} from "./generated/debrief.js";
import { SCHEMA_VERSION } from "./generated/schemaVersion.js";

export * from "./generated/debrief.js";
export { SCHEMA_VERSION };

/** A webview message's kind (CON-08). */
export type MessageKind = WebviewMessage["kind"];
/** The webview message of one kind, or of several: the union narrowed to them. */
export type MessageOf<K extends MessageKind> = Extract<WebviewMessage, { kind: K }>;
/** Every webview message kind, in the schema's order. */
export const MESSAGE_KINDS = schema.$defs.WebviewMessageKindEnum.enum as MessageKind[];

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
  webview_message: WebviewMessage;
  delta: Delta;
  history_head: HistoryHead;
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
  webview_message: "WebviewMessage",
  delta: "Delta",
  history_head: "HistoryHead",
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
    case "delta":
    case "history_head":
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
  // Only the current version is read; an older file is first brought to it by the registered
  // migrations, if any lead there (see migrated). Before 1.0.0 there is no migration guarantee
  // (SUB-13) and none is registered.
  if (compareVersions(found, SCHEMA_VERSION) !== 0) throw new SchemaVersionError(found);
}

// --- Migrations between schema versions (SUB-13) --------------------------------------------
//
// The same registry as Python's (debrief_schemas.migrations): a file of an older version opens
// only if a chain of registered migrations leads from its version to the current one, and is
// refused otherwise, its version named. It starts empty. Each migration applied to a plot is
// recorded in its provenance as an activity of kind "migration". TypeScript reads a plot's
// content without its history (vscode/src/catalogue.ts), so the history step Python adds for
// the migration is Python's alone.

/** A file's JSON at one version, given its kind, returned at the next. It may change what it is given. */
export type MigrateFunction = (kind: DocumentKind, document: Record<string, unknown>) => Record<string, unknown>;

/** One step: a file at fromVersion brought to toVersion, and what changed. */
export interface Migration {
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly migrate: MigrateFunction;
  readonly note: string;
}

/** The software agent named in a migration's provenance record. */
export const MIGRATION_AGENT = "@debrief/schemas";

/** Registered migrations, by the version they start from. Empty: none yet. */
export const MIGRATIONS = new Map<string, Migration>();

/** Register a step from one version to a later one; returns a function taking it away again. */
export function registerMigration(
  fromVersion: string,
  toVersion: string,
  migrate: MigrateFunction,
  note: string,
): () => void {
  if (!SEMVER.test(fromVersion) || !SEMVER.test(toVersion)) {
    throw new Error(`"${fromVersion}" to "${toVersion}": not a semantic version`);
  }
  if (compareVersions(toVersion, fromVersion) <= 0) {
    throw new Error(`a migration goes forward, not from ${fromVersion} to ${toVersion}`);
  }
  if (MIGRATIONS.has(fromVersion)) throw new Error(`a migration from ${fromVersion} is already registered`);
  if (!note.trim()) throw new Error("a migration says what it changed");
  const migration: Migration = { fromVersion, toVersion, migrate, note };
  MIGRATIONS.set(fromVersion, migration);
  return () => {
    if (MIGRATIONS.get(fromVersion) === migration) MIGRATIONS.delete(fromVersion);
  };
}

/** The migrations leading from found to current, in order, or undefined if none do. */
export function migrationChain(found: string, current: string = SCHEMA_VERSION): Migration[] | undefined {
  const steps: Migration[] = [];
  let version = found;
  while (version !== current) {
    const step = MIGRATIONS.get(version);
    if (!step || compareVersions(step.toVersion, current) > 0) return undefined;
    steps.push(step);
    version = step.toVersion;
  }
  return steps;
}

/** The provenance record of one migration applied (a ProvRecord). */
export function migrationRecord(step: Migration, at: string): ProvRecord {
  return {
    id: `migration-${step.fromVersion}-to-${step.toVersion}-${at}`,
    kind: "migration",
    started_at: at,
    ended_at: at,
    agent: { kind: "software_agent", name: MIGRATION_AGENT },
    notes: [`Data-file schema ${step.fromVersion} to ${step.toVersion}: ${step.note}`],
  };
}

function setVersion(kind: DocumentKind, document: Record<string, unknown>, version: string): void {
  if (kind === "stac_item") (document.properties as Record<string, unknown>)["debrief:schema_version"] = version;
  else if (kind === "stac_catalog") document["debrief:schema_version"] = version;
  else document.schema_version = version;
}

/**
 * A file of an older schema version brought to the current one by the registered migrations,
 * or the document as given when it needs none. Refuses an older version no chain leads from,
 * naming it. The document given is never changed.
 */
function migrated(kind: DocumentKind, document: unknown): unknown {
  const found = recordedVersion(kind, document);
  if (typeof found !== "string" || !SEMVER.test(found) || compareVersions(found, SCHEMA_VERSION) >= 0) {
    return document; // checkVersion says what is wrong, if anything
  }
  const steps = migrationChain(found);
  if (!steps) throw new SchemaVersionError(found);
  let current = structuredClone(document) as Record<string, unknown>;
  const records: ProvRecord[] = [];
  for (const step of steps) {
    current = step.migrate(kind, current);
    setVersion(kind, current, step.toVersion);
    records.push(migrationRecord(step, new Date().toISOString()));
  }
  if (kind === "plot") {
    const provenance = Array.isArray(current.provenance) ? current.provenance : [];
    current.provenance = [...provenance, ...records];
  }
  return current;
}

// discriminator: a union told apart by a member (WebviewMessage, by kind) is checked against the
// one class its value names, so the problems are that class's; Python's validation does the same.
const ajv = new Ajv2019.default({ allErrors: true, strict: false, discriminator: true });
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

/**
 * Validate a parsed document. Never returns a partially valid one (SUB-14). A file of an older
 * schema version is migrated first, when registered migrations lead from its version to the
 * current one, and refused otherwise (SUB-13); the document returned is then a migrated copy.
 */
export function validateDocument<K extends DocumentKind>(
  kind: K,
  document: unknown,
): DocumentTypes[K] {
  return checked(kind, migrated(kind, document));
}

function checked<K extends DocumentKind>(kind: K, document: unknown): DocumentTypes[K] {
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

/** Serialise a document, validated first. Writing never migrates: only the current version is written. */
export function serialiseDocument<K extends DocumentKind>(
  kind: K,
  document: DocumentTypes[K],
): string {
  checked(kind, document as unknown);
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
