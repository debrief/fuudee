// Generated from schemas/linkml/debrief.yaml via JSON Schema by ts/schemas/scripts/generate.mjs. Do not edit.
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AgentKindEnum".
 */
export type AgentKindEnum = "person" | "software_agent";
/**
 * Units an angle may be stored in (UCUM codes, SUB-02).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AngleUnitEnum".
 */
export type AngleUnitEnum = "deg" | "rad";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "LineStringTypeEnum".
 */
export type LineStringTypeEnum = "LineString";
/**
 * Debrief feature taxonomy, used by tools to declare what they apply to (TL-06).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "FeatureKindEnum".
 */
export type FeatureKindEnum = "track";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ProvActivityKindEnum".
 */
export type ProvActivityKindEnum = "import" | "tool" | "edit" | "delete";
/**
 * Units a speed may be stored in (UCUM codes, SUB-02).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SpeedUnitEnum".
 */
export type SpeedUnitEnum = "m/s" | "[kn_i]" | "km/h";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "FeatureTypeEnum".
 */
export type FeatureTypeEnum = "Feature";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "FeatureCollectionTypeEnum".
 */
export type FeatureCollectionTypeEnum = "FeatureCollection";

export interface DebriefSchemaDefinitions {}
/**
 * Who made a change; for software agents, which model (SUB-24).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AgentRef".
 */
export interface AgentRef {
  kind: AgentKindEnum;
  model?: string | null;
  name: string;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AngleSeries".
 */
export interface AngleSeries {
  unit: AngleUnitEnum;
  values: number[];
}
/**
 * The unit of analysis (SUB-05), stored as an asset of a STAC item.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "DebriefFeatureCollection".
 */
export interface DebriefFeatureCollection {
  features: TrackFeature[];
  provenance: ProvRecord[];
  schema_version: string;
  type: FeatureCollectionTypeEnum;
}
/**
 * A platform track as a GeoJSON Feature with LineString geometry.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackFeature".
 */
export interface TrackFeature {
  geometry: LineStringGeometry;
  id: string;
  properties: TrackProperties;
  type: FeatureTypeEnum;
}
/**
 * GeoJSON LineString (RFC 7946 section 3.1.4). Each position is [longitude, latitude] in WGS84 decimal degrees.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "LineStringGeometry".
 */
export interface LineStringGeometry {
  /**
   * @minItems 2
   */
  coordinates: [[number, number], [number, number], ...[number, number][]];
  type: LineStringTypeEnum;
}
/**
 * Per-position values are parallel arrays, one entry per geometry position, in the same order.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackProperties".
 */
export interface TrackProperties {
  /**
   * Course over ground at each position, true north, clockwise.
   */
  courses?: AngleSeries | null;
  kind: FeatureKindEnum;
  name: string;
  platform_class?: string | null;
  /**
   * Feature-level provenance where needed (SUB-18).
   */
  provenance?: ProvRecord[] | null;
  /**
   * Speed over ground at each position.
   */
  speeds?: SpeedSeries | null;
  times: string[];
}
/**
 * One recorded operation (SUB-18, SUB-19).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ProvRecord".
 */
export interface ProvRecord {
  agent: AgentRef;
  ended_at?: string | null;
  id: string;
  kind: ProvActivityKindEnum;
  /**
   * Free-text notes such as truncations or omitted content (EXT-14, EXT-15).
   */
  notes?: string[] | null;
  /**
   * Random seed, for operations that use randomness (SUB-20).
   */
  seed?: number | null;
  started_at: string;
  tool?: ToolRef | null;
  used?: SourceRef[] | null;
}
/**
 * The tool and version that performed an operation (SUB-24).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ToolRef".
 */
export interface ToolRef {
  name: string;
  version: string;
}
/**
 * An immutable source file read by an operation (SUB-10, SUB-11).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SourceRef".
 */
export interface SourceRef {
  content_hash: string;
  href: string;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SpeedSeries".
 */
export interface SpeedSeries {
  unit: SpeedUnitEnum;
  values: number[];
}
