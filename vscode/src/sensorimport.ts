/**
 * Reading a .dsf or REP file's sensor lines into the open plot (CAP-22): what to ask the
 * analyst, from what the file holds (debrief/preview_sensor). Legacy Debrief asked which
 * track carries a sensor whose track it could not find ("Sensor track not found"); so do
 * we, once per track name, and say first if the file was read into the plot before.
 * Shared by VS Code and the playground, so both ask the same.
 */
import type { EarlierRead } from "./narrativeimport.js";

/** One sensor the file holds: its track name as the lines give it, its cuts, and the plot's track that would carry it. */
export interface SensorInFile {
  track: string;
  sensor: string;
  /** Its name in the plot: the sensor's, or the file's for UNKNOWN. */
  name: string;
  /** Cuts with a bearing; lines without one are not read. */
  cuts: number;
  ambiguous: number;
  lines: number;
  start: string;
  end: string;
  /** The plot's track that carries it, matched by name as legacy matched it; null: the analyst is asked. */
  host_track_id: string | null;
  host: string | null;
}

/** What a file's sensor lines hold, said before they are read in. */
export interface SensorPreview {
  name: string;
  sensors: SensorInFile[];
  cuts: number;
  /** Position lines: the file holds a track too, imported as a plot. */
  fixes: number;
  tracks: { id: string; name: string }[];
  omitted: string[];
  notes: string[];
  content_hash: string;
  earlier: EarlierRead[];
}

/** The track names the plot has no track for, each asked once: which of the plot's tracks carries it. */
export function hostsToAsk(preview: SensorPreview): { track: string; sensors: SensorInFile[] }[] {
  const asked = new Map<string, SensorInFile[]>();
  for (const sensor of preview.sensors) {
    if (sensor.host_track_id || !sensor.cuts) continue;
    asked.set(sensor.track, [...(asked.get(sensor.track) ?? []), sensor]);
  }
  return [...asked].map(([track, sensors]) => ({ track, sensors }));
}

/** A sensor in the file in a list: "Towed array on BLUE ONE: 132 cuts, 40 ambiguous". */
export function describeSensorInFile(sensor: SensorInFile): string {
  const cuts = `${sensor.cuts.toLocaleString("en-GB")} ${sensor.cuts === 1 ? "cut" : "cuts"}`;
  return `${sensor.name} on ${sensor.host ?? sensor.track}: ${cuts}${sensor.ambiguous ? `, ${sensor.ambiguous.toLocaleString("en-GB")} ambiguous` : ""}`;
}

/** What was read in, as the host says it after the step. */
export function sensorReadSummary(done: { sensors: string[]; cuts: number }, fileName: string): string {
  const sensors = done.sensors.length === 1 ? "1 sensor" : `${done.sensors.length} sensors`;
  return `${done.cuts.toLocaleString("en-GB")} ${done.cuts === 1 ? "cut" : "cuts"} of ${sensors} read from ${fileName}.`;
}
