/**
 * Host-neutral feature registration (review of 7 Nov 2026, finding 2): each feature's commands are
 * registered once, here under flows/, by both front ends: VS Code's extension (src/extension.ts)
 * and the playground (play/host.ts). A host gives a feature only what registering needs (Host); a
 * feature asks of its host what it does that differs between the two (each feature's own host
 * interface, as FlowHost's flows do), so a command offered in one is offered in the other, under the
 * same id, refusing with the same words (PAR-09).
 */

/**
 * What a command is run on, from a menu: the rows it was chosen on. VS Code passes the Outline's
 * node (its feature) or the keys given (agents, tests); the playground the rows' keys.
 */
export interface Target {
  feature?: { id: string };
  ids?: string[];
}

/**
 * What a command runs. Its arguments are the command's own: an agent's or a test's, or, run from a
 * menu, the Target first. Typed as VS Code's registerCommand takes it, any arguments at all.
 */
export type Run = (...args: never[]) => unknown;

/** What every host gives a feature to register itself: a command under its id. */
export interface Host {
  /** VS Code's commands.registerCommand (disposed with the extension); the playground's action table. */
  command(id: string, run: Run): void;
}

/** A feature's commands, by what each does: the ids both hosts register. */
export type CommandIds = Readonly<Record<string, `debrief.${string}`>>;

/** Each of a feature's commands registered with the host, under its id. */
export function registerCommands<Ids extends CommandIds>(host: Host, ids: Ids, runs: { [K in keyof Ids]: Run }): void {
  for (const key of Object.keys(ids) as (keyof Ids)[]) host.command(ids[key], runs[key]);
}

/** The ids a feature registers, in order. */
export const commandsOf = (ids: CommandIds): string[] => Object.values(ids);
