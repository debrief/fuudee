/**
 * The features registered through the shared layer (register.ts), each by both hosts: VS Code's
 * extension and the playground call each feature's register function with their own Host and the
 * feature's own host interface. The parity test (test/unit/registration.test.ts) holds both hosts to
 * this list, so a feature's commands are offered in both or neither.
 */
import { BEARINGS_COMMANDS, registerBearings } from "./bearings.js";
import { COLLATION_COMMANDS, registerCollation } from "./collation.js";
import { EXPORT_COMMANDS, registerExport } from "./exportimage.js";
import { NARRATIVE_COMMANDS, registerNarrativeImport } from "./narrative.js";
import { HISTORY_COMMANDS, registerHistory } from "./move.js";
import { registerTrackEdits, TRACK_EDIT_COMMANDS } from "./tracks.js";
import { PRESENTATION_COMMANDS, registerPresentation } from "./presentation.js";
import { ANNOTATION_COMMANDS, registerAnnotations } from "./annotations.js";
import { registerTote, TOTE_COMMANDS } from "./tote.js";
import { OPERATION_FEATURE_COMMANDS, registerOperations } from "./operation.js";
import { registerSensorImport, SENSOR_COMMANDS } from "./sensor.js";
import { commandsOf, type CommandIds, type Host } from "./register.js";

export interface Feature {
  name: string;
  commands: CommandIds;
  // The second argument is the feature's own host interface.
  register: (host: Host, impl: never) => void;
}

export const FEATURES: readonly Feature[] = [
  { name: "Bearings and TMA", commands: BEARINGS_COMMANDS, register: registerBearings },
  { name: "The Tools' entries for the Outline's selection", commands: OPERATION_FEATURE_COMMANDS, register: registerOperations },
  { name: "Collation", commands: COLLATION_COMMANDS, register: registerCollation },
  { name: "Reading sensor data", commands: SENSOR_COMMANDS, register: registerSensorImport },
  { name: "Reading narrative", commands: NARRATIVE_COMMANDS, register: registerNarrativeImport },
  { name: "Exported images", commands: EXPORT_COMMANDS, register: registerExport },
  { name: "History", commands: HISTORY_COMMANDS, register: registerHistory },
  { name: "Track edits", commands: TRACK_EDIT_COMMANDS, register: registerTrackEdits },
  { name: "Colour, hiding and the Outline toolbar", commands: PRESENTATION_COMMANDS, register: registerPresentation },
  { name: "Annotations", commands: ANNOTATION_COMMANDS, register: registerAnnotations },
  { name: "The Tote's entries", commands: TOTE_COMMANDS, register: registerTote },
];

/** Every command the shared features register, in each host. */
export const FEATURE_COMMANDS: readonly string[] = FEATURES.flatMap((f) => commandsOf(f.commands));
