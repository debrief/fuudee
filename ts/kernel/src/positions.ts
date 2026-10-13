/**
 * Reading positions the analyst types (SUB-04): the TypeScript twin of
 * debrief_kernel.formatting.parse_position, held to the same shared vectors
 * (schemas/vectors/positions.json).
 *
 * The inverse of formatPosition: any of the notations Debrief writes (decimal
 * degrees, degrees and decimal minutes, degrees, minutes and seconds), with or
 * without the symbols, with the hemisphere letter before or after each half;
 * or two signed decimal numbers, latitude first.
 */
import type { Position } from "./formatting.js";

export const POSITION_EXAMPLE = "50°20.120'N 004°07.210'W";

/** A position that cannot be read, with what to type instead. */
export class PositionError extends Error {}

const SYMBOLS = /[°º˚'′’"″”,;]/g;
const TOKEN = /[NSEW]|[+-]?\d+(?:\.\d+)?|[+-]?\.\d+/g;
const unknown = () => new PositionError(`Not a position Debrief understands; type one like ${POSITION_EXAMPLE}`);

/** A position typed by the analyst. Throws PositionError, in plain words, if it cannot be read. */
export function parsePosition(text: string): Position {
  const normal = text.toUpperCase().replace(SYMBOLS, " ");
  const tokens = normal.match(TOKEN) ?? [];
  if (!tokens.length || tokens.join("") !== normal.replace(/\s+/g, "")) throw unknown();
  const letters = tokens.filter((t) => "NSEW".includes(t) && t.length === 1);
  if (!letters.length) {
    if (tokens.length !== 2) throw new PositionError(`Give latitude and longitude, such as ${POSITION_EXAMPLE} or 50.335, -4.120`);
    return checked(Number(tokens[0]), Number(tokens[1]));
  }
  if (letters.length !== 2) throw new PositionError(`Give one hemisphere letter for each half, as in ${POSITION_EXAMPLE}`);
  const values: { lat?: number; lon?: number } = {};
  for (const [letter, numbers] of halves(tokens)) {
    if (numbers.some((n) => n.startsWith("+") || n.startsWith("-"))) {
      throw new PositionError("Use N, S, E or W, not a sign, with degrees and minutes");
    }
    const axis = letter === "N" || letter === "S" ? "lat" : "lon";
    if (values[axis] !== undefined) throw new PositionError("Give one latitude (N or S) and one longitude (E or W)");
    const magnitude = degrees(numbers);
    values[axis] = letter === "S" || letter === "W" ? -magnitude : magnitude;
  }
  return checked(values.lat!, values.lon!);
}

const isLetter = (t: string) => t.length === 1 && "NSEW".includes(t);

/** Split tokens into two (letter, numbers) halves. Letters lead or trail, consistently. */
function halves(tokens: string[]): [string, string[]][] {
  const leading = isLetter(tokens[0]);
  const out: [string, string[]][] = [];
  let numbers: string[] = [];
  let letter: string | undefined;
  for (const token of tokens) {
    if (isLetter(token)) {
      if (leading) {
        if (letter !== undefined) out.push([letter, numbers]);
        letter = token;
        numbers = [];
      } else {
        out.push([token, numbers]);
        numbers = [];
      }
    } else {
      numbers.push(token);
    }
  }
  if (leading && letter !== undefined) out.push([letter, numbers]);
  else if (numbers.length) throw new PositionError(`Put each hemisphere letter after its numbers, as in ${POSITION_EXAMPLE}`);
  if (out.length !== 2 || out.some(([, n]) => n.length < 1 || n.length > 3)) throw unknown();
  return out;
}

function degrees(numbers: string[]): number {
  if (numbers.slice(0, -1).some((n) => n.includes("."))) throw new PositionError("Only the last number of each half may have decimals");
  const parts = numbers.map(Number);
  if (parts.slice(1).some((v) => v >= 60)) throw new PositionError("Minutes and seconds must be less than 60");
  let value = parts[0];
  if (parts.length > 1) value += parts[1] / 60;
  if (parts.length > 2) value += parts[2] / 3600;
  return value;
}

function checked(latitude: number, longitude: number): Position {
  if (!(latitude >= -90 && latitude <= 90)) throw new PositionError("Latitude must be within 90° of the equator");
  if (!(longitude >= -180 && longitude <= 180)) throw new PositionError("Longitude must be within 180° of Greenwich");
  return { longitude, latitude };
}
