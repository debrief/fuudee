/**
 * The host interface the shared command flows are written against (PAR-09,
 * docs/panel-parity-srd.md): ask a question, show a message (severity, text, buttons), call the
 * service, open a plot or a panel, and read shared state. VS Code implements it with QuickPick,
 * modal warnings and showInformationMessage (src/extension.ts); the playground with its dialog and
 * toasts (play/host.ts). Free of VS Code and of the DOM, so the flows are tested once against a
 * recording fake (PAR-17, test/unit/flows.test.ts).
 */
import type { Base } from "../../../src/service.js";

export type Severity = "info" | "warning" | "error";

/**
 * A question with its choices. A confirmation is asked as a modal warning (VS Code) or a dialog
 * (the playground), its choices as buttons; a pick as a list (VS Code's QuickPick) or the same
 * dialog. Undefined if the analyst cancelled.
 */
export interface Question {
  kind: "confirm" | "pick";
  text: string;
  choices: readonly string[];
}

/** What the service refused and a flow answers: the plot changed since the caller's base (SUB-28), or saving would write a newer schema (SUB-35). */
export class Refusal extends Error {
  constructor(
    readonly code: "conflict" | "newer_schema",
    message: string,
  ) {
    super(message);
  }
}
export const isRefusal = (error: unknown, code: Refusal["code"]): boolean => error instanceof Refusal && error.code === code;

/** The plot open, as the flows need it: where it is, what it was opened at, and its period. */
export interface PlotRef {
  store: string;
  item: string;
  /** Where its history stood when opened: sent back with each change (SUB-28). */
  base?: Base;
  /** Its STAC item's properties: its period, for a tool's times. */
  properties: { start_datetime?: string | null; end_datetime?: string | null; datetime?: string | null };
  /** An earlier revision is shown read-only. */
  readOnly?: boolean;
}

/** What every flow's host provides. */
export interface FlowHost {
  ask(question: Question): Promise<string | undefined>;
  /** Shown without waiting: the promise resolves to the button chosen, if any, whenever it is. */
  message(severity: Severity, text: string, buttons?: readonly string[]): Promise<string | undefined>;
  /** The plot open, if any. */
  plot(): PlotRef | undefined;
  /** Whether the tool service (in the playground, Python) is running. */
  serviceReady(): boolean;
  /** Open the plot open again, as it now is: the problem, if it could not be. */
  reloadPlot(): Promise<string | undefined>;
}

/** What a change the service made says back. */
export interface Done {
  problem?: string;
  notes?: string[];
  changed?: boolean;
}
