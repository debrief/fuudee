/**
 * The features registered through the shared layer (register.ts), each by both hosts: VS Code's
 * extension and the playground call each feature's register function with their own Host and the
 * feature's own host interface. The parity test (test/unit/registration.test.ts) holds both hosts to
 * this list, so a feature's commands are offered in both or neither.
 */
import { BEARINGS_COMMANDS, registerBearings } from "./bearings.js";
import { commandsOf, type CommandIds, type Host } from "./register.js";

export interface Feature {
  name: string;
  commands: CommandIds;
  // The second argument is the feature's own host interface.
  register: (host: Host, impl: never) => void;
}

export const FEATURES: readonly Feature[] = [{ name: "Bearings and TMA", commands: BEARINGS_COMMANDS, register: registerBearings }];

/** Every command the shared features register, in each host. */
export const FEATURE_COMMANDS: readonly string[] = FEATURES.flatMap((f) => commandsOf(f.commands));
