/** Analyst-facing wording derived from declarations, kept free of VS Code so it can be tested. */
import type { ToolDeclaration } from "@debrief/schemas";

const KIND_NAMES: Record<string, [string, string]> = {
  track: ["track", "tracks"],
  annotation: ["annotation", "annotations"],
  sensor_observations: ["set of sensor observations", "sets of sensor observations"],
  sensor: ["sensor", "sensors"],
  sensor_cut: ["sensor cut", "sensor cuts"],
};

/** What a tool needs, in the analyst's words, for tools not on offer. */
export function needs(tool: ToolDeclaration): string {
  const min = tool.min_selected ?? 1;
  const max = tool.max_selected;
  const kinds = tool.applies_to.includes("*")
    ? ["feature", "features"]
    : tool.applies_to.length === 1
      ? (KIND_NAMES[tool.applies_to[0]] ?? [tool.applies_to[0], tool.applies_to[0]])
      : ["feature of the right kind", "features of the right kinds"];
  const count =
    max === undefined ? `${min} or more` : max === min ? String(min) : `${min} to ${max}`;
  if (min === 0 && max === undefined) return "works with any selection";
  return `select ${count} ${max === 1 || (max === min && min === 1) ? kinds[0] : kinds[1]}`;
}


/** The importer that reads a file's narrative into an open plot (debrief_io.narrative). */
export const NARRATIVE_IMPORTER = "debrief-io.narrative";
/** The importer that reads a file's sensor lines into an open plot (debrief_io.sensor_import). */
export const SENSOR_IMPORTER = "debrief-io.sensor";
/** Collation's steps: new data taken, a source chosen for a period, a platform linked (debrief_stac.collation). */
export const COLLATION_TOOL = "debrief-stac.collation";

/** The longest note a step is named by: long enough for "RED ONE (DR) leg into 09:43:00Z now 056.5°T 12.1 kn" with a track name of up to 19 characters. */
export const STEP_NAME_LENGTH = 64;

/** A step in a plot's history, as the History view names it. */
export function describeStep(
  step: { kind: string; tool: string | null; status: string; notes?: string[] },
  toolTitle: (name: string) => string | undefined,
): { label: string; status: string } {
  // An edit made without a tool is named by its note, when it has a short one; so is
  // a plot file added to a catalogue, with its history ("Added from the plot file ...").
  // A narrative read into a plot is named by its note too: "Narrative read from red-log.rep".
  // So is a collation step: "New data from Nav log", "BLUE ONE 09:00:00Z to 09:30:00Z from Nav log".
  const collation = step.tool === COLLATION_TOOL;
  // So is sensor data read in: "Sensor data read from ALPHA_CUTS.dsf" (CAP-22).
  const named = !step.tool || step.tool === NARRATIVE_IMPORTER || step.tool === SENSOR_IMPORTER || collation;
  // Collation's steps are a tool's (kind "tool"), told apart from a file's import.
  const note = (step.kind === "edit" || step.kind === "import" || collation) && named ? step.notes?.[0] : undefined;
  const label =
    note && note.length <= STEP_NAME_LENGTH
      ? note
      : collation
        ? step.notes?.[0]?.startsWith("New data from")
          ? "New data taken"
          : "Source or platform chosen"
        : step.kind === "import"
        ? step.tool
          ? "Imported"
          : "Added from a plot file"
        : step.tool
          ? (toolTitle(step.tool) ?? `Made by ${step.tool}`) // not a tool installed here
          : step.kind === "edit"
            ? "Edited"
            : step.kind.charAt(0).toUpperCase() + step.kind.slice(1);
  const status =
    step.status === "undone"
      ? "Undone; can be redone"
      : step.status === "abandoned"
        ? "Undone, then replaced by a later change; kept on record"
        : "In the plot";
  return { label, status };
}
