/**
 * The action catalogue (PAR-05, docs/panel-parity-srd.md): every user action declared once, with
 * its title, its icon (a codicon id), when it can run and the reason when it cannot (PAR-08), and
 * where it is placed: a panel's title bar or overflow, a row's context menu, the editor's title bar,
 * or the Command Palette, each with its group and order. Free of VS Code and of the DOM.
 *
 * VS Code's package.json commands and menus are written from it (scripts/menus.mjs, PAR-06): a
 * menu entry changed by hand there fails the unit tests. The playground draws the Outline's context
 * menus and toolbar from it (PAR-07): the same titles, in the same groups and order, enabled under
 * the same rules, which it reads here against the same context keys as VS Code's when clauses.
 *
 * Conditions are lists of tests on context keys, all of which must hold (VS Code's "&&"); a row's
 * menu also matches the row's menu context (the Outline panel model's `menu`, VS Code's
 * contextValue), exactly or by a regular expression.
 */

/** One test of a context key, as a when clause says it: set, not set, equal to a value or not. */
export type Test =
  | { key: string }
  | { key: string; not: true }
  | { key: string; is: string }
  | { key: string; isNot: string };

/** A row's menu context, as VS Code's viewItem: exactly this, or matching this regular expression. */
export type ItemMatch = { is: string } | { re: string };

export type View = "debrief.time" | "debrief.catalogues" | "debrief.outline" | "debrief.timeline" | "debrief.history" | "debrief.bearings";

/** Where an action is offered. A group is "<name>" or "<name>@<order>"; "navigation" groups are a title bar's buttons, the rest its overflow menu. */
export type Placement =
  | { menu: "row"; view: View; item: ItemMatch[]; when?: Test[]; group?: string }
  | { menu: "title"; view: View; when?: Test[]; group?: string }
  | { menu: "editor"; when: Test[]; group?: string }
  | { menu: "palette"; hidden: true }
  | { menu: "palette"; when: Test[] };

export interface Action {
  /** The command's id. */
  id: string;
  title: string;
  shortTitle?: string;
  /** A codicon id. */
  icon?: string;
  /** When it can run; the reason when it cannot is REASONS' for the first test that fails. */
  enablement?: Test[];
  /** When it is shown checked. */
  toggled?: Test[];
  placements?: Placement[];
  /** The Outline operation it runs on the rows it is chosen on (webview/outlinemodel.ts outlineOperations), if it is one. */
  operation?: string;
  /** Offered in VS Code only, a permitted host difference (docs/panel-parity-srd.md §5): the playground leaves it out of its menus. */
  only?: "vscode";
}

/** Why an action cannot run, by the context key whose test failed (the same words in both front ends, PAR-08). */
export const REASONS: Record<string, string> = {
  "debrief.plotOpen": "Open a plot first.",
  "debrief.canUndo": "There is nothing to undo.",
  "debrief.canRedo": "There is nothing to redo.",
  "debrief.revisionShown": "The latest revision is shown.",
  "debrief.contextTracks": "Choose tracks for the Tote first: context tracks are the others.",
  "debrief.selectionVisibility": "Select what to hide or show first.",
  "debrief.selectionColourable": "Select something with a colour first: tracks, solutions, sensors, cuts or annotations.",
  "debrief.selectionHasChildren": "Select a track, a sensor, a solution or a leg first.",
  "debrief.toteCanSetPrimary": "Select one track that is not the Tote's primary already.",
};

