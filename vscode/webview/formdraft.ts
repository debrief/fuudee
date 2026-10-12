/** What a tool form's fields start with, kept free of React so it can be tested. */
import { DEFAULT_SETTINGS, FACTORS, formatTime } from "@debrief/kernel";
import type { ParameterDeclaration } from "@debrief/schemas";

export type Draft = Record<string, { text: string; unit?: string; checked?: boolean }>;

/** A time as the form shows it: the date and time an analyst reads, which the form also accepts. */
export const showTime = (ms: number) => formatTime(ms, { ...DEFAULT_SETTINGS, time_style: "date_time" });

/** A field's starting value: the tool's default, or for a time with none, current time (SUB-26). */
export function initial(param: ParameterDeclaration, currentTime?: string): Draft[string] {
  const d = param.default as unknown;
  if (param.kind === "boolean") return { text: "", checked: d === true };
  if (param.kind === "quantity" && d && typeof d === "object") {
    const q = d as { value: number; unit: string };
    return { text: String(q.value), unit: q.unit };
  }
  if (param.kind === "quantity") return { text: "", unit: Object.keys(FACTORS[param.quantity_kind as keyof typeof FACTORS])[0] };
  if (param.kind === "time" && (d === undefined || d === null) && currentTime) return { text: showTime(Date.parse(currentTime)) };
  return { text: d === undefined || d === null ? "" : String(d) };
}
