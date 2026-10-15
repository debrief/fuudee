/**
 * Unit conversion (SUB-02), mirroring debrief_kernel.units operation for
 * operation so conversions give bit-identical results in both languages.
 */

/** Factor to the kind's base unit: metres, metres per second, degrees, seconds, degrees per minute. */
export const FACTORS = {
  length: { m: 1.0, km: 1000.0, "[nmi_i]": 1852.0, "[yd_i]": 0.9144, "[ft_i]": 0.3048 },
  speed: { "m/s": 1.0, "[kn_i]": 1852.0 / 3600.0, "km/h": 1000.0 / 3600.0 },
  angle: { deg: 1.0, rad: 180.0 / Math.PI },
  duration: { ms: 0.001, s: 1.0, min: 60.0, h: 3600.0 },
  angular_rate: { "deg/min": 1.0, "deg/s": 60.0, "rad/s": (60.0 * 180.0) / Math.PI },
} as const;

export type QuantityKind = keyof typeof FACTORS;

export interface Quantity {
  value: number;
  unit: string;
}

export class IncompatibleUnitsError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "IncompatibleUnitsError";
  }
}

export function kindOf(unit: string): QuantityKind {
  for (const kind of Object.keys(FACTORS) as QuantityKind[]) {
    if (unit in FACTORS[kind]) return kind;
  }
  throw new RangeError(`unknown unit ${JSON.stringify(unit)}`);
}

function factor(kind: QuantityKind, unit: string): number {
  return (FACTORS[kind] as Record<string, number>)[unit];
}

export function convert(quantity: Quantity, unit: string): Quantity {
  const kind = kindOf(quantity.unit);
  if (kindOf(unit) !== kind) {
    throw new IncompatibleUnitsError(`cannot convert ${kind} to ${kindOf(unit)}`);
  }
  const base = quantity.value * factor(kind, quantity.unit);
  return { value: base / factor(kind, unit), unit };
}

/** Wrap to [0, 360), as Python's math.fmod-based normalise_bearing. */
export function normaliseBearing(degrees: number): number {
  let wrapped = degrees % 360.0;
  if (wrapped < 0) wrapped += 360.0;
  return wrapped === 360.0 ? 0.0 : wrapped;
}

/** Signed smallest difference a - b, in (-180, 180], handling wrap at 360, as Python's bearing_difference (NFR-04). */
export function bearingDifference(a: number, b: number): number {
  let diff = (a - b) % 360.0;
  if (diff <= -180.0) diff += 360.0;
  else if (diff > 180.0) diff -= 360.0;
  return diff;
}
