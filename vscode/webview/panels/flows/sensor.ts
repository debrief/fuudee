/**
 * Reading a .dsf or REP file's sensor lines into the open plot (CAP-22), written once for both front
 * ends (PAR-09, PAR-10): one step, the file kept as a source. A file read in before is said first
 * (read it again, or cancel); then each sensor's track the plot has not (matched by name as legacy
 * matched it, or by its first six letters only, to confirm) is asked about, one question per track.
 */
import { describePeriod } from "../../../src/format.js";
import { describeSensorInFile, hostChoices, hostQuestion, hostsToAsk, sensorReadSummary, type SensorPreview } from "../../../src/sensorimport.js";
import { REASONS } from "../actions.js";
import { changeStep } from "./step.js";
import type { FlowHost, OpenSpec, PickedFile, PlotRef } from "./host.js";

/** What reading the file did. */
export interface SensorRead {
  sensors: string[];
  cuts: number;
  omitted: string[];
  notes?: string[];
}

export interface SensorHost extends FlowHost {
  /** What the file holds, said before it is read (debrief/preview_sensor): throws if it cannot be read. */
  previewSensor(file: PickedFile, plot: PlotRef): Promise<SensorPreview>;
  /** Read it in, one step: throws a Refusal for a conflict or a newer schema. */
  readSensor(plot: PlotRef, file: PickedFile, hosts: Record<string, string | null>, again: boolean, allowNewerSchema: boolean): Promise<SensorRead>;
}

export const SENSOR_SPEC: OpenSpec = { title: "Read sensor data into this plot", openLabel: "Read sensor data", filters: [{ name: "Sensor data (DSF, REP)", extensions: ["dsf", "DSF", "rep", "REP"] }, { name: "All files", extensions: ["*"] }] };
export const NO_SERVICE = "Reading sensor data needs Debrief's tool service. Run 'Debrief: Restart tool service'.";
export const NOTHING_READ = "Nothing was read.";
export const READ_AGAIN = "Read it again";
export const DO_NOT_READ = "Do not read these";

/** Read a file's sensor data into the open plot. quiet: an agent's, asked nothing (hosts and again, if given, say). */
export async function importSensor(host: SensorHost, given: { file?: PickedFile; hosts?: Record<string, string | null>; again?: boolean; quiet?: boolean } = {}): Promise<{ problem?: string; answer?: SensorRead } | undefined> {
  const refuse = (problem: string) => (void host.message("warning", problem), { problem });
  const plot = host.plot();
  if (!plot) return refuse(REASONS["debrief.plotOpen"]);
  if (!host.serviceReady()) return refuse(NO_SERVICE);
  const file = given.file ?? (await host.pickFile(SENSOR_SPEC));
  if (!file) return undefined;
  let hosts = given.hosts ?? {};
  let again = given.again ?? false;
  if (!given.quiet) {
    let preview: SensorPreview;
    try {
      preview = await host.previewSensor(file, plot);
    } catch (error) {
      return refuse((error as Error).message);
    }
    if (!preview.cuts) return refuse(`No sensor cut could be read from ${preview.name}. ${preview.omitted.slice(0, 2).join(" ")}`.trim());
    if (preview.earlier.length) {
      const last = preview.earlier[preview.earlier.length - 1];
      const picked = await host.ask({
        kind: "pick",
        title: `${preview.name} was read into this plot before`,
        text: `${last.how}, ${describePeriod(last.at)}`,
        choices: [
          { label: READ_AGAIN, detail: "Its cuts are added beside those already read" },
          { label: "Cancel", detail: "Read nothing" },
        ],
      });
      if (picked !== READ_AGAIN) return refuse(NOTHING_READ);
      again = true;
    }
    for (const ask of hostsToAsk(preview)) {
      const tracks = hostChoices(preview, ask);
      const picked = await host.ask({
        kind: "pick",
        title: hostQuestion(ask),
        text: ask.sensors.map(describeSensorInFile).join("; "),
        choices: [...tracks.map((t) => ({ label: t.name, id: t.id, ...(t.matched && { description: "matched by its first six letters" }) })), { label: DO_NOT_READ, id: "" }],
      });
      if (picked === undefined) return refuse(NOTHING_READ);
      hosts = { ...hosts, [ask.track]: picked || null };
    }
  }
  const now = host.plot();
  if (!now?.base) return refuse(now ? NO_SERVICE : REASONS["debrief.plotOpen"]);
  const done = await changeStep(host, (allow) => host.readSensor(now, file, hosts, again, allow));
  if (done.problem) return refuse(done.problem);
  const answer = done.answer!;
  void host.message("info", [sensorReadSummary(answer, file.name.split(/[\\/]/).pop()!), ...(answer.notes ?? []), ...answer.omitted].join(" "));
  return { answer };
}
