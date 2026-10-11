/**
 * Times as an analyst types them (SUB-04): the forms the language guide writes,
 * not just ISO. Shared by the tool form (to echo what it understood) and the host
 * (which converts to the stored form before the tool service sees it).
 *
 *   2023-06-15T09:30:00Z, 2023-06-15T09:30:00.000Z   ISO, UTC
 *   15 Jun 2023 09:30:05Z                              date and time
 *   150930Z JUN 23                                     date-time group
 *   09:30Z, 09:30:05Z, 0930Z                           time of day, on the plot's day
 */
import type { ParameterValue, TimeRange, ToolDeclaration } from "@debrief/schemas";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function utc(year: number, month: number, day: number, h: number, m: number, s: number): number | undefined {
  if (month < 0 || month > 11 || day < 1 || day > 31 || h > 23 || m > 59 || s >= 60) return undefined;
  const ms = Date.UTC(year, month, day, h, m, Math.floor(s), Math.round((s % 1) * 1000));
  return new Date(ms).getUTCDate() === day ? ms : undefined;
}

const fullYear = (yy: number) => (yy < 50 ? 2000 + yy : 1900 + yy);

/** Epoch milliseconds, or undefined if the text is not a time Debrief understands. */
export function parseTime(text: string, range?: TimeRange): number | undefined {
  const t = text.trim().toUpperCase();
  let m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d(?:\.\d{1,3})?))?Z$/.exec(t);
  if (m) return utc(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  m = /^(\d{1,2}) ([A-Z]{3}) (\d{4}) (\d\d):(\d\d)(?::(\d\d))?Z$/.exec(t);
  if (m && MONTHS.includes(m[2])) return utc(+m[3], MONTHS.indexOf(m[2]), +m[1], +m[4], +m[5], +(m[6] ?? 0));
  m = /^(\d\d)(\d\d)(\d\d)Z ([A-Z]{3}) (\d\d)$/.exec(t);
  if (m && MONTHS.includes(m[4])) return utc(fullYear(+m[5]), MONTHS.indexOf(m[4]), +m[1], +m[2], +m[3], 0);
  m = /^(\d\d):?(\d\d)(?::(\d\d))?Z$/.exec(t);
  if (m && range) {
    // A time of day means the day the plot covers. A plot that spans midnight
    // takes the first day on which that time falls inside it.
    const start = new Date(range.start);
    for (let day = 0; day < 3; day++) {
      const ms = utc(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + day, +m[1], +m[2], +(m[3] ?? 0));
      if (ms !== undefined && ms >= Date.parse(range.start) && ms <= Date.parse(range.end)) return ms;
    }
    return utc(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), +m[1], +m[2], +(m[3] ?? 0));
  }
  return undefined;
}

export const TIME_EXAMPLES = "09:30Z, 15 Jun 2023 09:30:00Z or 150930Z JUN 23";

/** The tool's time values converted to the stored form, or a problem to show. */
export function resolveTimes(
  tool: ToolDeclaration,
  parameters: ParameterValue[],
  opened: { item: { properties: { start_datetime?: string | null; end_datetime?: string | null; datetime?: string | null } } },
): ParameterValue[] | string {
  const p = opened.item.properties;
  const start = p.start_datetime ?? p.datetime ?? undefined;
  const end = p.end_datetime ?? p.datetime ?? undefined;
  const range = start && end ? { start, end } : undefined;
  const out: ParameterValue[] = [];
  for (const value of parameters) {
    const declared = tool.parameters?.find((d) => d.name === value.name);
    if (declared?.kind === "time" && typeof value.value === "string") {
      const ms = parseTime(value.value, range);
      if (ms === undefined) return `${declared.title} must be a UTC time, such as ${TIME_EXAMPLES}`;
      out.push({ name: value.name, value: new Date(ms).toISOString() });
    } else {
      out.push(value);
    }
  }
  return out;
}
