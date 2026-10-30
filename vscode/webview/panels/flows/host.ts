/**
 * The host interface the shared command flows are written against (PAR-09,
 * docs/panel-parity-srd.md): ask a question, show a message (severity, text, buttons), call the
 * service, choose a file to read or where to save one, open a plot or a panel, and read shared
 * state. VS Code implements it with QuickPick,
 * modal warnings and showInformationMessage (src/extension.ts); the playground with its dialog and
 * toasts (play/host.ts). Free of VS Code and of the DOM, so the flows are tested once against a
 * recording fake (PAR-17, test/unit/flows.test.ts).
 */
import type { Base } from "../../../src/service.js";

export type Severity = "info" | "warning" | "error";

/** A choice offered, with what a list shows beside it (VS Code's QuickPick description and detail; the playground's dialog, under it). */
export interface Choice {
  label: string;
  description?: string;
  detail?: string;
  /** A codicon id, drawn before the label (VS Code's $(id); the playground's own artwork, or none). */
  icon?: string;
  /** What the question answers when this is chosen, where labels may repeat; its label otherwise. */
  id?: string;
}
export type Choices = readonly (string | Choice)[];
/** A choice's label. */
export const labelOf = (choice: string | Choice): string => (typeof choice === "string" ? choice : choice.label);
/** What choosing it answers: its id, else its label. */
export const answerOf = (choice: string | Choice): string => (typeof choice === "string" ? choice : (choice.id ?? choice.label));
/** A choice with its words, a plain label given. */
export const choiceOf = (choice: string | Choice): Choice => (typeof choice === "string" ? { label: choice } : choice);

/**
 * Where a question stands in a sequence of them (PAR-10): "Export image (1 of 3): size". Both hosts
 * ask the same questions, in the same order, one at a time; neither merges or splits them.
 */
export interface Sequence {
  name: string;
  step: number;
  of: number;
}

/**
 * A question with its choices (PAR-10): one object, rendered by each host in its own way, the
 * choices, their words, their order and the default the same. A confirmation is asked as a modal
 * warning (VS Code) or a dialog (the playground), its choices as buttons; a pick as a list (VS
 * Code's QuickPick) or the same dialog, its default the one chosen by Enter. Resolves to the choice's
 * id, or its label; undefined if the analyst cancelled.
 */
export interface Question {
  kind: "confirm" | "pick";
  /** A pick's title (the QuickPick's, the dialog's heading); its place in a sequence goes with it. */
  title?: string;
  sequence?: Sequence;
  /** A confirmation's message; a pick's placeholder, what it asks. */
  text: string;
  choices: Choices;
  /** The choice Enter takes (by label): the one active (VS Code) or focused (the playground); never moved. */
  default?: string;
}

/** A pick of several (VS Code's QuickPick with canPickMany; the playground's boxes to tick). Undefined if cancelled. */
export interface ManyQuestion {
  title: string;
  sequence?: Sequence;
  text?: string;
  choices: readonly Choice[];
  /** The labels ticked to begin with. */
  picked: readonly string[];
}

/**
 * A pick with, apart from it, a box to tick to remember the choice ("Use this choice for future
 * track imports"), as legacy Debrief asked: one question, not two. VS Code shows the box as the
 * list's last line, chosen to tick it; the playground as a box above the choices.
 */
export interface RememberQuestion {
  title: string;
  text: string;
  choices: readonly Choice[];
  /** The box's words. */
  remember: string;
}

/** A line of text (VS Code's input box; the playground's text field), checked as it is typed. Undefined if cancelled. */
export interface TextQuestion {
  title: string;
  prompt: string;
  value?: string;
  placeholder?: string;
  /** What is wrong with the text, if anything. */
  validate?: (text: string) => string | undefined;
}

/** A question's title, with its place in a sequence: "Export image (1 of 3): size". */
export function titleOf(q: { title?: string; sequence?: Sequence }): string | undefined {
  if (!q.sequence) return q.title;
  const { name, step, of } = q.sequence;
  return `${name} (${step} of ${of})${q.title ? `: ${q.title}` : ""}`;
}

/** A file to choose (PAR-09): VS Code's open dialog; the playground's upload (§5). */
export interface OpenSpec {
  title: string;
  openLabel: string;
  /** The kinds of file offered, the first the one shown. */
  filters: readonly { name: string; extensions: readonly string[] }[];
}
/** A file chosen: on disk (VS Code), or uploaded (the playground). The flows read only its name. */
export interface PickedFile {
  name: string;
  path?: string;
  data?: Uint8Array;
}
/** Where to save a file (PAR-09): VS Code's save dialog; the playground's download, named (§5). */
export interface SaveSpec {
  title: string;
  saveLabel: string;
  /** The name offered. */
  name: string;
  filters: readonly { name: string; extensions: readonly string[] }[];
}
/** Where a file goes: a path on disk (VS Code), or a download's name (the playground). */
export interface SaveTarget {
  name: string;
  path?: string;
}

/** The panels a flow may bring forward. */
export type Panel = "catalogues" | "coverage" | "outline" | "timeline";

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
  /** Its STAC item's properties: its title, and its period, for a tool's times. */
  properties: { title?: string | null; start_datetime?: string | null; end_datetime?: string | null; datetime?: string | null };
  /** An earlier revision is shown read-only. */
  readOnly?: boolean;
}

/** What every flow's host provides. */
export interface FlowHost {
  ask(question: Question): Promise<string | undefined>;
  askMany(question: ManyQuestion): Promise<string[] | undefined>;
  askRemembering(question: RememberQuestion): Promise<{ choice: string; remember: boolean } | undefined>;
  askText(question: TextQuestion): Promise<string | undefined>;
  /** A file chosen to read, or undefined if none was. */
  pickFile(spec: OpenSpec): Promise<PickedFile | undefined>;
  /** Where to save a file, or undefined if the analyst cancelled. */
  chooseSave(spec: SaveSpec): Promise<SaveTarget | undefined>;
  /** A file written whole (VS Code), or handed to the browser to save (the playground). */
  writeFile(target: SaveTarget, data: Uint8Array): Promise<void>;
  /** Bring a panel forward. */
  openPanel(panel: Panel): void;
  /**
   * A change and what follows it (the plot shown again) run after every change before it, one at a
   * time, so each starts from the base the last one left (VS Code's serially). Not the questions.
   */
  oneAtATime<T>(work: () => Promise<T>): Promise<T>;
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
