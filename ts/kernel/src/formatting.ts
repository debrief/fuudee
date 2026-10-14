/**
 * Display formatting (SUB-04): the TypeScript twin of debrief_kernel.formatting.
 *
 * Views format values only through this module or the Python service. Both
 * read the same FormatSettings (generated from LinkML) and are held to the
 * shared vectors in schemas/vectors/formatting.json.
 */
import type { FormatSettings } from "@debrief/schemas";
import { bearingDifference, convert, kindOf, normaliseBearing, type Quantity } from "./units.js";

export type { FormatSettings };

export const UNIT_LABELS: Record<string, string> = {
  m: "m",
  km: "km",
  "[nmi_i]": "nmi",
  "[yd_i]": "yd",
  "[ft_i]": "ft",
  "m/s": "m/s",
  "[kn_i]": "kn",
  "km/h": "km/h",
  deg: "°",
  rad: "rad",
  ms: "ms",
  s: "s",
  min: "min",
  h: "h",
  "deg/min": "°/min",
  "deg/s": "°/s",
  "rad/s": "rad/s",
};

/** Must equal schemas/vectors/format-defaults.json; a test checks. */
export const DEFAULT_SETTINGS: FormatSettings = {
  length_unit: "[nmi_i]",
  length_decimals: 2,
  speed_unit: "[kn_i]",
  speed_decimals: 1,
  angle_decimals: 1,
  duration_unit: "min",
  duration_decimals: 1,
  position_notation: "dm",
  position_decimals: 3,
  time_style: "time",
  show_milliseconds: false,
  time_zone: "UTC",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface Position {
  longitude: number;
  latitude: number;
}

/** Round half away from zero on the exact stored value; a value that rounds to zero has no sign. */
export function fixed(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

export function formatQuantity(quantity: Quantity, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const kind = kindOf(quantity.unit);
  if (kind === "angle") return `${fixed(convert(quantity, "deg").value, settings.angle_decimals)}°`;
  // Always degrees per minute, the analysts' standard for bearing rate.
  if (kind === "angular_rate") return `${fixed(convert(quantity, "deg/min").value, settings.angle_decimals)}°/min`;
  const [unit, decimals] = {
    length: [settings.length_unit, settings.length_decimals],
    speed: [settings.speed_unit, settings.speed_decimals],
    duration: [settings.duration_unit, settings.duration_decimals],
  }[kind] as [string, number];
  return `${fixed(convert(quantity, unit).value, decimals)} ${UNIT_LABELS[unit]}`;
}

/**
 * A range between two vessels: as formatQuantity, except that where the analyst's lengths
 * are in nautical miles, a range under 1 nmi is in whole yards, "60 yd", as analysts call
 * close ranges (decision, 14 Oct 2026); from 1 nmi, nautical miles.
 */
export function formatRange(distance: Quantity, settings: FormatSettings = DEFAULT_SETTINGS): string {
  if (settings.length_unit === "[nmi_i]" && convert(distance, "[nmi_i]").value < 1.0) {
    return `${fixed(convert(distance, "[yd_i]").value, 0)} ${UNIT_LABELS["[yd_i]"]}`;
  }
  return formatQuantity(distance, settings);
}

export function formatBearing(bearing: Quantity, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const decimals = settings.angle_decimals;
  let text = fixed(normaliseBearing(convert(bearing, "deg").value), decimals);
  if (Number(text) >= 360.0) text = fixed(0.0, decimals);
  const width = 3 + (decimals ? decimals + 1 : 0);
  return `${text.padStart(width, "0")}°T`;
}

/**
 * A bearing from a vessel's head, three figures, red to port and green to starboard:
 * "R045.0°", "G120.0°"; dead ahead "000.0°" and dead astern "180.0°", with no side.
 */
export function formatRelativeBearing(bearing: Quantity, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const decimals = settings.angle_decimals;
  const signed = bearingDifference(convert(bearing, "deg").value, 0);
  const text = fixed(Math.abs(signed), decimals);
  const width = 3 + (decimals ? decimals + 1 : 0);
  if (Number(text) === 0 || Number(text) >= 180) return `${fixed(Number(text) === 0 ? 0 : 180, decimals).padStart(width, "0")}°`;
  return `${signed < 0 ? "R" : "G"}${text.padStart(width, "0")}°`;
}

/** Feet where the analyst's lengths are in feet or yards; else metres; one decimal (no depth setting yet). */
const IMPERIAL = ["[ft_i]", "[yd_i]"];
export const DEPTH_DECIMALS = 1;

/** A depth below the surface: "20.0 m", or "65.6 ft" where lengths are imperial. */
export function formatDepth(depth: Quantity, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const unit = IMPERIAL.includes(settings.length_unit) ? "[ft_i]" : "m";
  return `${fixed(convert(depth, unit).value, DEPTH_DECIMALS)} ${UNIT_LABELS[unit]}`;
}

function scaled(value: number, places: number): string {
  const unit = 10 ** places;
  const whole = Math.floor(value / unit);
  const fraction = value % unit;
  return places ? `${pad(whole, 2)}.${pad(fraction, places)}` : pad(whole, 2);
}

function formatCoordinate(value: number, hemispheres: string, width: number, settings: FormatSettings): string {
  const hemisphere = value >= 0 ? hemispheres[0] : hemispheres[1];
  const magnitude = Math.abs(value);
  const places = settings.position_decimals;

  if (settings.position_notation === "dd") {
    const text = fixed(magnitude, places).padStart(places ? width + 1 + places : width, "0");
    return `${text}°${hemisphere}`;
  }
  if (settings.position_notation === "dm") {
    const scale = 60 * 10 ** places;
    const total = Math.floor(magnitude * scale + 0.5);
    const degrees = Math.floor(total / scale);
    return `${pad(degrees, width)}°${scaled(total % scale, places)}'${hemisphere}`;
  }
  const scale = 3600 * 10 ** places;
  const total = Math.floor(magnitude * scale + 0.5);
  const degrees = Math.floor(total / scale);
  const rest = total % scale;
  const minutes = Math.floor(rest / (60 * 10 ** places));
  const seconds = rest % (60 * 10 ** places);
  return `${pad(degrees, width)}°${pad(minutes, 2)}'${scaled(seconds, places)}"${hemisphere}`;
}

export function formatPosition(position: Position, settings: FormatSettings = DEFAULT_SETTINGS): string {
  return `${formatCoordinate(position.latitude, "NS", 2, settings)} ${formatCoordinate(position.longitude, "EW", 3, settings)}`;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  offsetMinutes: number;
}

function wallClock(epochMs: number, zone: string): WallClock {
  if (zone === "UTC") {
    const d = new Date(epochMs);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
      offsetMinutes: 0,
    };
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(new Date(epochMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const offset = /GMT(?:([+-])(\d{2}):(\d{2}))?/.exec(get("timeZoneName"));
  const offsetMinutes = offset?.[1] ? (offset[1] === "-" ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    offsetMinutes,
  };
}

function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return `UTC${sign}${hours}${rest ? `:${pad(rest, 2)}` : ""}`;
}

/** A time for display. Zulu unless the analyst chose another zone (SUB-01). */
export function formatTime(epochMs: number, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const zulu = settings.time_zone === "UTC";
  const t = wallClock(epochMs, settings.time_zone);
  const zone = zulu ? "Z" : ` ${offsetLabel(t.offsetMinutes)}`;

  if (settings.time_style === "dtg") {
    if (!zulu) throw new RangeError("a date-time group is always in Zulu time");
    return `${pad(t.day, 2)}${pad(t.hour, 2)}${pad(t.minute, 2)}Z ${MONTHS[t.month - 1].toUpperCase()} ${pad(t.year % 100, 2)}`;
  }

  let clock = `${pad(t.hour, 2)}:${pad(t.minute, 2)}:${pad(t.second, 2)}`;
  if (settings.show_milliseconds) clock += `.${pad(((epochMs % 1000) + 1000) % 1000, 3)}`;
  if (settings.time_style === "date_time") return `${t.day} ${MONTHS[t.month - 1]} ${t.year} ${clock}${zone}`;
  return `${clock}${zone}`;
}
