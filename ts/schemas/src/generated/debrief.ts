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
 * Where an annotation's label is drawn, relative to it.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "LabelPositionEnum".
 */
export type LabelPositionEnum = "above" | "below" | "left" | "right" | "centre" | "none";
/**
 * How an annotation's line is drawn.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "LineStyleEnum".
 */
export type LineStyleEnum = "solid" | "dashed" | "dotted";
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
 * Chart furniture a plot can carry (CAP-03). The scale bar is always drawn.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ChartFurnitureEnum".
 */
export type ChartFurnitureEnum = "north_arrow";
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
 * How an annotation is drawn (CAP-03). Left out, it follows from the geometry: a line string is a line, a polygon an area, a point a label (style label) or a marker, and no geometry a note. Circles and ellipses must say so, since GeoJSON has no curves: their geometry is a polygon that approximates them, for other tools, and their own properties (centre, radius or semi-axes and orientation) say exactly what they are.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AnnotationShapeEnum".
 */
export type AnnotationShapeEnum = "line" | "area" | "circle" | "ellipse" | "label" | "marker" | "note";
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
 * How the map draws each track outside the time window: its context (CAP-29). An analyst's setting for the minimum contrast can show faint as visible, never hidden as anything else.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ContextTracksEnum".
 */
export type ContextTracksEnum = "visible" | "faint" | "hidden";
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
 * via the `definition` "PlotKindEnum".
 */
export type PlotKindEnum = "plot";
/**
 * Applied, undone or abandoned: what the after links and the history's current step say. Not part of step_hash, since undo changes it.
 */
export type StepStateEnum = "applied" | "undone" | "abandoned";
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
export type FeatureKindEnum = "track" | "annotation" | "sensor_observations" | "plot";
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
 * Where a step stands, as the after links and the current step say.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "StepStateEnum".
 */
export type StepStateEnum1 = "applied" | "undone" | "abandoned";
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
  | "set_time"
  | "time_changed"
  | "set_viewport"
  | "viewport_changed"
  | "show_hidden"
  | "show_form"
  | "run_tool"
  | "cancel"
  | "form_busy"
  | "form_error"
  | "show_results"
  | "show_time"
  | "window_changed"
  | "context_changed"
  | "set_context"
  | "show_annotation_form"
  | "save_annotation"
  | "delete_annotation"
  | "edit_annotation";

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
 * How an annotation is drawn: its line, its fill and its label. Data colours do not change with the theme (DEV-07). Widths and sizes are in screen pixels, so they are the same at every zoom.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AnnotationAppearance".
 */
export interface AnnotationAppearance {
  /**
   * Its line's colour, and a label's or a marker's dot. Lower-case hex RGB, for example "#c7820a". Label text is drawn in the theme's text colour, so it stays readable on any map.
   */
  colour?: string | null;
  /**
   * Colour inside an area, circle or ellipse. Lower-case hex RGB. Left out, the line's colour.
   */
  fill_colour?: string | null;
  /**
   * How opaque the fill of an area, circle or ellipse is, from 0 (none) to 1 (solid). Left out, 0.25 with a fill colour, or else a faint tint of 0.05, so what lies inside stays clear.
   */
  fill_opacity?: number | null;
  label_position?: LabelPositionEnum | null;
  /**
   * Height of its label's text in screen pixels.
   */
  label_size?: number | null;
  line_style?: LineStyleEnum | null;
  /**
   * Width of its line in screen pixels.
   */
  line_width?: number | null;
}
/**
 * Shapes, labels and chart furniture as ordinary GeoJSON (CAP-03). An annotation with only a time has null geometry and shall give a time or a time range (CAP-04); chart furniture has null geometry and needs neither. A circle or an ellipse is a polygon approximating it, for other tools, with its centre and size as properties, which Debrief draws from.
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
  /**
   * How it is drawn on the map. Left out, or any member of it left out, means Debrief's default for annotations. Content, like a track's colour: changing it is a recorded, undoable change (SUB-22).
   */
  appearance?: AnnotationAppearance | null;
  /**
   * @minItems 2
   * @maxItems 2
   */
  centre?: [number, number];
  /**
   * What chart furniture it is. Chart furniture has no geometry and needs no time.
   */
  furniture?: ChartFurnitureEnum | null;
  /**
   * Not drawn on the map. Still listed, and still selectable, in the outline. Content: hiding is a recorded, undoable change (SUB-22).
   */
  hidden?: boolean | null;
  kind: AnnotationKindEnum;
  name: string;
  /**
   * The direction of an ellipse's longer axis from its centre, true north, clockwise.
   */
  orientation?: Angle | null;
  provenance?: ProvRecord[] | null;
  /**
   * A circle's radius, along geodesics from its centre.
   */
  radius?: Length | null;
  /**
   * Half an ellipse's longer axis, along the geodesic from its centre.
   */
  semi_major?: Length | null;
  /**
   * Half an ellipse's shorter axis, along the geodesic from its centre.
   */
  semi_minor?: Length | null;
  /**
   * How it is drawn. Required for circles and ellipses; otherwise it may be left out and follows from the geometry.
   */
  shape?: AnnotationShapeEnum | null;
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
 * An annotation as the analyst describes it in a form, or an agent in a request: what is made into an annotation feature, recorded as one step in the plot's history (CAP-03, SUB-19). Positions are numbers here; forms read them in the analyst's notation and say what they mean.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AnnotationSpec".
 */
