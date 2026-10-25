// Generated from schemas/linkml/debrief.yaml via JSON Schema by ts/schemas/scripts/generate.mjs. Do not edit.
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AgentKindEnum".
 */
export type AgentKindEnum = "person" | "software_agent";
/**
 * What the analyst asks of ambiguous cuts (CAP-22): keep the bearing to port or to starboard of the host track's course at each cut's time, as legacy Debrief's Keep port bearing and Keep starboard bearing decide it (by the side of the bearing recorded first); keep the bearing recorded first, or its ambiguous twin, as the analyst clicked it on the map; or make the cuts ambiguous again.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AmbiguityKeepEnum".
 */
export type AmbiguityKeepEnum = "port" | "starboard" | "bearing" | "ambiguous_bearing" | "ambiguous";
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
 * How a towed array's position follows the ship (CAP-22; product owner, 24 Oct 2026), legacy Debrief's array centre modes.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ArrayModeEnum".
 */
export type ArrayModeEnum = "worm_in_hole" | "plain";
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
 * What an item is to the plot.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "CoverageItemRoleEnum".
 */
export type CoverageItemRoleEnum = "this_plot" | "drawn_from" | "other";
/**
 * How a source's track is known to be the plot's platform.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "CoverageLinkEnum".
 */
export type CoverageLinkEnum = "plot" | "linked" | "proposed";
/**
 * A track's labels, symbols or direction arrows explicitly turned off (CAP-32), rather than left to Debrief's default.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "FixIntervalOffEnum".
 */
export type FixIntervalOffEnum = "off";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackKindEnum".
 */
export type TrackKindEnum = "track";
/**
 * A track's time labels or symbols at every recorded fix (CAP-32), legacy Debrief's "All" (decision, product owner, 15 Oct 2026): still thinned when zoomed out. Not for arrows.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "FixIntervalAllEnum".
 */
export type FixIntervalAllEnum = "all";
/**
 * How a track is plotted, as legacy Debrief asked of each track imported (CAP-01, decision, product owner, 14 Oct 2026).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PlottingModeEnum".
 */
export type PlottingModeEnum = "otg" | "dr";
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
 * via the `definition` "SensorKindEnum".
 */
export type SensorKindEnum = "sensor";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SensorCutKindEnum".
 */
export type SensorCutKindEnum = "sensor_cut";
/**
 * Which of an ambiguous cut's two recorded bearings the analyst kept (CAP-22): the side resolved. Recorded as the bearing kept, not as port or starboard, because which side a bearing is on depends on the host track's course at the cut's time, which a later edit of the track (a move, dead reckoning) can change; what the analyst judged is which bearing was the target's. Debrief says it as port or starboard.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SensorCutKeptEnum".
 */
export type SensorCutKeptEnum = "bearing" | "ambiguous_bearing";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "NarrativeKindEnum".
 */
export type NarrativeKindEnum = "narrative";
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PlotKindEnum".
 */
export type PlotKindEnum = "plot";
/**
 * How an image is written (decision, product owner, 16 Oct 2026; no JPEG).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ImageFormatEnum".
 */
export type ImageFormatEnum = "png" | "svg";
/**
 * The size an image is drawn at.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ImagePresetEnum".
 */
export type ImagePresetEnum = "screen" | "slide" | "a4_landscape";
/**
 * The colours an image is drawn in.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ImageThemeEnum".
 */
export type ImageThemeEnum = "current" | "light";
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
export type FeatureKindEnum =
  "track" | "annotation" | "sensor_observations" | "plot" | "narrative" | "sensor" | "sensor_cut";
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
 * How a measure's value is written for people, by the formatting service (SUB-04).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "MeasureDisplayEnum".
 */
export type MeasureDisplayEnum = "quantity" | "range" | "bearing" | "relative_bearing" | "depth";
/**
 * What a measure is of.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "MeasureSubjectEnum".
 */
export type MeasureSubjectEnum = "relative" | "own";
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
 * Which side of the host's course a bearing is on (CAP-22).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SideEnum".
 */
export type SideEnum = "port" | "starboard";
/**
 * Where a step stands, as the after links and the current step say.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "StepStateEnum".
 */
export type StepStateEnum1 = "applied" | "undone" | "abandoned";
/**
 * What a Timeline row is.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TimelineEntryKindEnum".
 */
export type TimelineEntryKindEnum = "narrative" | "annotation" | "fix_comment" | "coverage";
/**
 * What a tool may return (TL-11).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ToolOutputKindEnum".
 */
export type ToolOutputKindEnum =
  "new_features" | "modified_features" | "deleted_features" | "non_spatial" | "named_sets" | "state_change";
/**
 * Whether a track in the Tote has values at current time.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ToteRowStatusEnum".
 */
export type ToteRowStatusEnum = "ok" | "no_data" | "missing";
/**
 * What a track edit does (CAP-01).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackEditActionEnum".
 */
export type TrackEditActionEnum = "move" | "rotate" | "shear" | "stretch" | "move_fix" | "set_plotting_mode";
/**
 * Which end of the period a shear or a stretch holds fixed; the other end is the one dragged.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackEditAnchorEnum".
 */
export type TrackEditAnchorEnum = "start" | "end";
/**
 * How tracks imported are plotted: ask for each track (the default), or one choice the analyst said to use for future imports. User state, kept here and never in a catalogue or a plot file.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackImportModeEnum".
 */
export type TrackImportModeEnum = "ask" | "otg" | "dr";
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
  | "edit_annotation"
  | "annotation_drawn"
  | "edit_track"
  | "show_fixes"
  | "show_tote"
  | "tote_changed"
  | "set_tote"
  | "show_timeline"
  | "narrative_on_map_changed"
  | "playing_changed"
  | "timeline_chosen"
  | "save_narrative"
  | "delete_narrative"
  | "open_narrative_form"
  | "narrative_saved"
  | "set_narrative"
  | "undo_asked"
  | "redo_asked"
  | "fix_chosen"
  | "show_coverage"
  | "source_chosen"
  | "link_changed"
  | "take_asked"
  | "dismiss_asked"
  | "review_cleared"
  | "export_image"
  | "image_rendered"
  | "latest_asked"
  | "resolve_asked"
  | "cut_chosen"
  | "show_tma"
  | "tma_chosen"
  | "tma_create"
  | "tma_guess"
  | "tma_guessed"
  | "tma_preview"
  | "tma_exclude"
  | "tma_split"
  | "tma_time_asked"
  | "tma_made";

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
 * Ambiguous cuts resolved, or made ambiguous again, as the map, a menu or an agent asks (CAP-22): one recorded, undoable step (product owner, 24 Oct 2026). The cuts are those named, or else the cuts of the sensors named within a period (the time window, as the analyst sets it). Cuts with no ambiguous bearing are left as they are, and the step says how many.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "AmbiguityResolution".
 */
export interface AmbiguityResolution {
  /**
   * The cuts to resolve, by feature id. Or give sensor_ids, and perhaps a period.
   */
  cut_ids?: string[] | null;
  keep: AmbiguityKeepEnum;
  /**
   * The cuts whose times fall in it, ends included, of the sensors named.
   */
  period?: TimeRange | null;
  /**
   * Sensors whose cuts in the period are resolved; every cut of each, without a period.
   */
  sensor_ids?: string[] | null;
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
  /**
   * Catalogue items the operation took data from, each at the revision it read (CAP-09 to CAP-12): PROV's wasDerivedFrom. A product whose provenance names an item at a revision it no longer has may need review (CAP-12).
   */
  drawn_from?: ItemRef[] | null;
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
 * A catalogue item an operation took data from, at one revision (CAP-09 to CAP-12). Items are named by their catalogue's own id (the catalog.json id, not the analyst's name for the folder) and their item id, so the reference means the same on every analyst's machine.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ItemRef".
 */
