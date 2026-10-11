// Generated from schemas/linkml/debrief.yaml via JSON Schema by ts/schemas/scripts/generate.mjs. Do not edit.
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AgentKindEnum".
 */
export type AgentKindEnum = "person" | "software_agent";
/**
 * Units an angle may be stored in (UCUM codes).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AngleUnitEnum".
 */
export type AngleUnitEnum = "deg" | "rad";
/**
 * Units an angular rate may be stored in (UCUM codes). Degrees per minute is the analysts' standard for bearing rate.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AngularRateUnitEnum".
 */
export type AngularRateUnitEnum = "deg/min" | "deg/s" | "rad/s";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PointTypeEnum".
 */
export type PointTypeEnum = "Point";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "LineStringTypeEnum".
 */
export type LineStringTypeEnum = "LineString";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PolygonTypeEnum".
 */
export type PolygonTypeEnum = "Polygon";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AnnotationKindEnum".
 */
export type AnnotationKindEnum = "annotation";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ProvActivityKindEnum".
 */
export type ProvActivityKindEnum = "import" | "tool" | "edit" | "delete" | "migration";
/**
 * Units a length may be stored in (UCUM codes).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "LengthUnitEnum".
 */
export type LengthUnitEnum = "m" | "km" | "[nmi_i]" | "[yd_i]" | "[ft_i]";
/**
 * Units a speed may be stored in (UCUM codes).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SpeedUnitEnum".
 */
export type SpeedUnitEnum = "m/s" | "[kn_i]" | "km/h";
/**
 * Units a duration may be stored in (UCUM codes).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "DurationUnitEnum".
 */
export type DurationUnitEnum = "ms" | "s" | "min" | "h";
/**
 * What an annotation depicts (CAP-03, CAP-04).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AnnotationStyleEnum".
 */
export type AnnotationStyleEnum = "label" | "shape" | "chart_furniture" | "note" | "time_period";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "FeatureTypeEnum".
 */
export type FeatureTypeEnum = "Feature";
/**
 * What an asset holds in Debrief terms.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AssetKindEnum".
 */
export type AssetKindEnum = "plot" | "source" | "supporting_file" | "payload" | "result" | "measure_group";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "CatalogTypeEnum".
 */
export type CatalogTypeEnum = "Catalog";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackKindEnum".
 */
export type TrackKindEnum = "track";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SensorObservationsKindEnum".
 */
export type SensorObservationsKindEnum = "sensor_observations";
/**
 * Sensor observation types Debrief imports (CAP-22). Frequency is never imported.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ObservationTypeEnum".
 */
export type ObservationTypeEnum = "bearing" | "ambiguous_bearing";
/**
 * Physical quantity kinds that carry units (SUB-02).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "QuantityKindEnum".
 */
export type QuantityKindEnum = "length" | "speed" | "angle" | "duration" | "angular_rate";
/**
 * Standard formats for opaque payloads (CON-02).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PayloadFormatEnum".
 */
export type PayloadFormatEnum = "arrow" | "parquet" | "geojson";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "FeatureCollectionTypeEnum".
 */
export type FeatureCollectionTypeEnum = "FeatureCollection";
/**
 * The feature taxonomy (TL-06).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "FeatureKindEnum".
 */
export type FeatureKindEnum = "track" | "annotation" | "sensor_observations";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PositionNotationEnum".
 */
export type PositionNotationEnum = "dd" | "dm" | "dms";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TimeStyleEnum".
 */
export type TimeStyleEnum = "time" | "date_time" | "dtg";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ItemTypeEnum".
 */
export type ItemTypeEnum = "Feature";
/**
 * How a store is reached. Only static file catalogues so far (SUB-15).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "StoreKindEnum".
 */
export type StoreKindEnum = "file";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ResultPresentationEnum".
 */
export type ResultPresentationEnum = "number" | "table" | "graph";
/**
 * Parameter kinds Debrief can build a form for (TL-07).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ParameterKindEnum".
 */
export type ParameterKindEnum = "number" | "integer" | "string" | "boolean" | "choice" | "quantity" | "time";
/**
 * What a tool may return (TL-11).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ToolOutputKindEnum".
 */