export interface AnnotationSpec {
  appearance?: AnnotationAppearance | null;
  name: string;
  orientation?: Angle | null;
  /**
   * @minItems 1
   */
  positions?: [[number, number], ...[number, number][]];
  radius?: Length | null;
  semi_major?: Length | null;
  semi_minor?: Length | null;
  shape: AnnotationShapeEnum;
  text?: string | null;
  time?: string | null;
  time_range?: TimeRange | null;
}
/**
 * The unit of analysis (SUB-05), stored as an asset of a STAC item.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "DebriefFeatureCollection".
 */
export interface DebriefFeatureCollection {
  features: (TrackFeature | AnnotationFeature | SensorObservationsFeature | PlotFeature)[];
  /**
   * The plot's whole history: every step, with its provenance and whether it is applied, undone or abandoned, and the current step (SUB-19, SUB-21, decision 13 Oct). A GeoJSON foreign member, so other tools still read the file as GeoJSON. Not content: left out of every content hash. Last in the file. A plot sent to a view or a tool never carries it.
   */
  history?: PlotHistory | null;
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
  /**
   * Not drawn on the map. Still listed, and still selectable, in the outline. Content: hiding is a recorded, undoable change (SUB-22).
   */
  hidden?: boolean | null;
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
 * How a track is drawn. Data colours do not change with the theme (DEV-07). Colour is content: the analyst changing it (blue friendly to red enemy, say) is a recorded, undoable change (SUB-22).
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
   * Not drawn on the map. Still listed, and still selectable, in the outline. Content: hiding is a recorded, undoable change (SUB-22).
   */
  hidden?: boolean | null;
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
 * The whole plot: its own details, and its view (the island). At most one per plot. Geometry is always null, so the plot file stays plain GeoJSON for other tools.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PlotFeature".
 */
export interface PlotFeature {
  /**
   * Always null.
   */
  geometry?: PointGeometry | null;
  id: string;
  properties: PlotProperties;
  type: FeatureTypeEnum;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PlotProperties".
 */
export interface PlotProperties {
  /**
   * What the plot is for. Content.
   */
  description?: string | null;
  kind: PlotKindEnum;
  /**
   * The plot's title. Content, like everything outside view.
   */
  title?: string | null;
  /**
   * The island: how the plot is being viewed. Outside the plot's history (see the module description). Kept last, so it is easy to find and strip.
   */
  view?: PlotView | null;
}
/**
 * View state saved in the plot file: not content, so not undoable and not recorded in provenance (SUB-22). Two people changing it at once are told, not silently overwritten (SUB-28). Later view state joins here.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PlotView".
 */
export interface PlotView {
  /**
   * How tracks outside the time window are drawn (CAP-29). Left out means visible.
   */
  context_tracks?: ContextTracksEnum | null;
  /**
   * The plot's time window: the period shown, one for the whole plot (CAP-28, CAP-29). Start shall not be after end.
   */
  time_window?: TimeRange | null;
}
/**
 * A plot's whole history, kept in its plot file as the top-level member history (decision 13 Oct). Steps are numbered from 1 with no gaps, in the order they were made.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PlotHistory".
 */
export interface PlotHistory {
  /**
   * The step the plot's content reflects; 0 for none (an empty plot). Never an abandoned step.
   */
  current: number;
  /**
   * The last step's step_hash, or the starting value for a history with no steps, so a step removed from the end is noticed.
   */
  head_hash: string;
  steps: HistoryStep[];
}
/**
 * One recorded change to a plot, in its plot file's history.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "HistoryStep".
 */
export interface HistoryStep {
  /**
   * Features added. A whole-plot feature here never carries its view: the island is not content (SUB-22).
   */
  added?: (TrackFeature | AnnotationFeature | SensorObservationsFeature | PlotFeature)[] | null;
  /**
   * The step this one was applied on top of (0 for the first). Replay follows these links back from a step to the first.
   */
  after: number;
  deleted_ids?: string[] | null;
  deleted_named_set_ids?: string[] | null;
  /**
   * Features changed, in full, replacing those with the same id.
   */
  modified?: (TrackFeature | AnnotationFeature | SensorObservationsFeature | PlotFeature)[] | null;
  /**
   * Named sets added or replaced, by id.
   */
  named_sets?: NamedSet[] | null;
  /**
   * Feature ids in the order the plot holds them after this change, when that is not the natural order (features kept in place, added ones last).
   */
  order?: string[] | null;
  /**
   * The operation that made the change. Usually one; a baseline step, taken when a plot made outside Debrief is first opened, carries all the plot's earlier records.
   *
   * @minItems 1
   */
  records: [ProvRecord, ...ProvRecord[]];
  /**
   * Hash of the plot's content after this step: the plot file with its island and its history left out, as Debrief writes it (SUB-22).
   */
  result_hash: string;
  /**
   * Position in the plot's history, from 1, with no gaps.
   */
  seq: number;
  state: StepStateEnum;
  /**
   * SHA-256 of this step's canonical JSON, without step_hash and state, followed by the previous step's step_hash (see the module description).
   */
  step_hash: string;
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
 * One recorded change, in the earlier layout: a file of its own in the plot's history folder. Read only to move a history into its plot file.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "Delta".
 */
export interface Delta {
  /**
   * Features added, never with the whole-plot feature's view.
   */
  added?: (TrackFeature | AnnotationFeature | SensorObservationsFeature | PlotFeature)[] | null;
  /**
   * The delta this one was applied on top of (0 for the first).
   */
  after: number;
  deleted_ids?: string[] | null;
  deleted_named_set_ids?: string[] | null;
  /**
   * Features changed, in full, replacing those with the same id.
   */
  modified?: (TrackFeature | AnnotationFeature | SensorObservationsFeature | PlotFeature)[] | null;
  /**
   * Named sets added or replaced, by id.
   */
  named_sets?: NamedSet[] | null;
  /**
   * Feature ids in the order the plot holds them after this change.
   */
  order?: string[] | null;
  /**
   * The operation that made the change.
   *
   * @minItems 1
   */
  records: [ProvRecord, ...ProvRecord[]];
  /**
   * Content hash of the plot file after this delta, island left out.
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
 * Where a plot's history stood, in the earlier layout (history/head.json). Read only to move a history into its plot file.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "HistoryHead".
 */
export interface HistoryHead {
  /**
   * Deltas undone and then superseded by a new change.
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
   * Content hash the plot file has when it reflects current, island left out.
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
  /**
   * From a tool whose purpose is to set the time window: save time's range as the plot's window. Honoured only when the analyst ran the tool by hand on this plot; otherwise, and without it, a range beyond the saved window is shown, never saved (CAP-28). Needs time.
   */
  save_window?: boolean | null;
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
  /**
   * An annotation as the form describes it (show_annotation_form, save_annotation).
   */
  annotation?: AnnotationSpec | null;
  /**
   * How tracks outside the time window are drawn (CAP-29).
   */
  context_tracks?: ContextTracksEnum | null;
  /**
   * Current time from shared state, which a tool form offers for its time fields.
   */
  current_time?: string | null;
  /**
   * The annotation a form changes or deletes, or the map asks to change.
   */
  feature_id?: string | null;
  /**
   * How many of the plot's features are hidden on the map (SUB-22), so the map can say so.
   */
  hidden_count?: number | null;
  kind: WebviewMessageKindEnum;
  message?: string | null;
  /**
   * The analyst's setting that shows faint context tracks as visible, so the time controller can say so.
   */
  minimum_context_contrast?: boolean | null;
  parameters?: ParameterValue[] | null;
  plot?: DebriefFeatureCollection | null;
  plot_title?: string | null;
  result?: ToolResult | null;
  result_title?: string | null;
  /**
   * The time window as saved in the plot, so the time controller can say when the window shown differs from it (CAP-28).
   */
  saved_window?: TimeRange | null;
  selected_names?: string[] | null;
  selection?: Selection | null;
  time?: TimeState | null;
  /**
   * The plot's period, so times can be entered as the analyst reads them (show_form) and the time window set within it (show_time); or the time window to save (window_changed).
   */
  time_range?: TimeRange | null;
  tool?: ToolDeclaration | null;
  tool_name?: string | null;
  viewport?: Viewport | null;
}