export interface ItemRef {
  /**
   * The id in the item's catalog.json.
   */
  catalogue: string;
  /**
   * The item's id in that catalogue.
   */
  item: string;
  /**
   * The item's revision when it was read: the content hash of its plot (its whole-plot details included), so any recorded change to the item, of data or details, is a new revision.
   */
  revision: string;
  /**
   * The item's title when it was read, to name it if it has gone.
   */
  title?: string | null;
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
 * The analyst's answers to collation's marks, each for one revision of an item, so a later revision is marked again.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "CollationView".
 */
export interface CollationView {
  /**
   * Items marked as new data for this plot that the analyst set aside (Not now), at the revision then (CAP-10).
   */
  dismissed?: ItemRevision[] | null;
  /**
   * Revised items this plot drew from that the analyst reviewed it against, clearing its review flag, at the revision reviewed (CAP-12).
   */
  reviewed?: ItemRevision[] | null;
}
/**
 * One revision of a catalogue item; for an answer the analyst gave (Not now, Reviewed), who gave it and when, a light audit trail kept in the island (decision, product owner, 16 Oct 2026).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ItemRevision".
 */
export interface ItemRevision {
  /**
   * When the answer was given.
   */
  at?: string | null;
  /**
   * Who gave the answer: the agent's name.
   */
  by?: string | null;
  catalogue: string;
  item: string;
  revision: string;
}
/**
 * A catalogue item in the folder tree the plot draws from.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "CoverageItem".
 */
export interface CoverageItem {
  catalogue: string;
  created?: string | null;
  end?: string | null;
  item: string;
  /**
   * Marked as new data for the plot (CAP-10).
   */
  new_data?: NewDataMark | null;
  /**
   * The plot took data from this item at a revision it no longer has (CAP-12).
   */
  revised?: boolean | null;
  revision?: string | null;
  role: CoverageItemRoleEnum;
  start?: string | null;
  title: string;
  tracks?: TrackCoverage[] | null;
}
/**
 * Why an item is marked as new data for a plot (CAP-10): it came in after the plot, through Debrief's import, within the folder tree the plot draws from, and has data for the plot's platforms or within its period; the plot has not taken it or set it aside at this revision.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "NewDataMark".
 */
export interface NewDataMark {
  /**
   * What the mark says, for its tooltip and screen readers.
   */
  note: string;
  /**
   * The plot's tracks it has data for.
   */
  platforms?: string[] | null;
  revision: string;
  /**
   * It has data within the plot's period.
   */
  within_period?: boolean | null;
}
/**
 * The periods one track of an item has data for (CAP-05, CAP-08): from its first fix to its last, broken at each gap (a time between two fixes more than ten times the track's median time between fixes, and more than five minutes).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackCoverage".
 */
export interface TrackCoverage {
  fixes: number;
  name: string;
  spans: TimeRange[];
  /**
   * The track's feature id.
   */
  track: string;
}
/**
 * A period in which the same sources have data for a platform.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "CoveragePeriod".
 */
export interface CoveragePeriod {
  /**
   * The source supplying the period; left out where the plot has none of its data yet.
   */
  chosen?: number | null;
  end: string;
  /**
   * The platform's sources with data throughout the period, by their place in its list.
   */
  sources: number[];
  start: string;
}
/**
 * One of the plot's tracks, and every source of data for its platform.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "CoveragePlatform".
 */
export interface CoveragePlatform {
  colour?: string | null;
  name: string;
  /**
   * The track's time cut where the sources with data change, in time order: each with the sources that have data then and the one that supplies it.
   */
  periods: CoveragePeriod[];
  /**
   * The plot's own data first, then items' tracks linked or proposed.
   */
  sources: CoverageSource[];
  /**
   * The track's feature id in the plot.
   */
  track: string;
}
/**
 * A track in a catalogue item with data for the platform.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "CoverageSource".
 */
export interface CoverageSource {
  catalogue: string;
  fixes: number;
  item: string;
  link: CoverageLinkEnum;
  /**
   * The track's name in that item.
   */
  name: string;
  /**
   * The plot took data from this item at a revision it no longer has.
   */
  revised?: boolean | null;
  spans: TimeRange[];
  /**
   * The item's title.
   */
  title: string;
  track: string;
}
/**
 * Coverage for one plot (CAP-08, CAP-09): its platforms with every source of data for each, the items in the folder tree it draws from with their marks, and whether the plot itself may need review.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "CoverageReport".
 */
export interface CoverageReport {
  /**
   * The plot's catalogue, by its own id.
   */
  catalogue: string;
  /**
   * The latest time any source shown has data.
   */
  end?: string | null;
  /**
   * The plot's item id.
   */
  item: string;
  items: CoverageItem[];
  /**
   * Anything the analyst should know about what is shown.
   */
  note?: string | null;
  platforms: CoveragePlatform[];
  /**
   * The plot drew from items since revised, so it may need review (CAP-12).
   */
  review?: ReviewFlag | null;
  /**
   * The earliest time any source shown has data.
   */
  start?: string | null;
  title: string;
}
/**
 * A product that drew from catalogue items since revised, so may need review (CAP-12), until the analyst clears it.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ReviewFlag".
 */
export interface ReviewFlag {
  catalogue: string;
  item: string;
  /**
   * What the flag says, for its tooltip and screen readers.
   */
  note: string;
  /**
   * Each item revised since the product took data from it, at its revision now.
   */
  revised: ItemRef[];
  title: string;
}
/**
 * The unit of analysis (SUB-05), stored as an asset of a STAC item.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "DebriefFeatureCollection".
 */
export interface DebriefFeatureCollection {
  features: (
    | TrackFeature
    | AnnotationFeature
    | SensorObservationsFeature
    | SensorFeature
    | SensorCutFeature
    | NarrativeFeature
    | PlotFeature
  )[];
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
   * How often a chevron on the line shows the track's direction of travel (CAP-32): aligned and bounded as label_interval. Left out, Debrief's default: a few along the track in the time window.
   */
  arrow_interval?: Duration | FixIntervalOffEnum | null;
  /**
   * Course over ground at each position, true north, clockwise.
   */
  courses?: AngleSeries | null;
  /**
   * Depth below the sea surface at each position, positive down. Absent where depth is not known.
   */
  depths?: LengthSeries | null;
  /**
   * Fixes with a colour, a label or a comment of their own, or always showing their time label or symbol, in time order, each found by its time (CAP-01, EXT-14). Most fixes have none, so only marked fixes are listed. Content: each change is a recorded, undoable step (SUB-22).
   */
  fix_marks?: FixMark[] | null;
  /**
   * Not drawn on the map. Still listed, and still selectable, in the outline. Content: hiding is a recorded, undoable change (SUB-22).
   */
  hidden?: boolean | null;
  kind: TrackKindEnum;
  /**
   * How often the track is labelled with the time (CAP-32): at each whole multiple of this interval of UTC (every 10 min is 0900, 0910, 0920...), as legacy Debrief aligns them, from 1 second to 24 hours; at every fix ("all"); or off. Left out, Debrief's default: none. Presentation content: each change is a recorded, undoable step, like colour (SUB-22).
   */
  label_interval?: Duration | FixIntervalOffEnum | FixIntervalAllEnum | null;
  /**
   * A track plotted by dead reckoning: its courses as logged, one per fix, as they were when it was plotted so. On a DR track the courses and speeds are what edits change (decision, product owner, 14 Oct 2026), so these tell what was changed while plotted by dead reckoning, and plotting it over the ground again puts them back.
   */
  logged_courses?: AngleSeries | null;
  /**
   * A track plotted by dead reckoning: its positions as logged, over the ground, one per fix, so plotting it over the ground again puts them back. Left out for a legacy plot's DR leg, which saved only the positions it worked out.
   */
  logged_positions?: LineStringGeometry | null;
  /**
   * A track plotted by dead reckoning: its speeds as logged, one per fix, as they were when it was plotted so; see logged_courses.
   */
  logged_speeds?: SpeedSeries | null;
  name: string;
  platform_class?: string | null;
  /**
   * Tracks in other catalogue items the analyst confirmed, or linked by hand, as this track's platform (CAP-09; decision, product owner, 16 Oct 2026). Tracks whose names match this one's, ignoring case and spaces, are proposed until confirmed or refused. Each change is a recorded, undoable step.
   */
  platform_links?: SourceTrackRef[] | null;
  /**
   * Tracks in other catalogue items whose names match this one's but which the analyst said are another platform: no longer proposed.
   */
  platform_unlinks?: SourceTrackRef[] | null;
  /**
   * How the track is plotted: over the ground (otg, as logged; also when left out) or by dead reckoning (dr), chosen as it was imported and changed as a recorded, undoable step (CAP-01, SUB-22). The geometry is always the positions as plotted, so other GeoJSON tools draw what Debrief draws.
   */
  plotting_mode?: PlottingModeEnum | null;
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
   * Which catalogue item supplies each period of the track (CAP-09): where two items have data for the platform over the same period, the analyst chooses which supplies it, and the track is stitched from the chosen periods. In time order, not overlapping, each from its first fix to its last. Left out, the plot itself supplies the whole track, as imported. Content: each change is a recorded, undoable step (SUB-22), naming the items and periods.
   */
  supplies?: TrackSupply[] | null;
  /**
   * How often a small symbol in the track's colour marks where it was (CAP-32): aligned and bounded as label_interval, or at every fix ("all"). Left out, none.
   */
  symbol_interval?: Duration | FixIntervalOffEnum | FixIntervalAllEnum | null;
  /**
   * One per position, non-decreasing.
   */
  times: string[];
  /**
   * The track is a TMA solution of a contact, rooted in a period of bearing cuts (CAP-21; product owner, 24 Oct 2026). Otherwise an ordinary track, plotted by dead reckoning, so every track operation works on it unchanged; this says which cuts its bearing residuals are worked out against, its legs, and the cuts left out of its RMS error. Content: each change is a recorded, undoable step (SUB-22).
   */
  tma?: TmaSolution | null;
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
 * One fix of a track marked by the analyst, or by a legacy plot: drawn in a colour of its own, labelled on the map, carrying a comment, or always showing its time label or symbol. Found by its time, not its place in the track, so a mark stays with its fix when fixes before it are removed, the track is split or merged, or it is moved, rotated, sheared, stretched or smoothed. Where two fixes share a time, the mark is the first's.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "FixMark".
 */
export interface FixMark {
  /**
   * The fix's own colour, lower-case hex RGB: its marker and the line from it to the next fix are drawn in it.
   */
  colour?: string | null;
  /**
   * Free text about the fix, shown when the analyst points at it and in the Timeline.
   */
  comment?: string | null;
  /**
   * Text drawn on the map beside the fix.
   */
  label?: string | null;
  /**
   * The fix always shows its time label, as the track's label_interval draws them, whatever that interval is and at any zoom (CAP-32; decision, product owner, 15 Oct 2026: force on only, so true when given). Never drawn twice where the interval falls on the same time.
   */
  show_label?: boolean | null;
  /**
   * The fix always shows its symbol, as the track's symbol_interval draws them, whatever that interval is and at any zoom (CAP-32); true when given.
   */
  show_symbol?: boolean | null;
  /**
   * The time of the fix marked; one of the track's times.
   */
  time: string;
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
 * A track in a catalogue item, as collation names it (CAP-08, CAP-09): the item by its catalogue's own id and its item id, the track by its feature id there, and its name when last read, to show if the item has gone.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SourceTrackRef".
 */
export interface SourceTrackRef {
  /**
   * The id in the item's catalog.json.
   */
  catalogue: string;
  item: string;
  name: string;
  /**
   * The track's feature id in that item.
   */
  track: string;
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
 * One period of a track and the catalogue item that supplies it (CAP-09): the fixes from start to end, ends included, are that item's track's (the plot's own, where it names the plot itself).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackSupply".
 */
export interface TrackSupply {
  /**
   * The id in the item's catalog.json.
   */
  catalogue: string;
  end: string;
  item: string;
  /**
   * The item's revision when the period was taken from it; left out where the plot supplies it itself.
   */
  revision?: string | null;
  start: string;
  /**
   * The item's title when the period was taken from it.
   */
  title: string;
  /**
   * The supplying track's feature id in that item.
   */
  track: string;
}
/**
 * What makes a track a TMA solution (CAP-21; product owner, 24 Oct 2026): the contact it is a solution of, and the period of bearing cuts it is rooted in, named by the cuts' ids (a sensor's id changes when its track is split; a cut's does not). Its residuals are each rooted cut's bearing less the bearing from where the cut was taken (its origin) to where the solution was at the cut's time. Its legs start at leg_starts: each is dragged on its own, the later ones following on by dead reckoning, so they stay joined.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TmaSolution".
 */
export interface TmaSolution {
  /**
   * The contact the solution is of, as the analyst names it, such as "Contact 1".
   */
  contact: string;
  /**
   * The cuts it is rooted in, by feature id, in time order: every cut of the rooted period on the sensors chosen. Its fixes fall at their times when Debrief makes it. A legacy solution whose sensor the plot does not have has none, and the import says so.
   */
  cut_ids: string[];
  /**
   * Rooted cuts the analyst left out of the RMS error, such as wild bearings (product owner, 24 Oct 2026): still listed and drawn in the bearing view, not counted. Each change is one step.
   */
  excluded_cut_ids?: string[] | null;
  /**
   * When each leg after the first starts, in time order: the solution split into legs (product owner, 24 Oct 2026). A fix exactly at a time starts the later leg, as a split does. Left out, one leg.
   */
  leg_starts?: string[] | null;
  period: TimeRange1;
  /**
   * The sensors whose cuts it was rooted in when it was made, as their ids were then: what the analyst chose. The cuts themselves are in cut_ids.
   */
  sensor_ids: string[];
}
/**
 * A closed interval of time. Start shall not be after end.
 */
export interface TimeRange1 {
  end: string;
  start: string;
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
 * A sensor carried by a track (CAP-22): a bow sonar, a towed array, the bearings read from a narrative. Its cuts are features of their own (SensorCutFeature), each naming it, so resolving one cut, or the cuts of a period, is one small recorded step (SUB-19), as each narrative entry is a feature of its own. Geometry is null: a cut is drawn from where the host track was at its time, so a track edited (moved, sheared, plotted by dead reckoning) carries its cuts with it, and a TMA solution (CAP-21) can be rooted in the cuts' times.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SensorFeature".
 */
export interface SensorFeature {
  /**
   * Always null.
   */
  geometry?: PointGeometry | null;
  id: string;
  properties: SensorProperties;
  type: FeatureTypeEnum;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SensorProperties".
 */
export interface SensorProperties {
  /**
   * How the array follows the ship: back along its past track (worm in the hole, the default, as legacy's) or straight astern (plain). Only with array_offset.
   */
  array_mode?: ArrayModeEnum | null;
  /**
   * How far astern of the ship the sensor is (a towed array), so its cuts are drawn, and port and starboard told, from the array's position, not the ship's (product owner, 24 Oct 2026). Left out, the sensor is at the ship. Set by the analyst as a recorded, undoable step, or read from a legacy plot (its Offset, astern).
   */
  array_offset?: Length | null;
  /**
   * The colour its cuts are drawn in, lower-case hex RGB, unless a cut has its own. Content, like a track's colour: each change is a recorded, undoable step (SUB-22).
   */
  colour: string;
  /**
   * None of its cuts drawn on the map. Still listed, and still selectable, in the outline, under its track. Content: hiding is a recorded, undoable change (SUB-22).
   */
  hidden?: boolean | null;
  /**
   * The track carrying the sensor (ownship): its cuts are drawn from that track's position at each cut's time (or its array's, astern). A track split: the cuts from the split on go with the second part, as a sensor of its own (a new id) where the sensor had cuts before it too; cuts between the parts' fixes keep the position they were drawn from. Tracks merged: sensors of one name are one again, the merged track's.
   */
  host_track_id: string;
  kind: SensorKindEnum;
  /**
   * The REP symbology code its colour came from, such as "@A", kept for export.
   */
  legacy_symbology?: string | null;
  /**
   * The sensor's name, as its source gives it, such as "Towed array" or "2087".
   */
  name: string;
  provenance?: ProvRecord[] | null;
}
/**
 * One cut of a sensor (CAP-22): a bearing from the host track at a time, perhaps with the ambiguous bearing a towed array cannot tell it from, and which of the two the analyst kept. Geometry is null: the cut is drawn from the host track's position at its time (as the map places tracks, along the geodesic between fixes), or from the position recorded with it, along the geodesic at its bearing to its range, or else past the edge of the map's view (twice the view's larger side, at most 5 degrees of arc, 300 nmi, as legacy Debrief draws it). Frequency is never imported (CAP-22, EXT-03). A bearing error is not held yet: no legacy format defines what one means (product owner, 24 Oct 2026); an optional bearing_error here is the way to add it, and wedges with it.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SensorCutFeature".
 */
export interface SensorCutFeature {
  /**
   * Always null.
   */
  geometry?: PointGeometry | null;
  id: string;
  properties: SensorCutProperties;
  type: FeatureTypeEnum;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "SensorCutProperties".
 */
export interface SensorCutProperties {
  /**
   * A towed array's ambiguous bearing: the mirror image of bearing about the array, on the other side of the host's course. Left out for a cut that was never ambiguous.
   */
  ambiguous_bearing?: Angle | null;
  bearing: Angle1;
  /**
   * The bearing accuracy a ;SENSOR3: line gives, kept exactly as written: no format says what it means (a standard deviation, a half-width), so it is not drawn (product owner, 24 Oct 2026).
   */
  bearing_accuracy?: string | null;
  /**
   * The cut's own colour, lower-case hex RGB; left out, its sensor's, as legacy Debrief lets a cut take its sensor's colour.
   */
  colour?: string | null;
  /**
   * Free text about the cut.
   */
  comment?: string | null;
  /**
   * The course, true, the cut's port and starboard are told by, pinned with a derived origin when its track was split (the course logged where the sensor was then). Left out, the host's logged course at the cut's time. Only with origin.
   */
  course?: Angle | null;
  /**
   * Not drawn on the map. Content, like hiding any feature (SUB-22).
   */
  hidden?: boolean | null;
  kind: SensorCutKindEnum;
  /**
   * Text the source gives the cut, such as legacy Debrief's label.
   */
  label?: string | null;
  /**
   * @minItems 2
   * @maxItems 2
   */
  origin?: [number, number];
  /**
   * True where origin is not recorded by the source but derived by Debrief: where the sensor (its array astern, if it has one) was before its track was split, pinned so the cut is drawn, and its side told, as before (round 3 review, 24 Oct 2026). A TMA residual can tell a recorded origin from a derived one by it. Only with origin.
   */
  origin_derived?: boolean | null;
  /**
   * How far the target was, where the source says: the cut is drawn to that range. Left out, drawn past the edge of the view. A range of 0 (a ;SENSOR2: or ;SENSOR3: line's, as legacy read it) is drawn as a point where the cut was taken, as legacy drew it.
   */
  range?: Length | null;
  /**
   * Which of the two bearings the analyst kept, for a cut with an ambiguous bearing; left out while it is unresolved, when both are drawn. Each resolution, of one cut or of every cut in a period, is one recorded, undoable step with provenance (product owner, 24 Oct 2026), and can be undone or reset to ambiguous.
   */
  resolved?: SensorCutKeptEnum | null;
  /**
   * The sensor the cut is from, a sensor feature in the plot.
   */
  sensor_id: string;
  /**
   * When the cut was taken, to the millisecond, Zulu (SUB-01).
   */
  time: string;
}
export interface Angle1 {
  unit: AngleUnitEnum;
  value: number;
}
/**
 * One narrative entry (CAP-19, CAP-20, EXT-14): what a platform, a person or a document logged at a time. A feature of its own with null geometry, as a time-only annotation is, so other GeoJSON tools read it, and each entry added, changed or deleted is one small recorded, undoable step (SUB-19). Every narrative feature in a plot together makes the plot's narrative: one combined Zulu time axis, however many sources it came from, in the order narrative_order gives (time; then source, ignoring case; then the plot's order, so a log's own order at one time is kept).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "NarrativeFeature".
 */
export interface NarrativeFeature {
  /**
   * Always null.
   */
  geometry?: PointGeometry | null;
  id: string;
  properties: NarrativeProperties;
  type: FeatureTypeEnum;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "NarrativeProperties".
 */
export interface NarrativeProperties {
  /**
   * What kind of entry, in the source's own words, such as legacy Debrief's GenComment, Posn, CSD or FCS. Free text: each source has its own types. Left out where the source gives none.
   */
  entry_type?: string | null;
  kind: NarrativeKindEnum;
  provenance?: ProvRecord[] | null;
  /**
   * Who wrote it: the platform, person or document whose log it is (legacy Debrief's track name on an entry), such as "BLUE ONE".
   */
  source: string;
  /**
   * What was logged. May run to several lines.
   */
  text: string;
  /**
   * When it was logged, to the millisecond, Zulu (SUB-01).
   */
  time: string;
  /**
   * The track the entry belongs to, where one is known: by default the track named as its source. A track since deleted leaves the link, which is then ignored.
   */
  track_id?: string | null;
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
   * What the analyst has said of catalogue items while collating (CAP-10, CAP-12): new data set aside for now, and revisions reviewed. View state: never a step in the history.
   */
  collation?: CollationView | null;
  /**
   * How tracks outside the time window are drawn (CAP-29). Left out means visible.
   */
  context_tracks?: ContextTracksEnum | null;
  /**
   * The plot's export log: each image exported from it, with its ID, the revision exported, when, by whom, the view and the time, the format and the file's name (SUB-25; decision, product owner, 16 Oct 2026). View state: never a step, so an export changes neither the plot's revision nor any product that drew from it.
   */
  exports?: ImageExport[] | null;
  /**
   * Whether the map shows the narrative entry current time is at in a small box beside its track, for ten minutes of plot time; left out means it does. Turned off and on in the Timeline. View state, like the Tote's lines: never a step in the history (decision, product owner, 15 Oct 2026).
   */
  narrative_on_map?: boolean | null;
  /**
   * The plot's time window: the period shown, one for the whole plot (CAP-28, CAP-29). Start shall not be after end.
   */
  time_window?: TimeRange | null;
  /**
   * Which tracks the Tote compares, and through which measure group (CAP-06, CAP-07). View state, like the window: changing it is never a step in the history (decision, 14 Oct 2026).
   */
  tote?: ToteView | null;
}
/**
 * One image exported from a plot, as the plot's export log records it in its island: view state, never a step (decision, product owner, 16 Oct 2026). What the analyst exported, so the image can be traced and its view shown again.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ImageExport".
 */
export interface ImageExport {
  /**
   * When it was exported.
   */
  at: string;
  /**
   * Who exported it: the agent's name.
   */
  by?: string | null;
  /**
   * The file's name, without its folder.
   */
  file?: string | null;
  /**
   * Whether the image shows its ID in a footer.
   */
  footer: boolean;
  format: ImageFormatEnum;
  /**
   * Its height in pixels.
   */
  height?: number | null;
  /**
   * The image's ID, in full.
   */
  id: string;
  preset?: ImagePresetEnum | null;
  /**
   * The plot's revision exported (its content hash): the step it was exported at.
   */
  revision: string;
  theme?: ImageThemeEnum | null;
  /**
   * Current time and the time window when it was exported.
   */
  time?: TimeState | null;
  /**
   * Which tracks the Tote compared when it was exported, so the plot traced from the image shows the Tote, and its lines on the map, as the figure did (decision, product owner, 16 Oct 2026).
   */
  tote?: ToteView | null;
  /**
   * The area of the map exported.
   */
  viewport?: Viewport | null;
  /**
   * Its width in pixels.
   */
  width?: number | null;
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
 * Which tracks the Tote compares, and through which measure group: view state in the plot's island, like the time window, so it travels with the plot file but is never a step in its history and never undone (SUB-22; decision, 14 Oct 2026). Ids of tracks no longer in the plot are shown as missing, not refused, because a change to content never changes the island.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ToteView".
 */
export interface ToteView {
  /**
   * Whether the map draws a thin line from the primary to each secondary at current time; left out means it does (decision, 14 Oct 2026).
   */
  map_lines?: boolean | null;
  /**
   * The measure group shown; left out means core.
   */
  measure_group?: string | null;
  /**
   * The track the others are measured from; left out until one is chosen.
   */
  primary?: string | null;
  /**
   * The tracks measured from the primary, in the order shown.
   */
  secondaries?: string[] | null;
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
  added?:
    | (
        | TrackFeature
        | AnnotationFeature
        | SensorObservationsFeature
        | SensorFeature
        | SensorCutFeature
        | NarrativeFeature
        | PlotFeature
      )[]
    | null;
  /**
   * The step this one was applied on top of (0 for the first). Replay follows these links back from a step to the first.
   */
  after: number;
  deleted_ids?: string[] | null;
  deleted_named_set_ids?: string[] | null;
  /**
   * Features changed, in full, replacing those with the same id.
   */
  modified?:
    | (
        | TrackFeature
        | AnnotationFeature
        | SensorObservationsFeature
        | SensorFeature
        | SensorCutFeature
        | NarrativeFeature
        | PlotFeature
      )[]
    | null;
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
  added?:
    | (
        | TrackFeature
        | AnnotationFeature
        | SensorObservationsFeature
        | SensorFeature
        | SensorCutFeature
        | NarrativeFeature
        | PlotFeature
      )[]
    | null;
  /**
   * The delta this one was applied on top of (0 for the first).
   */
  after: number;
  deleted_ids?: string[] | null;
  deleted_named_set_ids?: string[] | null;
  /**
   * Features changed, in full, replacing those with the same id.
   */
  modified?:
    | (
        | TrackFeature
        | AnnotationFeature
        | SensorObservationsFeature
        | SensorFeature
        | SensorCutFeature
        | NarrativeFeature
        | PlotFeature
      )[]
    | null;
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
 * The analyst's own export log, exports.json beside their Debrief configuration: the newest 2,000 exports their plots could not keep.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ExportLog".
 */
export interface ExportLog {
  exports?: LoggedExport[] | null;
}
/**
 * An export recorded in the analyst's own export log, beside their Debrief configuration, where the plot's could not be written (a read-only catalogue, say), so every export stays traceable (decision, product owner, 16 Oct 2026).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "LoggedExport".
 */
export interface LoggedExport {
  /**
   * The catalogue's own id, from its catalog.json.
   */
  catalogue: string;
  export: ImageExport;
  item: string;
}
/**
 * Where an image came from: a plot in one of the analyst's catalogues, at the revision the image was exported at (Find source of image).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "FigureSource".
 */
export interface FigureSource {
  /**
   * The catalogue's own id, from its catalog.json.
   */
  catalogue: string;
  /**
   * The image's plot key names another plot: this is a copy of it with the same content at that revision (a colleague's, or one moved to another catalogue).
   */
  copied?: boolean | null;
  /**
   * The plot's current step now.
   */
  current: number;
  /**
   * The export log entry for the image, where the plot's log or the analyst's own has one. A footer's short form may name several exports of one revision: each is a source of its own, to choose from.
   */
  export?: ImageExport | null;
  item: string;
  revision: string;
  /**
   * The step at that revision.
   */
  step: number;
  /**
   * The catalogue's id in the analyst's configuration.
   */
  store?: string | null;
  store_title?: string | null;
  title: string;
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
 * What the host asks the map to draw for an export (export_image).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ImageRequest".
 */
export interface ImageRequest {
  /**
   * The image's ID in its short form, to draw in a corner; left out for no footer.
   */
  footer_text?: string | null;
  format: ImageFormatEnum;
  preset: ImagePresetEnum;
  theme: ImageThemeEnum;
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
 * One measure the Tote can show. The core measures are Debrief's own; a study may add more (CAP-07), each worked out in Python.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "MeasureDefinition".
 */
export interface MeasureDefinition {
  display: MeasureDisplayEnum;
  /**
   * How it is worked out, in a sentence.
   */
  explanation?: string | null;
  /**
   * Unique among measures, such as range or relative_bearing.
   */
  id: string;
  /**
   * Its row heading in the Tote, before the unit, short enough for a narrow view.
   */
  label: string;
  quantity_kind: QuantityKindEnum;
  subject: MeasureSubjectEnum;
  /**
   * Its name in full, for hover text and screen readers.
   */
  title: string;
}
/**
 * A named, reusable set of measures tied to a mode of analysis (CAP-07), shown by the Tote in this order. Every group extends the shared core: extends names the group it adds to (core itself extends nothing). A study's own groups will be defined by its lead analyst and kept in the study catalogue, shared by every plot in the study.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "MeasureGroup".
 */
export interface MeasureGroup {
  description?: string | null;
  /**
   * The group whose measures come first, before this one's own; left out for core.
   */
  extends?: string | null;
  id: string;
  /**
   * The ids of the measures shown, in order, those of the group it extends included.
   */
  measures: string[];
  title: string;
}
/**
 * One measure's value at current time; value left out where it cannot be worked out (no depth recorded, say).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "MeasureValue".
 */
export interface MeasureValue {
  measure: string;
  /**
   * The UCUM unit of value, such as m, deg or m/s; formatted for people by the views (SUB-04).
   */
  unit?: string | null;
  value?: number | null;
}
/**
 * What the analyst answered for documents of one dialect: the types not read (so a type not seen before is read), whether only entries within the plot's period, and the track each platform was said to be.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "NarrativeImportAnswers".
 */
export interface NarrativeImportAnswers {
  /**
   * The dialect, such as narrative-document or rider-narrative.
   */
  dialect: string;
  /**
   * Entry types the analyst chose not to read; "" for entries with no type.
   */
  skip_types?: string[] | null;
  /**
   * The track the analyst said each platform is, by the track's name.
   */
  tracks?: PlatformTrack[] | null;
  /**
   * Only the entries within the plot's tracks' period.
   */
  within_period?: boolean | null;
}
/**
 * A platform, as a document names it, and the track it was said to be.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "PlatformTrack".
 */
export interface PlatformTrack {
  platform: string;
  /**
   * The track's name; left out, the platform belongs to no track.
   */
  track?: string | null;
}
/**
 * A narrative entry as the analyst describes it in a form, or an agent in a request (debrief/add_narrative, debrief/edit_narrative): made into a narrative feature as one recorded step (CAP-20).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "NarrativeSpec".
 */
export interface NarrativeSpec {
  entry_type?: string | null;
  source?: string | null;
  text?: string | null;
  time?: string | null;
  track_id?: string | null;
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
 * The image the map drew (image_rendered), before its ID goes into its metadata.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "RenderedImage".
 */
export interface RenderedImage {
  /**
   * A PNG as base 64, or an SVG as its text.
   */
  data: string;
  format: ImageFormatEnum;
  height: number;
  /**
   * What the image leaves out that the map shows, for the analyst: reference tiles that could not be read, say.
   */
  notes?: string[] | null;
  /**
   * The area of the map drawn.
   */
  viewport?: Viewport | null;
  width: number;
}
/**
 * The plot is shown as it was at an earlier revision, read-only: the one an image was exported at (show_plot).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "RevisionShown".
 */
export interface RevisionShown {
  /**
   * The image's ID, in its short form, when one was traced.
   */
  figure?: string | null;
  /**
   * The plot's current step now.
   */
  latest: number;
  revision: string;
  /**
   * The step whose revision is shown.
   */
  step: number;
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
   * When the item came into the catalogue (STAC common metadata): by import, as a received plot file, or as a copy. Items that came in after a plot can be new data for it (CAP-10).
   */
  created?: string | null;
  /**
   * Null when start_datetime and end_datetime are given.
   */
  datetime?: string | null;
  /**
   * The periods each of the item's tracks has data for (CAP-08), so a catalogue's coverage is read from its items alone. Derived at each change, never authoritative.
   */
  "debrief:coverage"?: TrackCoverage[] | null;
  /**
   * The catalogue items the plot's tracks take data from now, each at every revision a period of it was read at (CAP-12), from its tracks' supplies. Derived at each change, never authoritative.
   */
  "debrief:drawn_from"?: ItemRef[] | null;
  /**
   * Whether the item came in by importing source files: its history starts with a record naming the files it read. Only such items can be new data for a plot (CAP-10; decision, product owner, 16 Oct 2026). Derived at each change, never authoritative.
   */
  "debrief:imported"?: boolean | null;
  /**
   * The step_hash of the first step of the item's history: items that share it are copies of one plot, forked where their histories part (CAP-10). Derived at each change, never authoritative.
   */
  "debrief:origin"?: string | null;
  /**
   * Platform names, for catalogue search (SUB-16).
   */
  "debrief:participants"?: string[] | null;
  /**
   * The content hash of the item's plot, its whole-plot details included, so any recorded change to the item is a new revision (CAP-12). Derived at each change, never authoritative, as the extent is.
   */
  "debrief:revision"?: string | null;
  /**
   * Every revision the item's history has had, each as the 16 symbols an image ID names it by (the first 80 bits of the content hash after each step, in Crockford's base 32), so an exported image is traced to its plot from the catalogue's items alone, never reading a plot that never had its revision (SUB-25). Derived at each change, never authoritative.
   */
  "debrief:revisions"?: string[] | null;
  "debrief:schema_version": string;
  description?: string | null;
  end_datetime?: string | null;
  start_datetime?: string | null;
  title?: string | null;
  [k: string]: unknown;
}
/**
 * One row of the Timeline (CAP-05, CAP-20): a narrative entry, a time-only annotation (a note or a period) or a comment on a track's fix, as the Timeline lists them, in one time order.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TimelineEntry".
 */
export interface TimelineEntry {
  /**
   * That track's colour, lower-case hex RGB.
   */
  colour?: string | null;
  /**
   * The end of its period; left out for a single time.
   */
  end?: string | null;
  /**
   * A narrative entry's type, in its source's words.
   */
  entry_type?: string | null;
  /**
   * An annotation or track hidden on the map.
   */
  hidden?: boolean | null;
  /**
   * The narrative entry's or annotation's feature id, or fix:<track>:<time> for a fix's comment.
   */
  id: string;
  kind: TimelineEntryKindEnum;
  /**
   * Who wrote a narrative entry; an annotation's name; the track a fix comment is on; the item supplying a period of data.
   */
  source: string;
  /**
   * Its time, or the start of its period.
   */
  start: string;
  /**
   * Its text.
   */
  text?: string | null;
  /**
   * The track it belongs to: a narrative entry's track, or a fix's.
   */
  track?: string | null;
}
/**
 * One cut, as the bearing view lists it.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TmaCut".
 */
export interface TmaCut {
  /**
   * Its ambiguous twin, degrees true, where it has one.
   */
  ambiguous_bearing?: number | null;
  /**
   * The bearing recorded first, degrees true.
   */
  bearing: number;
  /**
   * The colour it is drawn in (its own, or its sensor's).
   */
  colour?: string | null;
  hidden?: boolean | null;
  /**
   * The cut's feature id.
   */
  id: string;
  label?: string | null;
  /**
   * @minItems 2
   * @maxItems 2
   */
  origin?: [number, number];
  /**
   * Its origin was worked out by Debrief (pinned when its track was split), not recorded by the source (round 3 review, 24 Oct 2026).
   */
  origin_derived?: boolean | null;
  /**
   * Which bearing the analyst kept, if resolved.
   */
  resolved?: SensorCutKeptEnum | null;
  /**
   * Its sensor's name.
   */
  sensor?: string | null;
  sensor_id: string;
  /**
   * The side of the host's course its first bearing is on, where it has a twin and the side can be told.
   */
  side?: SideEnum | null;
  time: string;
}
/**
 * What the bearing view chooses for the analyst, once (show_tma's focus): the cut at or nearest cut_time, current time moved to it; or the cuts in period as the period, the first guess's form opened if make; or, with a solution shown, the counted cut with the largest residual (largest), current time moved to it. The list then has the keyboard (the form, if opened).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TmaFocus".
 */
export interface TmaFocus {
  /**
   * Choose the cut at or nearest this time.
   */
  cut_time?: string | null;
  /**
   * Choose the cut counted in the RMS with the largest residual.
   */
  largest?: boolean | null;
  /**
   * With period, open the first guess's form (Make solution…).
   */
  make?: boolean | null;
  /**
   * Choose the cuts in this period, ends included, as the period.
   */
  period?: TimeRange | null;
}
/**
 * A TMA solution asked for (CAP-21; product owner, 24 Oct 2026), from the bearing view's form, two clicks on the map, or an agent (debrief/tma_create): the cuts to root it in (sensor_ids and a period, or cut_ids), and a first guess, either by form (a range on the first cut's bearing, a course and a speed) or by two positions (on the first cut's line and on the last's; the course and speed follow). Made as one recorded, undoable step.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TmaRequest".
 */
export interface TmaRequest {
  /**
   * The solution track's colour, lower-case hex RGB; left out, Debrief's TMA colour.
   */
  colour?: string | null;
  /**
   * The contact's name; left out, the next of "Contact 1", "Contact 2"...
   */
  contact?: string | null;
  /**
   * First guess by form: the solution's course.
   */
  course?: Angle | null;
  /**
   * Or the cuts to root it in, by feature id.
   */
  cut_ids?: string[] | null;
  /**
   * First guess by form, where the first cut is ambiguous and unresolved: which of its bearings the range is along. Left out, the one kept, else the bearing recorded first.
   */
  first_bearing?: SensorCutKeptEnum | null;
  /**
   * @minItems 2
   * @maxItems 2
   */
  first_position?: [number, number];
  /**
   * @minItems 2
   * @maxItems 2
   */
  last_position?: [number, number];
  /**
   * The solution track's name; left out, the contact's with "solution".
   */
  name?: string | null;
  /**
   * The cuts whose times fall in it, ends included, of the sensors named.
   */
  period?: TimeRange | null;
  /**
   * First guess by form: how far along the first cut's bearing, from where it was taken, the solution starts.
   */
  range?: Length | null;
  /**
   * The sensors whose cuts in the period it is rooted in.
   */
  sensor_ids?: string[] | null;
  /**
   * First guess by form: the solution's speed.
   */
  speed?: Speed | null;
}
/**
 * One rooted cut's residual: its measured bearing less the bearing from its origin to where the solution was at its time, within plus or minus 180 degrees, as legacy Doublet.calculateBearingError.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TmaResidualRow".
 */
export interface TmaResidualRow {
  /**
   * Its ambiguous twin, degrees true, where it has one.
   */
  ambiguous_bearing?: number | null;
  /**
   * The bearing recorded first, degrees true.
   */
  bearing: number;
  /**
   * The bearing from its origin to the solution at its time, along the geodesic.
   */
  calculated?: number | null;
  /**
   * The colour it is drawn in (its own, or its sensor's).
   */
  colour?: string | null;
  /**
   * Left out of the RMS error by the analyst.
   */
  excluded?: boolean | null;
  hidden?: boolean | null;
  /**
   * The cut's feature id.
   */
  id: string;
  label?: string | null;
  /**
   * Which leg of the solution it falls in, from 1.
   */
  leg?: number | null;
  /**
   * The bearing measured: the one kept, the cut's only one, or, for an ambiguous cut not yet resolved, the one nearer the solution (nearer_side), which the view says.
   */
  measured?: number | null;
  /**
   * True for an ambiguous cut not yet resolved: measured is the bearing nearer the solution, chosen afresh as it moves (product owner, 24 Oct 2026).
   */
  nearer_side?: boolean | null;
  /**
   * @minItems 2
   * @maxItems 2
   */
  origin?: [number | null, number | null];
  /**
   * Its origin was worked out by Debrief (pinned when its track was split), not recorded by the source (round 3 review, 24 Oct 2026).
   */
  origin_derived?: boolean | null;
  /**
   * An ambiguous cut not yet resolved: its other bearing (the one not measured) less calculated, degrees, within (-180, 180]. Drawn faint and never counted, so the analyst can pick a side from the plot (product owner, 25 Oct 2026).
   */
  other_residual?: number | null;
  /**
   * measured less calculated, degrees, within (-180, 180]; left out where there is none.
   */
  residual?: number | null;
  /**
   * Which bearing the analyst kept, if resolved.
   */
  resolved?: SensorCutKeptEnum | null;
  /**
   * Its sensor's name.
   */
  sensor?: string | null;
  sensor_id: string;
  /**
   * The side of the host's course its first bearing is on, where it has a twin and the side can be told.
   */
  side?: SideEnum | null;
  time: string;
  /**
   * Which of the cut's bearings measured is.
   */
  used?: SensorCutKeptEnum | null;
}
/**
 * A solution's bearing residuals (debrief/tma_residuals): a row per rooted cut in time order, and the RMS error of those counted.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TmaResiduals".
 */
export interface TmaResiduals {
  /**
   * How many residuals the RMS counts.
   */
  counted: number;
  /**
   * How many cuts are taken from an origin Debrief worked out.
   */
  derived_origins?: number | null;
  /**
   * How many cuts the analyst left out.
   */
  excluded: number;
  /**
   * How many rooted cuts are hidden on the map: left out of the residuals and the RMS until shown again (legacy's "only plot visible data"; product owner, 25 Oct 2026).
   */
  hidden?: number | null;
  /**
   * How many ambiguous cuts use the bearing nearer the solution.
   */
  nearer_side?: number | null;
  /**
   * The root mean square of the residuals counted (degrees): every rooted cut with a residual, less those left out. Left out when none is counted.
   */
  rms?: number | null;
  rows: TmaResidualRow[];
  solution_id: string;
  /**
   * How many rooted cuts give no residual: outside their host's fixes, or outside the solution's, or no longer in the plot.
   */
  without: number;
}
/**
 * A sensor whose cuts the bearing view can list.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TmaSensorRow".
 */
export interface TmaSensorRow {
  /**
   * How many of them are still ambiguous.
   */
  ambiguous?: number | null;
  colour?: string | null;
  /**
   * How many cuts it has.
   */
  cuts: number;
  /**
   * The name of the track carrying it.
   */
  host?: string | null;
  id: string;
  name: string;
}
/**
 * A TMA solution in the plot, as the bearing view lists it and draws it.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TmaSolutionRow".
 */
export interface TmaSolutionRow {
  colour?: string | null;
  contact: string;
  /**
   * How many cuts it is rooted in.
   */
  cuts: number;
  id: string;
  leg_starts?: string[] | null;
  name: string;
  period: TimeRange;
  /**
   * Its fixes' times, for the view to place it as a drag moves it.
   */
  times?: string[] | null;
}
/**
 * What the host sends the bearing view (show_tma): the plot's sensors and solutions; the cuts of the sensor chosen, in time order; and, for the solution shown, its residuals.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TmaView".
 */
export interface TmaView {
  cuts?: TmaCut[] | null;
  /**
   * Something to choose in the view once, as a command or a walkthrough's step asks (CAP-25): a cut, a period and its first guess, or the cut with the largest residual. Not kept: the view shows it and the analyst carries on from there.
   */
  focus?: TmaFocus | null;
  /**
   * Which plot is open, as its host knows it.
   */
  plot_id?: string | null;
  /**
   * An earlier revision is shown read-only, so nothing can be changed.
   */
  read_only?: boolean | null;
  residuals?: TmaResiduals | null;
  /**
   * The sensor whose cuts are listed.
   */
  sensor_id?: string | null;
  sensors?: TmaSensorRow[] | null;
  /**
   * The solution shown: the one selected on the map or in the Outline, or chosen in the view.
   */
  solution_id?: string | null;
  solutions?: TmaSolutionRow[] | null;
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
  modified_features?:
    | (
        | TrackFeature
        | AnnotationFeature
        | SensorObservationsFeature
        | SensorFeature
        | SensorCutFeature
        | NarrativeFeature
      )[]
    | null;
  named_sets?: NamedSet[] | null;
  new_features?:
    | (
        | TrackFeature
        | AnnotationFeature
        | SensorObservationsFeature
        | SensorFeature
        | SensorCutFeature
        | NarrativeFeature
      )[]
    | null;
  non_spatial?: NonSpatialResult[] | null;
  state_change?: SharedStateChange | null;
}
/**
 * The Tote at one time: the primary's own measures, and each secondary's measures relative to the primary and its own, as debrief/tote returns them and the Tote view shows them.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ToteResult".
 */
export interface ToteResult {
  group: MeasureGroup;
  /**
   * The definitions of the group's measures, in its order.
   */
  measures: MeasureDefinition[];
  /**
   * What the analyst should know about the Tote as a whole, such as a measure group chosen that this plot's study does not have (core is shown instead).
   */
  note?: string | null;
  primary?: ToteRow | null;
  /**
   * One per secondary, in the order chosen.
   */
  rows: ToteRow[];
  /**
   * The time the values are for.
   */
  time: string;
}
/**
 * One track in the Tote at current time.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ToteRow".
 */
export interface ToteRow {
  /**
   * The track's colour, lower-case hex, to key the row to the map.
   */
  colour?: string | null;
  name?: string | null;
  /**
   * Why there are no values, for the analyst, such as "Starts 09:30:00Z".
   */
  note?: string | null;
  status: ToteRowStatusEnum;
  /**
   * The track's feature id.
   */
  track: string;
  values?: MeasureValue[] | null;
}
/**
 * A track the analyst can put in the Tote, as the Tote view lists them.
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "ToteTrack".
 */
export interface ToteTrack {
  colour?: string | null;
  id: string;
  name: string;
}
/**
 * A track moved, rotated, sheared or stretched by hand, as the map, a form or an agent describes it (CAP-01, CAP-02, CAP-21): one recorded, undoable step in the plot's history (SUB-19). Geodesic: a move takes every fix in the period the same range along the same bearing, each along its own geodesic; a rotation keeps each fix's range from the pivot and turns its bearing from the pivot by the angle. A shear and a stretch hold one end of the period (the anchor) and work in the azimuthal equidistant frame about it, where a geodesic through the anchor is a straight line: a shear adds to each fix the dragged end's displacement times the fix's fraction of the time from the anchor to the dragged end; a stretch scales each fix's range from the anchor, keeping its bearing from it. Either way a straight, steady leg stays a straight, steady leg. Fixes outside the period stay where they are, so the joins jump. A single fix moved (move_fix) goes where it is told, alone: its neighbours, its time and its recorded course and speed stay. set_plotting_mode with plotting_mode dr plots the whole track by dead reckoning, each fix placed from the one before by that fix's recorded course and speed, from the track's first fix; with otg it puts the fixes back where they were logged, after the analyst confirms losing any change made while plotted by dead reckoning (discard_dr_changes).
 *
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "TrackEdit".
 */
export interface TrackEdit {
  action: TrackEditActionEnum;
  /**
   * The end of the period a shear or a stretch holds fixed.
   */
  anchor?: TrackEditAnchorEnum | null;
  /**
   * How far a rotation turns the fixes about the pivot; positive is clockwise.
   */
  angle?: Angle | null;
  /**
   * Which way a move takes each fix, a shear drags the end that is not held, or a single fix is moved, true, clockwise from north.
   */
  bearing?: Angle | null;
  /**
   * The course made good a shear gives the period: the true bearing, at its first fix, of the geodesic from its first fix to its last. With speed, instead of a distance and a bearing for the dragged end.
   */
  course?: Angle | null;
  /**
   * set_plotting_mode to otg only: plot the track over the ground although it was changed while plotted by dead reckoning, losing those changes, as the analyst confirmed (decision, product owner, 14 Oct 2026). Without it such a change is refused, saying why.
   */
  discard_dr_changes?: boolean | null;
  /**
   * How far a move takes each fix, a shear drags the end that is not held, or a single fix is moved.
   */
  distance?: Length | null;
  /**
   * The time of the one fix a move_fix moves: the fix is found by its time, as a mark is (where two fixes share a time, the first).
   */
  fix_time?: string | null;
  /**
   * The fixes to change: those whose times fall in it, ends included. Left out, the whole track.
   */
  period?: TimeRange | null;
  /**
   * [longitude, latitude] of the position a rotation turns about. Left out, the fix nearest current time in the period, or the period's first fix.
   *
   * @minItems 2
   * @maxItems 2
   */
  pivot?: [number, number] | null;
  /**
   * How set_plotting_mode plots the track, over the ground or by dead reckoning.
   */
  plotting_mode?: PlottingModeEnum | null;
  /**
   * [longitude, latitude] a move_fix puts the fix at, instead of a distance and a bearing from where it is.
   *
   * @minItems 2
   * @maxItems 2
   */
  position?: [number, number] | null;
  /**
   * The speed made good a shear or a stretch gives the period: the geodesic range from its first fix to its last over the time between.
   */
  speed?: Speed | null;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "UserConfig".
 */
export interface UserConfig {
  /**
   * Version of this file's layout: 1 while it holds only stores; 2 once it holds track_import_mode; 3 once it holds narrative_import. An earlier Debrief cannot read a later layout.
   */
  config_version: number;
  /**
   * The analyst's last answers to the questions asked before a Word or PDF narrative is read into a plot, one set for each dialect, so they are offered again next time and confirmed with one key (CAP-19; product owner, 15 Oct 2026). User state, kept here and never in a catalogue or a plot file; importers are given the answers.
   */
  narrative_import?: NarrativeImportAnswers[] | null;
  /**
   * Known stores, in the order the analyst sees them (SUB-17).
   */
  stores: KnownStore[];
  /**
   * How tracks imported are plotted, over the ground or by dead reckoning: ask (the default, also when left out), or otg or dr once the analyst chose "Use this choice for future imports" (CAP-01). The analyst may clear it, to be asked again.
   */
  track_import_mode?: TrackImportModeEnum | null;
}
/**
 * This interface was referenced by `DebriefSchemaDefinitions`'s JSON-Schema
 * via the `definition` "WebviewMessage".
 */
export interface WebviewMessage {
  /**
   * An annotation as the form describes it (show_annotation_form, save_annotation), as drawn on the map (annotation_drawn), or as changed on the map (edit_annotation).
   */
  annotation?: AnnotationSpec | null;
  /**
   * How tracks outside the time window are drawn (CAP-29).
   */
  context_tracks?: ContextTracksEnum | null;
  /**
   * The open plot's coverage (show_coverage).
   */
  coverage?: CoverageReport | null;
  /**
   * Current time from shared state, which a tool form offers for its time fields.
   */
  current_time?: string | null;
  /**
   * The rooted cuts left out of a solution's RMS error, or counted again (tma_exclude).
   */
  cut_ids?: string[] | null;
  /**
   * Whether the cuts are left out (tma_exclude).
   */
  excluded?: boolean | null;
  /**
   * The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.
   */
  feature_id?: string | null;
  /**
   * The time of the fix the analyst chose on the map (fix_chosen).
   */
  fix_time?: string | null;
  /**
   * The times of the fixes the map rings (show_fixes).
   */
  fix_times?: string[] | null;
  /**
   * How many of the plot's features are hidden on the map (SUB-22), so the map can say so.
   */
  hidden_count?: number | null;
  /**
   * The image the map drew (image_rendered).
   */
  image?: RenderedImage | null;
  /**
   * What image to draw, and how (export_image).
   */
  image_request?: ImageRequest | null;
  /**
   * The item, at the revision the analyst saw (take_asked, dismiss_asked).
   */
  item_revision?: ItemRevision | null;
  /**
   * Which of an ambiguous cut's bearings the analyst clicked, to keep (resolve_asked).
   */
  keep?: AmbiguityKeepEnum | null;
  kind: WebviewMessageKindEnum;
  /**
   * Whether the source is the track's platform (link_changed).
   */
  linked?: boolean | null;
  message?: string | null;
  /**
   * The analyst's setting that shows faint context tracks as visible, so the time controller can say so.
   */
  minimum_context_contrast?: boolean | null;
  /**
   * A narrative entry as the Timeline's form describes it (save_narrative).
   */
  narrative?: NarrativeSpec | null;
  /**
   * Whether the map shows the narrative entry current time is at beside its track (show_timeline, narrative_on_map_changed): the plot's PlotView.narrative_on_map; left out means it does.
   */
  narrative_on_map?: boolean | null;
  parameters?: ParameterValue[] | null;
  /**
   * Whether current time is playing (playing_changed).
   */
  playing?: boolean | null;
  plot?: DebriefFeatureCollection | null;
  /**
   * Which plot is open, as its host knows it (show_timeline): a list read again for the same plot keeps the reader's place; another plot is read from current time.
   */
  plot_id?: string | null;
  plot_title?: string | null;
  /**
   * A track as a change would leave it, one position per fix, drawn beside it until the analyst applies or cancels the change (show_fixes).
   */
  preview?: LineStringGeometry | null;
  result?: ToolResult | null;
  result_title?: string | null;
  /**
   * The plot shown is an earlier revision, read-only (show_plot).
   */
  revision_shown?: RevisionShown | null;
  /**
   * The time window as saved in the plot, so the time controller can say when the window shown differs from it (CAP-28).
   */
  saved_window?: TimeRange | null;
  selected_names?: string[] | null;
  selection?: Selection | null;
  /**
   * A track in a catalogue item (source_chosen, link_changed).
   */
  source?: SourceTrackRef | null;
  time?: TimeState | null;
  /**
   * The plot's period, so times can be entered as the analyst reads them (show_form) and the time window set within it (show_time); the time window to save (window_changed); or the period whose source the analyst chose (source_chosen).
   */
  time_range?: TimeRange | null;
  /**
   * The Timeline's rows, in its order (show_timeline).
   */
  timeline_entries?: TimelineEntry[] | null;
  /**
   * The narrative entry current time is at, to show on the map beside its track (set_narrative).
   */
  timeline_entry?: TimelineEntry | null;
  /**
   * The plot's tracks, which a narrative entry can belong to (show_timeline).
   */
  timeline_tracks?: ToteTrack[] | null;
  /**
   * What the bearing view shows (show_tma).
   */
  tma?: TmaView | null;
  /**
   * A TMA solution asked for (tma_create, tma_guess, tma_guessed).
   */
  tma_request?: TmaRequest | null;
  tool?: ToolDeclaration | null;
  tool_name?: string | null;
  /**
   * The Tote's values at current time (show_tote).
   */
  tote?: ToteResult | null;
  /**
   * The plot's tracks, which the analyst can choose from for the Tote (show_tote).
   */
  tote_tracks?: ToteTrack[] | null;
  /**
   * Which tracks the Tote compares, as saved in the plot (show_tote, set_tote) or as the analyst chose (tote_changed).
   */
  tote_view?: ToteView | null;
  /**
   * How the analyst moved, rotated, sheared or stretched a track, or moved one of its fixes, on the map (edit_track).
   */
  track_edit?: TrackEdit | null;
  viewport?: Viewport | null;
}