/** Every action, in package.json's order of commands. */
export const ACTIONS: readonly Action[] = [
  { id: "debrief.addCatalogue", title: "Add catalogue folder…", icon: "folder-opened", placements: [{ menu: "title", view: "debrief.catalogues", group: "navigation@3" }], only: "vscode" },
  { id: "debrief.createCatalogue", title: "Create catalogue…", icon: "new-folder", only: "vscode" },
  { id: "debrief.importRep", title: "Import plot file (REP, .dpf, Word, PDF)…", icon: "cloud-download", placements: [{ menu: "title", view: "debrief.catalogues", group: "navigation@1" }, { menu: "row", view: "debrief.catalogues", item: [{ is: "catalogue" }], group: "1_import" }] },
  { id: "debrief.addPlotFile", title: "Add a plot file…", icon: "file-add", placements: [{ menu: "title", view: "debrief.catalogues", group: "navigation@2" }, { menu: "row", view: "debrief.catalogues", item: [{ is: "catalogue" }], group: "1_import" }], only: "vscode" },
  { id: "debrief.refresh", title: "Refresh", icon: "refresh", placements: [{ menu: "title", view: "debrief.catalogues", group: "navigation@4" }], only: "vscode" },
  { id: "debrief.openPlot", title: "Open plot", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.select", title: "Select features", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.clearSelection", title: "Clear selection", icon: "clear-all", placements: [{ menu: "title", view: "debrief.outline", group: "navigation@5" }] },
  { id: "debrief.selectionHide", title: "Hide selected on map (all shown; legs and positions left as they are)", icon: "eye", enablement: [{ key: "debrief.selectionVisibility", is: "visible" }], placements: [{ menu: "title", view: "debrief.outline", when: [{ key: "debrief.selectionVisibility", isNot: "hidden" }, { key: "debrief.selectionVisibility", isNot: "mixed" }], group: "navigation@1" }, { menu: "palette", when: [{ key: "debrief.selectionVisibility", is: "visible" }] }] },
  { id: "debrief.selectionShow", title: "Show selected on map (all hidden)", icon: "eye-closed", enablement: [{ key: "debrief.selectionVisibility", is: "hidden" }], placements: [{ menu: "title", view: "debrief.outline", when: [{ key: "debrief.selectionVisibility", is: "hidden" }], group: "navigation@1" }, { menu: "palette", when: [{ key: "debrief.selectionVisibility", is: "hidden" }] }] },
  { id: "debrief.selectionShowAll", title: "Show all selected on map (some hidden, some shown)", icon: "color-mode", enablement: [{ key: "debrief.selectionVisibility", is: "mixed" }], placements: [{ menu: "title", view: "debrief.outline", when: [{ key: "debrief.selectionVisibility", is: "mixed" }], group: "navigation@1" }, { menu: "palette", when: [{ key: "debrief.selectionVisibility", is: "mixed" }] }] },
  { id: "debrief.colourSelection", title: "Colour selected… (tracks, solutions, sensors, cuts and annotations)", icon: "symbol-color", enablement: [{ key: "debrief.selectionColourable" }], placements: [{ menu: "title", view: "debrief.outline", group: "navigation@2" }] },
  { id: "debrief.selectAll", title: "Select all in the Outline (every row listed)", icon: "check-all", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "title", view: "debrief.outline", group: "navigation@3" }] },
  { id: "debrief.selectChildren", title: "Select children (a track's sensors, a sensor's cuts, a solution's legs, a leg's positions)", icon: "type-hierarchy-sub", enablement: [{ key: "debrief.selectionHasChildren" }], placements: [{ menu: "title", view: "debrief.outline", group: "navigation@4" }] },
  { id: "debrief.outlineToolbarState", title: "The Outline toolbar's state", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.showToolForm", title: "Open tool", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.runTool", title: "Run tool", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.restartTools", title: "Restart tool service" },
  { id: "debrief.undo", title: "Undo last change to plot", icon: "discard", enablement: [{ key: "debrief.canUndo" }], placements: [{ menu: "title", view: "debrief.history", group: "navigation@1" }] },
  { id: "debrief.redo", title: "Redo change to plot", icon: "redo", enablement: [{ key: "debrief.canRedo" }], placements: [{ menu: "title", view: "debrief.history", group: "navigation@2" }] },
  { id: "debrief.setColour", title: "Change colour…", icon: "symbol-color", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-(track|sensor)" }], group: "1_presentation@1" }] },
  { id: "debrief.hide", title: "Hide on map", icon: "eye-closed", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-" }, { re: "^(?!.*-hidden$)" }], group: "1_presentation@2" }] },
  { id: "debrief.setTrackFrequencies", title: "Frequencies: labels, symbols and arrows…", icon: "clock", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "1_presentation@3" }] },
  { id: "debrief.addAnnotation", title: "Add annotation…", icon: "add", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "title", view: "debrief.outline", group: "navigation@6" }, { menu: "title", view: "debrief.timeline", group: "navigation@2" }] },
  { id: "debrief.editAnnotation", title: "Change annotation…", icon: "edit", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-annotation" }], group: "0_annotation@1" }] },
  { id: "debrief.deleteAnnotation", title: "Delete annotation", icon: "trash", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-annotation" }], group: "0_annotation@2" }] },
  { id: "debrief.toggleNorthArrow", title: "North arrow", enablement: [{ key: "debrief.plotOpen" }], toggled: [{ key: "debrief.northArrow" }], placements: [{ menu: "title", view: "debrief.outline", group: "2_furniture@1" }] },
  { id: "debrief.moveTrack", title: "Move track…", icon: "move", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "0_track@1" }] },
  { id: "debrief.rotateTrack", title: "Rotate track…", icon: "sync", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "0_track@2" }] },
  { id: "debrief.shearTrack", title: "Shear track…", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "0_track@3" }] },
  { id: "debrief.stretchTrack", title: "Stretch track…", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "0_track@4" }] },
  { id: "debrief.splitTrack", title: "Split track at current time…", icon: "split-horizontal", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "0_track@5" }] },
  { id: "debrief.mergeTracks", title: "Merge selected tracks", icon: "merge", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "0_track@6" }] },
  { id: "debrief.editTrack", title: "Change track", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.removeJumps", title: "Find and remove jumps…", icon: "debug-step-over", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "0_track@7" }] },
  { id: "debrief.smoothTrack", title: "Smooth track…", icon: "pulse", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "0_track@8" }] },
  { id: "debrief.markFix", title: "Fixes: colour, label or comment…", icon: "list-unordered", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "0_track@9" }] },
  { id: "debrief.moveFix", title: "Move a fix…", icon: "location", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "0_track@10" }] },
  { id: "debrief.plottingMode", title: "Plot over the ground or by dead reckoning…", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "0_track@11" }] },
  { id: "debrief.askTrackImportMode", title: "Ask again whether imported tracks are OTG or DR" },
  { id: "debrief.goToTime", title: "Go to this time", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.addNarrative", title: "Add narrative entry…", icon: "comment", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "title", view: "debrief.timeline", group: "navigation@1" }] },
  { id: "debrief.editNarrative", title: "Change narrative entry…", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.deleteNarrative", title: "Delete narrative entry", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.importNarrative", title: "Read narrative into this plot (REP, Word, PDF)…", icon: "cloud-download", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "title", view: "debrief.timeline", group: "navigation@3" }] },
  { id: "debrief.setNarrativeOnMap", title: "Narrative on the map", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.resolveAmbiguity", title: "Ambiguous bearings: keep port or starboard…", icon: "arrow-swap", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-sensor" }], group: "0_sensor@1" }] },
  { id: "debrief.cutMenu", title: "Sensor cut…", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.bearingsMenu", title: "Bearings: cut or position…", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.setArrayOffset", title: "Towed array offset…", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-sensor" }], group: "0_sensor@3" }] },
  { id: "debrief.currentCut", title: "Cut at current time…", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-sensor" }], group: "0_sensor@2" }] },
  { id: "debrief.importSensor", title: "Read sensor data into this plot (DSF, REP)…", icon: "radio-tower", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "title", view: "debrief.outline", group: "3_import@1" }] },
  { id: "debrief.show", title: "Show on map", icon: "eye", placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "-hidden$" }], group: "1_presentation@2" }] },
  { id: "debrief.showBearings", title: "Bearings and TMA", icon: "graph-line", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-(sensor|track-tma)" }], group: "0_sensor@4" }] },
  { id: "debrief.popOutBearings", title: "Pop out Bearings into a new window", shortTitle: "Pop out", icon: "link-external", placements: [{ menu: "title", view: "debrief.bearings", when: [{ key: "debrief.bearingsPoppedOut", not: true }], group: "navigation@1" }] },
  { id: "debrief.bringBackBearings", title: "Bring Bearings back to the panel", shortTitle: "Bring back", icon: "layout-panel", placements: [{ menu: "title", view: "debrief.bearings", when: [{ key: "debrief.bearingsPoppedOut" }], group: "navigation@1" }, { menu: "editor", when: [{ key: "activeWebviewPanelId", is: "'debrief.bearingsWindow'" }], group: "navigation@1" }, { menu: "palette", when: [{ key: "debrief.bearingsPoppedOut" }] }] },
  { id: "debrief.focusBearingsWindow", title: "Focus the popped-out Bearings", placements: [{ menu: "palette", when: [{ key: "debrief.bearingsPoppedOut" }] }] },
  { id: "debrief.tmaCreate", title: "TMA solution from a sensor's cuts…", enablement: [{ key: "debrief.plotOpen" }] },
  { id: "debrief.tmaSplitLeg", title: "Split TMA solution into legs at current time", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track-tma" }], group: "0_track@0" }] },
  { id: "debrief.tmaExclude", title: "Leave cuts out of a TMA solution's RMS", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.tmaFromCuts", title: "TMA solution from cuts…", icon: "graph-line", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^(feature-sensor|outline-cut)" }], group: "0_tma@1" }], operation: "tma-from-cuts" },
  { id: "debrief.splitBeforeFix", title: "Split before this position", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ is: "outline-fix" }], group: "0_tma@1" }], operation: "split-before" },
  { id: "debrief.splitAfterFix", title: "Split after this position", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ is: "outline-fix" }], group: "0_tma@2" }], operation: "split-after" },
  { id: "debrief.splitBeforeCut", title: "Split before this cut", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^outline-cut" }], group: "0_tma@2" }, { menu: "palette", hidden: true }], operation: "split-before" },
  { id: "debrief.splitAfterCut", title: "Split after this cut", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^outline-cut" }], group: "0_tma@3" }, { menu: "palette", hidden: true }], operation: "split-after" },
  { id: "debrief.keepPort", title: "Keep port: selected cuts", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^outline-cut" }], group: "1_side@1" }], operation: "keep-port" },
  { id: "debrief.keepStarboard", title: "Keep starboard: selected cuts", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^outline-cut" }], group: "1_side@2" }], operation: "keep-starboard" },
  { id: "debrief.makeAmbiguous", title: "Make ambiguous again: selected cuts", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^outline-cut" }], group: "1_side@3" }], operation: "keep-ambiguous" },
  { id: "debrief.tmaLeaveOut", title: "Leave out of the solution: selected cuts", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^outline-cut" }], group: "2_rms@1" }], operation: "leave-out" },
  { id: "debrief.tmaCountIn", title: "Count in the solution: selected cuts", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^outline-cut" }], group: "2_rms@2" }], operation: "count-in" },
  { id: "debrief.hideCuts", title: "Hide selected cuts", icon: "eye-closed", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ is: "outline-cut" }], group: "3_cuts@1" }], operation: "hide-cuts" },
  { id: "debrief.showCuts", title: "Show selected cuts", icon: "eye", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^outline-cut" }], group: "3_cuts@2" }], operation: "show-cuts" },
  { id: "debrief.deleteCuts", title: "Delete selected cuts", icon: "trash", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^outline-cut" }], group: "3_cuts@3" }], operation: "delete-cuts" },
  { id: "debrief.chooseInOutline", title: "Choose in the Outline", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.outlineOperations", title: "Tools for the Outline's selection", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.takeNewData", title: "Take data into the open plot…", icon: "arrow-down", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.catalogues", item: [{ re: "^plot-other" }], group: "0_collation@1" }] },
  { id: "debrief.dismissNewData", title: "Not now: set this new data aside", placements: [{ menu: "row", view: "debrief.catalogues", item: [{ re: "-new-data" }], group: "0_collation@2" }, { menu: "palette", hidden: true }] },
  { id: "debrief.clearReviewFlag", title: "Reviewed: clear the review flag", icon: "check", placements: [{ menu: "row", view: "debrief.catalogues", item: [{ re: "-review" }], group: "0_collation@3" }] },
  { id: "debrief.linkTrack", title: "Same platform as a track in the open plot…", icon: "link", placements: [{ menu: "row", view: "debrief.catalogues", item: [{ re: "^item-track(-proposed)?$" }], group: "0_collation@1" }, { menu: "palette", hidden: true }] },
  { id: "debrief.unlinkTrack", title: "Not this platform", icon: "debug-disconnect", placements: [{ menu: "row", view: "debrief.catalogues", item: [{ re: "^item-track-(proposed|linked)$" }], group: "0_collation@2" }, { menu: "palette", hidden: true }] },
  { id: "debrief.showCoverage", title: "Show coverage", icon: "layers", placements: [{ menu: "title", view: "debrief.catalogues", when: [{ key: "debrief.plotOpen" }], group: "navigation@5" }] },
  { id: "debrief.collate", title: "Collate", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.goToStep", title: "Go back to this step", placements: [{ menu: "row", view: "debrief.history", item: [{ is: "step-applied" }], group: "1_history" }, { menu: "palette", hidden: true }] },
  { id: "debrief.redoToStep", title: "Redo up to this step", placements: [{ menu: "row", view: "debrief.history", item: [{ is: "step-undone" }], group: "1_history" }, { menu: "palette", hidden: true }] },
  { id: "debrief.tote.setPrimary", title: "Set as Tote primary", enablement: [{ key: "debrief.plotOpen" }, { key: "debrief.toteCanSetPrimary" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], group: "2_tote@1" }] },
  { id: "debrief.tote.add", title: "Add to Tote", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], when: [{ key: "debrief.toteCanAdd" }], group: "2_tote@2" }] },
  { id: "debrief.tote.remove", title: "Remove from Tote", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "row", view: "debrief.outline", item: [{ re: "^feature-track" }], when: [{ key: "debrief.toteCanRemove" }], group: "2_tote@3" }] },
  { id: "debrief.setTote", title: "Set the Tote's tracks", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.contextTracks.visible", title: "Context tracks: Visible", enablement: [{ key: "debrief.contextTracks" }], toggled: [{ key: "debrief.contextTracks", is: "visible" }], placements: [{ menu: "title", view: "debrief.time", when: [{ key: "debrief.contextTracks" }], group: "1_context@1" }] },
  { id: "debrief.contextTracks.faint", title: "Context tracks: Faint", enablement: [{ key: "debrief.contextTracks" }], toggled: [{ key: "debrief.contextTracks", is: "faint" }], placements: [{ menu: "title", view: "debrief.time", when: [{ key: "debrief.contextTracks" }], group: "1_context@2" }] },
  { id: "debrief.contextTracks.hidden", title: "Context tracks: Hidden", enablement: [{ key: "debrief.contextTracks" }], toggled: [{ key: "debrief.contextTracks", is: "hidden" }], placements: [{ menu: "title", view: "debrief.time", when: [{ key: "debrief.contextTracks" }], group: "1_context@3" }] },
  { id: "debrief.exportImage", title: "Export image…", icon: "device-camera", enablement: [{ key: "debrief.plotOpen" }], placements: [{ menu: "title", view: "debrief.outline", when: [{ key: "debrief.plotOpen" }], group: "3_export@1" }, { menu: "editor", when: [{ key: "activeWebviewPanelId", is: "'debrief.map'" }], group: "navigation@1" }] },
  { id: "debrief.findImageSource", title: "Find source of image…", icon: "search", placements: [{ menu: "title", view: "debrief.catalogues", group: "2_trace@1" }] },
  { id: "debrief.walkthroughs", title: "Walkthroughs: learn Debrief on the sample exercise", icon: "mortar-board", placements: [{ menu: "title", view: "debrief.catalogues", group: "3_learn@1" }] },
  { id: "debrief.walkthrough.open", title: "Open a fresh copy of the sample for a walkthrough…" },
  { id: "debrief.walkthrough.importLog", title: "Import the walkthrough's navigation log", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.walkthrough.do", title: "Do a walkthrough's step on its copy", placements: [{ menu: "palette", hidden: true }] },
  { id: "debrief.openLatestRevision", title: "Go to latest revision of the plot", icon: "arrow-right", enablement: [{ key: "debrief.revisionShown" }], placements: [{ menu: "title", view: "debrief.history", when: [{ key: "debrief.revisionShown" }], group: "navigation@0" }, { menu: "editor", when: [{ key: "activeWebviewPanelId", is: "'debrief.map'" }, { key: "debrief.revisionShown" }], group: "navigation@0" }, { menu: "palette", when: [{ key: "debrief.revisionShown" }] }] },
];

/** Whether the playground offers an action: all but those §5 keeps to VS Code (catalogue management). */
export const inPlayground = (id: string): boolean => actionOf(id).only !== "vscode";

/** An action by its id. */
export function actionOf(id: string): Action {
  const action = ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error(`No action ${id} in the catalogue`);
  return action;
}

// --- As VS Code's when clauses --------------------------------------------------------------------

const said = (t: Test): string =>
  "not" in t ? `!${t.key}` : "is" in t ? `${t.key} == ${t.is}` : "isNot" in t ? `${t.key} != ${t.isNot}` : t.key;
const item = (m: ItemMatch): string => ("is" in m ? `viewItem == ${m.is}` : `viewItem =~ /${m.re}/`);

/** A list of tests as a when clause: "a && b == c". */
export function whenClause(tests: readonly Test[]): string {
  return tests.map(said).join(" && ");
}

/** A placement's when clause, as package.json's menus have it. */
export function placementWhen(p: Placement): string {
  switch (p.menu) {
    case "row":
      return [`view == ${p.view}`, ...p.item.map(item), ...(p.when ?? []).map(said)].join(" && ");
    case "title":
      return [`view == ${p.view}`, ...(p.when ?? []).map(said)].join(" && ");
    case "editor":
      return whenClause(p.when);
    case "palette":
      return "hidden" in p ? "false" : whenClause(p.when);
  }
}

const MENU_IDS = { row: "view/item/context", title: "view/title", editor: "editor/title", palette: "commandPalette" } as const;

/** package.json's contributes.commands and contributes.menus, as the catalogue has them. */
export function contribution(): { commands: Record<string, unknown>[]; menus: Record<string, Record<string, unknown>[]> } {
  const commands = ACTIONS.map((a) => ({
    command: a.id,
    title: a.title,
    ...(a.shortTitle && { shortTitle: a.shortTitle }),
    category: "Debrief",
    ...(a.icon && { icon: `$(${a.icon})` }),
    ...(a.enablement && { enablement: whenClause(a.enablement) }),
    ...(a.toggled && { toggled: { condition: whenClause(a.toggled) } }),
  }));
  const menus: Record<string, Record<string, unknown>[]> = { "view/title": [], "editor/title": [], "view/item/context": [], commandPalette: [] };
  for (const a of ACTIONS) {
    for (const p of a.placements ?? []) {
      menus[MENU_IDS[p.menu]].push({ command: a.id, when: placementWhen(p), ...("group" in p && p.group && { group: p.group }) });
    }
  }
  return { commands, menus };
}

// --- As the playground reads them ------------------------------------------------------------------

/** The context keys' values now, as VS Code's setContext would have them (a key left out is not set). */
export type Context = Readonly<Record<string, string | boolean | undefined>>;

const unquote = (v: string) => v.replace(/^'(.*)'$/, "$1");

/** Whether a test holds in a context. */
export function holds(t: Test, context: Context): boolean {
  const v = context[t.key];
  if ("not" in t) return !v;
  if ("is" in t) return String(v) === unquote(t.is);
  if ("isNot" in t) return String(v) !== unquote(t.isNot);
  return !!v;
}

/** Whether a row's menu context matches. */
export function matches(m: ItemMatch, menu: string | undefined): boolean {
  if (menu === undefined) return false;
  return "is" in m ? menu === m.is : new RegExp(m.re).test(menu);
}

/** An entry of a menu or toolbar as shown: its action, title, and whether it can run, with the reason when not. */
export interface MenuEntry {
  id: string;
  title: string;
  icon?: string;
  group: string;
  order: number;
  enabled: boolean;
  reason?: string;
  checked?: boolean;
}

const groupOf = (group = "") => {
  const at = group.lastIndexOf("@");
  return at < 0 ? { name: group, order: 0 } : { name: group.slice(0, at), order: Number(group.slice(at + 1)) };
};

/** An action as an entry, in a context: enabled, or why not (a reason the context gives for the key, else REASONS'). */
export function entryOf(a: Action, group: string | undefined, context: Context, reasons: Readonly<Record<string, string>> = {}): MenuEntry {
  const failed = (a.enablement ?? []).find((t) => !holds(t, context));
  const g = groupOf(group);
  return {
    id: a.id,
    title: a.title,
    ...(a.icon && { icon: a.icon }),
    group: g.name,
    order: g.order,
    enabled: !failed,
    ...(failed && { reason: reasons[failed.key] ?? REASONS[failed.key] ?? "Not available now." }),
    ...(a.toggled && { checked: a.toggled.every((t) => holds(t, context)) }),
  };
}

/** Sorted as VS Code sorts a menu: by group (navigation first, then by name), then by order, then by title. */
function sorted(entries: MenuEntry[]): MenuEntry[] {
  const rank = (g: string) => (g === "navigation" ? "" : g || "~");
  return entries.sort((a, b) => rank(a.group).localeCompare(rank(b.group)) || a.order - b.order || a.title.localeCompare(b.title));
}

/** A row's context menu in a view: the actions placed there for its menu context, shown in this context. */
export function rowMenu(view: View, menu: string | undefined, context: Context, reasons?: Readonly<Record<string, string>>): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const a of ACTIONS) {
    for (const p of a.placements ?? []) {
      if (p.menu !== "row" || p.view !== view || !p.item.every((m) => matches(m, menu)) || !(p.when ?? []).every((t) => holds(t, context))) continue;
      out.push(entryOf(a, p.group, context, reasons));
    }
  }
  return sorted(out);
}

