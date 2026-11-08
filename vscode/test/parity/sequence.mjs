// The cross-host parity check's command sequence, defined once for both hosts: VS Code's tracer
// (test/integration/parity.ts) runs it with executeCommand, the playground's harness
// (test/play/parity.mjs) with the page's debriefCommand. Each starts from serial 1 of the sample
// exercise as the sample builder made it, runs these in order, then writes the plot's file as
// saved, projected (normalise.mjs), for compare.mjs to hold the two to each other.
//
// Every command here is a shared feature's (webview/panels/flows/features.ts), given what an agent
// or a test gives instead of asking, so nothing is asked in either host. Arguments are as an agent
// gives them: an id or ids, or a Target ({ ids }), as each command takes them in both hosts.

/** The plot both hosts start from: the sample exercise's serial 1, fresh. */
export const FIXTURE = { item: "serial-1" };

/** The commands run, in order: { command, args, what } (what for the reader of a failure). */
export const SEQUENCE = [
  // Colour and hiding (flows/presentation.ts).
  { command: "debrief.setColour", args: [{ ids: ["track-red-one"] }, "Green"], what: "RED ONE coloured green, by its palette name" },
  { command: "debrief.hide", args: [{ ids: ["track-ais-cargo-01"] }], what: "a merchant hidden" },
  // A track edit (flows/tracks.ts).
  { command: "debrief.moveTrack", args: ["track-ais-tug-01", { distance: { value: 0.5, unit: "[nmi_i]" }, bearing: { value: 90, unit: "deg" } }], what: "the tug moved half a mile east" },
  // Annotations (flows/annotations.ts).
  {
    command: "debrief.addAnnotation",
    args: [{ shape: "area", name: "Parity area", positions: [[-75.62, 37.12], [-75.42, 37.14], [-75.4, 36.98]] }],
    what: "an area added",
  },
  { command: "debrief.toggleNorthArrow", args: [true], what: "the north arrow shown" },
  // Ambiguous cuts (flows/cuts.ts), and the Tools' entry that keeps a side (flows/operation.ts).
  { command: "debrief.resolveAmbiguity", args: [{ keep: "starboard", cut_ids: ["cut-00263", "cut-00264"] }], what: "two towed-array cuts' starboard bearings kept" },
  { command: "debrief.keepPort", args: [["cut-00262"]], what: "a towed-array cut's port bearing kept, from the Tools' entry" },
  { command: "debrief.hideCuts", args: [["cut-00001", "cut-00002"]], what: "two bow sonar cuts hidden, from the Tools' entry" },
  // A towed array's offset (flows/arrayoffset.ts).
  { command: "debrief.setArrayOffset", args: ["sensor-blue-one-towed-array", { value: 300, unit: "m" }, "plain"], what: "the towed array 300 m astern, plain" },
  // History (flows/move.ts): two steps undone, one brought back.
  { command: "debrief.undo", args: [], what: "the array offset undone" },
  { command: "debrief.undo", args: [], what: "the hidden cuts undone" },
  { command: "debrief.redo", args: [], what: "the hidden cuts redone" },
  // The Tote (flows/tote.ts): saved in the plot's view, never a step.
  { command: "debrief.tote.setPrimary", args: ["track-blue-one"], what: "BLUE ONE the Tote's primary" },
  { command: "debrief.tote.add", args: [["track-red-one", "track-ais-cargo-04"]], what: "RED ONE and a merchant added to the Tote" },
  { command: "debrief.tote.remove", args: [["track-ais-cargo-04"]], what: "the merchant taken off the Tote" },
  // Time and the narrative (flows/time.ts): context tracks and the narrative box in the view; an entry a step.
  { command: "debrief.setContextTracks", args: ["faint"], what: "context tracks faint" },
  {
    command: "debrief.addNarrative",
    args: [{ time: "2023-06-15T09:30:00.000Z", text: "Parity check: BLUE ONE alters to the north.", source: "Parity", entry_type: "Log", track_id: "track-blue-one" }],
    what: "a narrative entry added",
  },
  { command: "debrief.editNarrative", args: ["narrative-0002", { text: "Edited by the parity check." }], what: "a narrative entry edited" },
  { command: "debrief.deleteNarrative", args: ["narrative-0003"], what: "a narrative entry deleted" },
  { command: "debrief.setNarrativeOnMap", args: [false], what: "the map's narrative box off" },
  // The rest of the track edits (flows/tracks.ts's TrackEditArgs): each given its answers, so nothing is asked.
  { command: "debrief.rotateTrack", args: ["track-ais-cargo-02", { angle: { value: 15, unit: "deg" }, pivot: [-75.6, 37.0] }], what: "a merchant rotated 15° about a point" },
  {
    command: "debrief.shearTrack",
    args: ["track-ais-cargo-03", { anchor: "start", course: { value: 200, unit: "deg" }, speed: { value: 6, unit: "[kn_i]" } }],
    what: "a merchant sheared to 200° at 6 kn, its start held",
  },
  { command: "debrief.stretchTrack", args: ["track-ais-cargo-05", { anchor: "start", speed: { value: 9, unit: "[kn_i]" } }], what: "a merchant stretched to 9 kn, its start held" },
  { command: "debrief.splitTrack", args: ["track-ais-cargo-06", { at: "2023-06-15T10:30:00.000Z" }], what: "a merchant split at 10:30, the parts named by the service" },
  { command: "debrief.mergeTracks", args: [["track-ais-cargo-06", "track-cargo-06-2"], { name: "Cargo 06 again" }], what: "its parts merged, named" },
  {
    command: "debrief.moveFix",
    args: ["track-ais-sailing-01", "2023-06-15T08:08:06.000Z", { distance: { value: 5, unit: "[nmi_i]" }, bearing: { value: 0, unit: "deg" } }],
    what: "one fix of the yacht moved 5 miles north: a jump",
  },
  { command: "debrief.removeJumps", args: ["track-ais-sailing-01", { threshold: { value: 30, unit: "[kn_i]" }, times: "all" }], what: "the yacht's jumps over 30 kn removed" },
  { command: "debrief.smoothTrack", args: ["track-ais-cargo-04", { window: 5 }], what: "a merchant smoothed over 5 fixes" },
  {
    command: "debrief.markFix",
    args: ["track-red-one", "2023-06-15T08:05:00.000Z", { colour: "#ffd700", colour_name: "yellow", label: "Parity", show_symbol: true }],
    what: "a fix of RED ONE coloured, labelled and its symbol always shown",
  },
  { command: "debrief.plottingMode", args: ["track-blue-one", "dr"], what: "BLUE ONE plotted by dead reckoning" },
  { command: "debrief.setTrackFrequencies", args: [["track-blue-one", "track-red-one"], { label_interval: "10 min", arrow_interval: "off" }], what: "labels every 10 min and no arrows on both" },
];

/**
 * Shared commands from the groups the check covers that it leaves out, and why: each would ask
 * the analyst (a form, a menu, a file) in at least one host, given nothing it takes instead.
 */
export const LEFT_OUT = [
  { command: "debrief.setTimeWindow", why: "VS Code's own command for agents and tests, not a shared feature's: the playground sets the window only from its time controller" },
  { command: "debrief.goToTime", why: "moves current time only, shown and never saved, so the plot's file does not change" },
  { command: "debrief.editAnnotation (without changes), debrief.cutMenu, debrief.currentCut", why: "always a form or a menu, in both hosts" },
  { command: "debrief.colourSelection, debrief.selectionHide and the Outline toolbar's", why: "act on the Outline's selection, which the hosts keep each in its own way; their Target forms (setColour, hide) are run instead" },
];

/**
 * Differences between the hosts the check found and keeps, each with why: compare.mjs leaves out
 * the paths named. None at present; one added here needs a reason a reviewer accepts.
 */
export const KNOWN_DIFFERENCES = [];

/** Where the plot's history stands after the sequence, in both: the step current, and how many there are. */
export const EXPECTED = { current: 24, steps: 24 };