export type ToolOutputKindEnum =
  "new_features" | "modified_features" | "deleted_features" | "non_spatial" | "named_sets" | "state_change";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "WebviewMessageKindEnum".
 */
export type WebviewMessageKindEnum =
  | "ready"
  | "show_plot"
  | "set_selection"
  | "selection_changed"
  | "viewport_changed"
  | "show_form"
  | "run_tool"
  | "cancel"
  | "form_busy"
  | "form_error"
  | "show_results";

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
 * via the `definition` "Angle".
 */
export interface Angle {
  unit: AngleUnitEnum;
  value: number;
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
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AngularRate".
 */
export interface AngularRate {
  unit: AngularRateUnitEnum;
  value: number;
}
/**
 * Shapes, labels and chart furniture as ordinary GeoJSON (CAP-03). An annotation with only a time has null geometry and shall give a time or a time range (CAP-04).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AnnotationFeature".
 */
export interface AnnotationFeature {
  geometry?: PointGeometry | LineStringGeometry | PolygonGeometry | null;
  id: string;
  properties: AnnotationProperties;
  type: FeatureTypeEnum;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PointGeometry".
 */
export interface PointGeometry {
  /**
   * @minItems 2
   * @maxItems 2
   */
  coordinates: [number, number];
  type: PointTypeEnum;
}
/**
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
 * Linear rings; the first is the exterior. Each ring is closed (first position equals last).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PolygonGeometry".
 */
export interface PolygonGeometry {
  /**
   * @minItems 1
   */
  coordinates: [
    [[number, number], [number, number], [number, number], [number, number], ...[number, number][]],
    ...[[number, number], [number, number], [number, number], [number, number], ...[number, number][]][]
  ];
  type: PolygonTypeEnum;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AnnotationProperties".
 */
export interface AnnotationProperties {
  kind: AnnotationKindEnum;
  name: string;
  provenance?: ProvRecord[] | null;
  style: AnnotationStyleEnum;
  text?: string | null;
  time?: string | null;
  time_range?: TimeRange | null;
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
   * Parameter values the operation ran with, so replay can repeat it (SUB-19).
   */
  parameters?: ParameterValue[] | null;
  /**
   * Random seed, for operations that use randomness (SUB-20).
   */
  seed?: number | null;
  /**
   * Ids of the features the operation was applied to, in selection order, so replay can repeat it (SUB-19).
   */
  selected?: string[] | null;
  started_at: string;
  tool?: ToolRef | null;
  used?: SourceRef[] | null;
}
/**
 * A tool parameter value as supplied or recorded (TL-07, SUB-19). Scalars, or a quantity with its unit.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ParameterValue".
 */
export interface ParameterValue {
  name: string;
  value: number | string | boolean | Length | Speed | Angle | Duration | AngularRate;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "Length".
 */
export interface Length {
  unit: LengthUnitEnum;
  value: number;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "Speed".
 */
export interface Speed {
  unit: SpeedUnitEnum;
  value: number;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "Duration".
 */
export interface Duration {
  unit: DurationUnitEnum;
  value: number;
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
 * A closed interval of time. Start shall not be after end.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TimeRange".
 */
export interface TimeRange {
  end: string;
  start: string;
}
/**
 * The unit of analysis (SUB-05), stored as an asset of a STAC item.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "DebriefFeatureCollection".
 */
export interface DebriefFeatureCollection {
  features: (TrackFeature | AnnotationFeature | SensorObservationsFeature)[];
  named_sets?: NamedSet[] | null;
  provenance: ProvRecord[];
  schema_version: string;
  type: FeatureCollectionTypeEnum;
}
/**
 * A platform track. Per-position values are parallel arrays matching the geometry.
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
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackProperties".
 */
export interface TrackProperties {
  /**
   * Course over ground at each position, true north, clockwise.
   */
  courses?: AngleSeries | null;
  /**
   * Depth below the sea surface at each position, positive down. Absent where depth is not known.
   */
  depths?: LengthSeries | null;
  kind: TrackKindEnum;
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
  style?: TrackStyle | null;
  /**
   * One per position, non-decreasing.
   */
  times: string[];
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "LengthSeries".
 */
export interface LengthSeries {
  unit: LengthUnitEnum;
  values: number[];
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SpeedSeries".
 */
export interface SpeedSeries {
  unit: SpeedUnitEnum;
  values: number[];
}
/**
 * How a track is drawn. Data colours do not change with the theme (DEV-07). Presentation only: changes are undoable but not recorded in provenance (SUB-22).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackStyle".
 */
export interface TrackStyle {
  /**
   * Lower-case hex RGB, for example "#e01c3e".
   */
  colour: string;
  /**
   * The REP symbology code the colour came from, such as "@C", kept for export.
   */
  legacy_symbology?: string | null;
}
/**
 * A set of sensor observations, such as weeks of bearings, held as an opaque payload (CON-02, NFR-06). Geometry is null; positions come from the host track at each observation time.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SensorObservationsFeature".
 */
export interface SensorObservationsFeature {
  /**
   * Always null.
   */
  geometry?: PointGeometry | null;
  id: string;
  properties: SensorObservationsProperties;
  type: FeatureTypeEnum;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SensorObservationsProperties".
 */
export interface SensorObservationsProperties {
  /**
   * The track carrying the sensor.
   */
  host_track_id: string;
  kind: SensorObservationsKindEnum;
  name: string;
  observation_count: number;
  observation_type: ObservationTypeEnum;
  payload: PayloadRef;
  provenance?: ProvRecord[] | null;
  sensor_name: string;
  time_range: TimeRange;
}
/**
 * Envelope for data LinkML expresses badly (CON-02): the payload's format, a versioned reference to its inner schema, units, CRS and time reference.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PayloadRef".
 */
export interface PayloadRef {
  columns: PayloadColumn[];
  content_hash: string;
  /**
   * Coordinate reference system of any positions in the payload.
   */
  crs: string;
  format: PayloadFormatEnum;
  /**
   * Path relative to the referencing file.
   */
  href: string;
  inner_schema: InnerSchemaRef;
  /**
   * Time scale of any times in the payload. Always UTC (SUB-01).
   */
  time_reference: string;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PayloadColumn".
 */
export interface PayloadColumn {
  name: string;
  quantity_kind?: QuantityKindEnum | null;
  /**
   * UCUM unit code, required when quantity_kind is given.
   */
  unit?: string | null;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "InnerSchemaRef".
 */
export interface InnerSchemaRef {
  name: string;
  version: string;
}
/**
 * A saved, reusable selection (TL-11).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "NamedSet".
 */
export interface NamedSet {
  feature_ids: string[];
  id: string;
  name: string;
}
/**
 * One recorded change to a plot.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "Delta".
 */
export interface Delta {
  added?: (TrackFeature | AnnotationFeature | SensorObservationsFeature)[] | null;
  /**
   * The delta this one was applied on top of (0 for the first). Replay follows these links, and recovery uses them to finish a change that was written but not completed.
   */
  after: number;
  deleted_ids?: string[] | null;
  deleted_named_set_ids?: string[] | null;
  /**
   * Features changed, in full, replacing those with the same id.
   */
  modified?: (TrackFeature | AnnotationFeature | SensorObservationsFeature)[] | null;
  /**
   * Named sets added or replaced, by id.
   */
  named_sets?: NamedSet[] | null;
  /**
   * The operation that made the change. Usually one; a baseline delta, taken when a plot made before history existed is first changed, carries all the plot's earlier records.
   */
  records: ProvRecord[];
  /**
   * Content hash of the plot file after this delta, to check replay.
   */
  result_hash: string;
  schema_version: string;
  /**
   * Position in the plot's history, from 1, with no gaps.
   */
  seq: number;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "FormatSettings".
 */
export interface FormatSettings {
  angle_decimals: number;
  duration_decimals: number;
  duration_unit: DurationUnitEnum;
  length_decimals: number;
  length_unit: LengthUnitEnum;
  position_decimals: number;
  position_notation: PositionNotationEnum;
  show_milliseconds: boolean;
  speed_decimals: number;
  speed_unit: SpeedUnitEnum;
  time_style: TimeStyleEnum;
  /**
   * IANA time zone for display, or UTC for Zulu time (SUB-01).
   */
  time_zone: string;
}
/**
 * Where a plot's history stands. Written after each delta, before the plot.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "HistoryHead".
 */
export interface HistoryHead {
  /**
   * Deltas undone and then superseded by a new change (SUB-19).
   */
  abandoned?: number[] | null;
  /**
   * Sequence number of the last delta the plot reflects; 0 for none.
   */
  current: number;
  /**
   * Highest sequence number written.
   */
  latest: number;
  /**
   * Content hash the plot file has when it reflects current.
   */
  plot_hash: string;
  schema_version: string;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "KnownStore".
 */
export interface KnownStore {
  /**
   * Unique within this file; stable when the store is renamed.
   */
  id: string;
  kind: StoreKindEnum;
  /**
   * Absolute path to the folder holding catalog.json: a POSIX path, a Windows drive path or a UNC share.
   */
  location: string;
  /**
   * When true, Debrief offers no action that would write to the store. A courtesy, not access control: filesystem permissions decide that (SEC-01).
   */
  read_only?: boolean | null;
  /**
   * The name the analyst sees.
   */
  title: string;
}
/**
 * A number, table or graph (TL-13), held column by column. A number is one column with one value; a graph plots its first column against the rest.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "NonSpatialResult".
 */
export interface NonSpatialResult {
  columns: ResultColumn[];
  presentation: ResultPresentationEnum;
  title: string;
}
/**
 * One column; exactly one of numbers or strings is given.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ResultColumn".
 */
export interface ResultColumn {
  name: string;
  numbers?: number[] | null;
  quantity_kind?: QuantityKindEnum | null;
  strings?: string[] | null;
  /**
   * UCUM unit code, required when quantity_kind is given.
   */
  unit?: string | null;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ParameterDeclaration".
 */
export interface ParameterDeclaration {
  /**
   * Required when kind is choice.
   */
  choices?: string[] | null;
  default?: number | string | boolean | Length | Speed | Angle | Duration | AngularRate | null;
  /**
   * Shown beside the field on the form (CAP-24).
   */
  explanation?: string | null;
  kind: ParameterKindEnum;
  /**
   * Upper bound, as for minimum.
   */
  maximum?: number | null;
  /**
   * Lower bound for number, integer and quantity kinds; for a quantity, in the default's unit.
   */
  minimum?: number | null;
  name: string;
  /**
   * Required when kind is quantity.
   */
  quantity_kind?: QuantityKindEnum | null;
  required?: boolean | null;
  title: string;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "Selection".
 */
export interface Selection {
  feature_ids: string[];
  /**
   * Href of the plot the selection belongs to.
   */
  plot: string;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SharedState".
 */
export interface SharedState {
  selection: Selection;
  time: TimeState;
  viewport: Viewport;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TimeState".
 */
export interface TimeState {
  current: string;
  range: TimeRange;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "Viewport".
 */
export interface Viewport {
  /**
   * @minItems 4
   * @maxItems 4
   */
  bbox: [number, number, number, number];
}
/**
 * A change to some or all of shared state, as set by a view or returned by a tool (TL-10, TL-11).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SharedStateChange".
 */
export interface SharedStateChange {
  selection?: Selection | null;
  time?: TimeState | null;
  viewport?: Viewport | null;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "StacAsset".
 */
export interface StacAsset {
  "debrief:asset_kind": AssetKindEnum;
  /**
   * Required for sources (SUB-11).
   */
  "debrief:content_hash"?: string | null;
  href: string;
  /**
   * The asset's key in the item's assets object; not written inside the asset.
   */
  key: string;
  roles?: string[] | null;
  title?: string | null;
  /**
   * Media type.
   */
  type?: string | null;
  [k: string]: unknown;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "StacAsset__identifier_optional".
 */
export interface StacAsset1 {
  "debrief:asset_kind": AssetKindEnum;
  /**
   * Required for sources (SUB-11).
   */
  "debrief:content_hash"?: string | null;
  href: string;
  /**
   * The asset's key in the item's assets object; not written inside the asset.
   */
  key?: string;
  roles?: string[] | null;
  title?: string | null;
  /**
   * Media type.
   */
  type?: string | null;
  [k: string]: unknown;
}
/**
 * A static, file-based STAC catalogue (SUB-15). Holds one protection level (SEC-02).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "StacCatalog".
 */
export interface StacCatalog {
  /**
   * The newest data-file schema this catalogue holds (SUB-35).
   */
  "debrief:schema_version": string;
  description: string;
  id: string;
  links: StacLink[];
  stac_extensions?: string[] | null;
  stac_version: string;
  title?: string | null;
  type: CatalogTypeEnum;
}
/**
 * Parent links are authoritative; child links are a hint only and are never trusted (SUB-23).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "StacLink".
 */
export interface StacLink {
  href: string;
  rel: string;
  title?: string | null;
  /**
   * Media type.
   */
  type?: string | null;
}
/**
 * A STAC item. A plot is the item's "plot" asset (SUB-05, SUB-06).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "StacItem".
 */
export interface StacItem {
  assets: {
    [k: string]: StacAsset1;
  };
  /**
   * @minItems 4
   * @maxItems 4
   */
  bbox?: [number, number, number, number];
  geometry?: PointGeometry | LineStringGeometry | PolygonGeometry | null;
  id: string;
  links: StacLink[];
  properties: StacItemProperties;
  stac_extensions?: string[] | null;
  stac_version: string;
  type: ItemTypeEnum;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "StacItemProperties".
 */
export interface StacItemProperties {
  /**
   * Null when start_datetime and end_datetime are given.
   */
  datetime?: string | null;
  /**
   * Platform names, for catalogue search (SUB-16).
   */
  "debrief:participants"?: string[] | null;
  "debrief:schema_version": string;
  description?: string | null;
  end_datetime?: string | null;
  start_datetime?: string | null;
  title?: string | null;
  [k: string]: unknown;
}
/**
 * How a tool describes itself to Debrief, agents and hooks (TL-04, TL-06).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ToolDeclaration".
 */
export interface ToolDeclaration {
  /**
   * Feature kinds from the taxonomy, or "*" for any (TL-06). Debrief offers a tool only if every selected item matches (TL-08).
   */
  applies_to: string[];
  /**
   * Short user-facing explanation of what the tool does (CAP-24).
   */
  explanation: string;
  /**
   * Any judgement the tool involves, shown on its form (CAP-24).
   */
  judgement?: string | null;
  max_selected?: number | null;
  min_selected?: number | null;
  /**
   * Dotted, unique across loaded libraries, for example core.smooth_track.
   */
  name: string;
  outputs: ToolOutputKindEnum[];
  parameters?: ParameterDeclaration[] | null;
  title: string;
  /**
   * When true, Debrief records the seed (SUB-20).
   */
  uses_randomness?: boolean | null;
  version: string;
}
/**
 * What a tool run returns (TL-11). Any combination of parts may be present.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ToolResult".
 */
export interface ToolResult {
  deleted_feature_ids?: string[] | null;
  modified_features?: (TrackFeature | AnnotationFeature | SensorObservationsFeature)[] | null;
  named_sets?: NamedSet[] | null;
  new_features?: (TrackFeature | AnnotationFeature | SensorObservationsFeature)[] | null;
  non_spatial?: NonSpatialResult[] | null;
  state_change?: SharedStateChange | null;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "UserConfig".
 */
export interface UserConfig {
  /**
   * Version of this file's layout. Currently 1.
   */
  config_version: number;
  /**
   * Known stores, in the order the analyst sees them (SUB-17).
   */
  stores: KnownStore[];
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "WebviewMessage".
 */
export interface WebviewMessage {
  kind: WebviewMessageKindEnum;
  message?: string | null;
  parameters?: ParameterValue[] | null;
  plot?: DebriefFeatureCollection | null;
  plot_title?: string | null;
  result?: ToolResult | null;
  result_title?: string | null;
  selected_names?: string[] | null;
  selection?: Selection | null;
  /**
   * The plot's period, so times can be entered as the analyst reads them.
   */
  time_range?: TimeRange | null;
  tool?: ToolDeclaration | null;
  tool_name?: string | null;
  viewport?: Viewport | null;
}