/** The actions a row's menu context offers in a view, by id, whatever the context: the Outline panel model's row actions. */
export function rowActions(view: View, menu: string | undefined): string[] {
  return ACTIONS.filter((a) => (a.placements ?? []).some((p) => p.menu === "row" && p.view === view && p.item.every((m) => matches(m, menu)))).map((a) => a.id);
}

/** A view's title bar in this context: its buttons ("navigation" groups) then its overflow menu's entries. */
export function titleMenu(view: View, context: Context, reasons?: Readonly<Record<string, string>>): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const a of ACTIONS) {
    for (const p of a.placements ?? []) {
      if (p.menu !== "title" || p.view !== view || !(p.when ?? []).every((t) => holds(t, context))) continue;
      out.push(entryOf(a, p.group, context, reasons));
    }
  }
  return sorted(out);
}

/** An editor's title bar in this context (the map's, VS Code's editor/title): its buttons ("navigation" groups) then its overflow menu's entries. */
export function editorMenu(context: Context, reasons?: Readonly<Record<string, string>>): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const a of ACTIONS) {
    for (const p of a.placements ?? []) {
      if (p.menu !== "editor" || !p.when.every((t) => holds(t, context))) continue;
      out.push(entryOf(a, p.group, context, reasons));
    }
  }
  return sorted(out);
}
