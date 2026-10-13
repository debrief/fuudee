/**
 * How the map draws an annotation (CAP-03): its own appearance, where the
 * analyst gave one, and Debrief's defaults for the rest. Kept free of Leaflet
 * so it can be tested.
 *
 * Defaults: the annotation colour, dashed, so that nothing a tool draws is
 * mistaken for a track; an area faintly tinted; labels small. An analyst may
 * draw an annotation solid: it still has no direction ticks or end dots, and
 * is still labelled, which a track never is along its length.
 */
import type { AnnotationAppearance, AnnotationProperties, AnnotationSpec, DebriefFeatureCollection, LabelPositionEnum } from "@debrief/schemas";
import { DATA_COLOURS } from "./palette.js";

export type Shape = "line" | "area" | "circle" | "ellipse" | "label" | "marker" | "note";

export interface Look {
  colour: string;
  weight: number;
  /** Leaflet's dashArray, or undefined for a solid line. */
  dashArray?: string;
  lineCap: "round" | "butt";
  fillColour: string;
  fillOpacity: number;
  labelSize: number;
  labelPosition: LabelPositionEnum;
}

export const DASHES: Record<string, string | undefined> = { solid: undefined, dashed: "6 5", dotted: "1 4" };
export const DEFAULT_LABEL_SIZE = 11;

/** How an annotation is drawn: its own shape, or the one its geometry implies. */
export function shapeOf(properties: Pick<AnnotationProperties, "shape" | "style">, geometryType: string | undefined): Shape {
  if (properties.shape) return properties.shape;
  if (!geometryType) return "note";
  if (geometryType === "LineString") return "line";
  if (geometryType === "Polygon") return "area";
  return properties.style === "label" ? "label" : "marker";
}

const FILLED: Shape[] = ["area", "circle", "ellipse"];

/** The look of an annotation of this shape, with this appearance. */
export function lookOf(shape: Shape, appearance?: AnnotationAppearance | null): Look {
  const a = appearance ?? {};
  const colour = a.colour ?? DATA_COLOURS.annotation;
  const style = a.line_style ?? "dashed";
  const filled = FILLED.includes(shape);
  return {
    colour,
    weight: a.line_width ?? (filled ? 1.5 : 2),
    dashArray: DASHES[style],
    lineCap: style === "dotted" ? "round" : "butt",
    fillColour: a.fill_colour ?? colour,
    fillOpacity: filled ? (a.fill_opacity ?? (a.fill_colour ? 0.25 : 0.05)) : 0,
    labelSize: a.label_size ?? DEFAULT_LABEL_SIZE,
    labelPosition: a.label_position ?? (shape === "line" ? "centre" : filled ? "above" : "right"),
  };
}

/** Where Leaflet puts a permanent label for a label position, and how far from its anchor. */
export function labelPlacement(position: LabelPositionEnum): { direction: "top" | "bottom" | "left" | "right" | "center"; offset: [number, number] } | undefined {
  switch (position) {
    case "above":
      return { direction: "top", offset: [0, -4] };
    case "below":
      return { direction: "bottom", offset: [0, 4] };
    case "left":
      return { direction: "left", offset: [-6, 0] };
    case "right":
      return { direction: "right", offset: [6, 0] };
    case "centre":
      return { direction: "center", offset: [0, 0] };
    default:
      return undefined;
  }
}

type AnnotationFeature = Extract<DebriefFeatureCollection["features"][number], { properties: { kind: "annotation" } }>;

/**
 * An annotation read back into the description its properties form shows, as
 * debrief_stac.annotations.spec_of does: an area's corners without the closing
 * repeat, a circle's or an ellipse's centre rather than its polygon.
 */
export function specOfFeature(feature: AnnotationFeature): AnnotationSpec {
  const props = feature.properties;
  const geometry = feature.geometry;
  const shape = shapeOf(props, geometry?.type);
  let positions: number[][] | undefined;
  if ((shape === "circle" || shape === "ellipse") && props.centre) positions = [[...props.centre]];
  else if (geometry?.type === "LineString") positions = (geometry.coordinates as number[][]).map((p) => [...p]);
  else if (geometry?.type === "Polygon") {
    const ring = (geometry.coordinates as number[][][])[0].map((p) => [...p]);
    const last = ring[ring.length - 1];
    const closed = ring.length > 1 && ring[0][0] === last[0] && ring[0][1] === last[1];
    positions = closed ? ring.slice(0, -1) : ring;
  } else if (geometry?.type === "Point") positions = [[...(geometry.coordinates as number[])]];
  const spec: AnnotationSpec = { shape, name: props.name };
  if (props.text) spec.text = props.text;
  if (positions?.length) spec.positions = positions as AnnotationSpec["positions"];
  for (const key of ["radius", "semi_major", "semi_minor", "orientation", "time", "time_range", "appearance"] as const) {
    if (props[key] !== undefined && props[key] !== null) (spec as unknown as Record<string, unknown>)[key] = props[key];
  }
  return spec;
}

/** The text a label shows on the map: a label annotation's text, else its name. */
export function labelText(shape: Shape, properties: Pick<AnnotationProperties, "name" | "text">): string {
  return shape === "label" && properties.text ? properties.text : properties.name;
}
