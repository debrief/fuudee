/** Analyst-facing wording derived from declarations, kept free of VS Code so it can be tested. */
import type { ToolDeclaration } from "@debrief/schemas";

const KIND_NAMES: Record<string, [string, string]> = {
  track: ["track", "tracks"],
  annotation: ["annotation", "annotations"],
  sensor_observations: ["set of sensor observations", "sets of sensor observations"],
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


/** A step in a plot's history, as the History view names it. */
export function describeStep(
  step: { kind: string; tool: string | null; status: string; notes?: string[] },
  toolTitle: (name: string) => string | undefined,
): { label: string; status: string } {
  // An edit made without a tool is named by its note, when it has a short one; so is
  // a plot file added to a catalogue, with its history ("Added from the plot file ...").
  const note = (step.kind === "edit" || step.kind === "import") && !step.tool ? step.notes?.[0] : undefined;
  const label =
    note && note.length <= 48
      ? note
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
