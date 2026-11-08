/**
 * Reading a .dsf or REP file's sensor lines into the open plot (CAP-22): what to ask the
 * analyst, from what the file holds (debrief/preview_sensor). Legacy Debrief asked which
 * track carries a sensor whose track it could not find ("Sensor track not found"); so do
 * we, once per track name, and say first if the file was read into the plot before.
 * Shared by VS Code and the playground, so both ask the same.
 */
import type { SensorInFile, SensorPreview } from "@debrief/schemas";

/**
 * One sensor the file holds, and what a file's sensor lines hold, said before they are read in
 * (debrief/preview_sensor): generated from rpc.yaml.
 */
export type { SensorInFile, SensorPreview };

/**
 * The track names to ask about, each once: those the plot has no track for, and those
 * matched only by their first six letters (to be confirmed, the matched track offered
 * first). Which of the plot's tracks carries it.
 */
export function hostsToAsk(preview: SensorPreview): { track: string; sensors: SensorInFile[]; matched?: { id: string; name: string } }[] {
  const asked = new Map<string, { track: string; sensors: SensorInFile[]; matched?: { id: string; name: string } }>();
  for (const sensor of preview.sensors) {
    if (!sensor.cuts) continue;
    if (sensor.host_track_id && sensor.matched_by !== "prefix") continue;
    const known = asked.get(sensor.track);
    if (known) known.sensors.push(sensor);
    else asked.set(sensor.track, { track: sensor.track, sensors: [sensor], ...(sensor.host_track_id && { matched: { id: sensor.host_track_id, name: sensor.host ?? sensor.host_track_id } }) });
  }
  return [...asked.values()];
}

/** The plot's tracks to choose from for a track name asked about: one matched by its first six letters first. */
export function hostChoices(preview: SensorPreview, ask: { matched?: { id: string } }): { id: string; name: string; matched: boolean }[] {
  const tracks = preview.tracks.map((t) => ({ ...t, matched: t.id === ask.matched?.id }));
  return [...tracks.filter((t) => t.matched), ...tracks.filter((t) => !t.matched)];
}

/** The question asked about a track name: which track carries it, or whether the one matched by its first six letters does. */
export function hostQuestion(ask: { track: string; matched?: { name: string } }): string {
  return ask.matched ? `${ask.track} matches ${ask.matched.name} by its first six letters only: which track carries ${ask.track}'s sensors?` : `Which track carries ${ask.track}'s sensors?`;
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
