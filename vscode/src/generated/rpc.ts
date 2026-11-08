// Generated from the tool service's registry (debrief_tools.service.METHODS) by
// python -m debrief_tools rpc-types. Do not edit: change the method's request or reply
// class there, or the class in schemas/linkml/rpc.yaml.
import type {
  AddAnnotationParams,
  AddNarrativeParams,
  AddPlotFileParams,
  AddPlotFileReply,
  ClearReviewFlagParams,
  CoverageParams,
  CoverageReply,
  CreateCatalogueParams,
  CreateCatalogueReply,
  CutsParams,
  DeleteFeaturesParams,
  DismissNewDataParams,
  EditAnnotationParams,
  EditNarrativeParams,
  EditTrackParams,
  EmptyReply,
  ExportImageParams,
  ExportedImage,
  FigureIdParams,
  FigureIdReply,
  FindImageSourceParams,
  FindJumpsParams,
  GotoParams,
  HistoryParams,
  HistoryReply,
  HostAnswerParams,
  HostPollParams,
  HostPollReply,
  ImageSources,
  ImportNarrativeParams,
  ImportParams,
  ImportReply,
  ImportSensorParams,
  IslandChangeReply,
  IslandReply,
  JumpsReply,
  LinkTracksParams,
  MarkFixParams,
  MeasureGroupsReply,
  MergeTracksParams,
  MoveParams,
  NarrativeImportReply,
  NarrativeParams,
  NarrativePreview,
  NarrativeReply,
  NoParams,
  OpenParams,
  OpenReply,
  OpenRevisionParams,
  OpenRevisionReply,
  PlotChangeReply,
  PlotReply,
  PreviewNarrativeParams,
  PreviewSensorParams,
  RemoveJumpsParams,
  RepTracksParams,
  RepTracksReply,
  ResolveAmbiguityParams,
  ReviewFlagsReply,
  SensorImportReply,
  SensorPreview,
  SensorsParams,
  SensorsReply,
  SetArrayOffsetParams,
  SetColourParams,
  SetHiddenParams,
  SetNorthArrowParams,
  SetSourcePreferenceParams,
  SetTrackFrequenciesParams,
  SetViewParams,
  SmoothTrackParams,
  SmoothingPreviewParams,
  SmoothingPreviewReply,
  SmoothingReply,
  SplitTrackParams,
  StampedImage,
  StoresReply,
  TakeNewDataParams,
  TakeNewDataReply,
  TmaChangeReply,
  TmaCreateParams,
  TmaCreateReply,
  TmaExcludeCutParams,
  TmaResidualsParams,
  TmaResidualsReply,
  TmaSplitLegParams,
  ToolsForSelectionParams,
  ToolsForSelectionReply,
  ToteParams,
  ToteResult,
} from "@debrief/schemas";

/** Each method the tool service answers that the schema describes (rpc.yaml):
 * what it takes and what it answers. */
export interface RpcMethods {
  "debrief/tools_for_selection": { params: ToolsForSelectionParams; reply: ToolsForSelectionReply };
  "debrief/stores": { params: NoParams; reply: StoresReply };
  "debrief/create_catalogue": { params: CreateCatalogueParams; reply: CreateCatalogueReply };
  "debrief/import": { params: ImportParams; reply: ImportReply };
  "debrief/import_rep": { params: ImportParams; reply: ImportReply };
  "debrief/add_plot_file": { params: AddPlotFileParams; reply: AddPlotFileReply };
  "debrief/rep_tracks": { params: RepTracksParams; reply: RepTracksReply };
  "debrief/preview_narrative": { params: PreviewNarrativeParams; reply: NarrativePreview };
  "debrief/preview_sensor": { params: PreviewSensorParams; reply: SensorPreview };
  "debrief/tote": { params: ToteParams; reply: ToteResult };
  "debrief/measure_groups": { params: NoParams; reply: MeasureGroupsReply };
  "debrief/review_flags": { params: NoParams; reply: ReviewFlagsReply };
  "debrief/open": { params: OpenParams; reply: OpenReply };
  "debrief/history": { params: HistoryParams; reply: HistoryReply };
  "debrief/undo": { params: MoveParams; reply: PlotReply };
  "debrief/redo": { params: MoveParams; reply: PlotReply };
  "debrief/goto": { params: GotoParams; reply: PlotReply };
  "debrief/set_colour": { params: SetColourParams; reply: PlotChangeReply };
  "debrief/set_hidden": { params: SetHiddenParams; reply: PlotChangeReply };
  "debrief/set_track_frequencies": { params: SetTrackFrequenciesParams; reply: PlotChangeReply };
  "debrief/set_view": { params: SetViewParams; reply: IslandReply };
  "debrief/add_annotation": { params: AddAnnotationParams; reply: PlotChangeReply };
  "debrief/edit_annotation": { params: EditAnnotationParams; reply: PlotChangeReply };
  "debrief/delete_annotations": { params: DeleteFeaturesParams; reply: PlotChangeReply };
  "debrief/set_north_arrow": { params: SetNorthArrowParams; reply: PlotChangeReply };
  "debrief/add_narrative": { params: AddNarrativeParams; reply: PlotChangeReply };
  "debrief/edit_narrative": { params: EditNarrativeParams; reply: PlotChangeReply };
  "debrief/delete_narrative": { params: DeleteFeaturesParams; reply: PlotChangeReply };
  "debrief/import_narrative": { params: ImportNarrativeParams; reply: NarrativeImportReply };
  "debrief/narrative": { params: NarrativeParams; reply: NarrativeReply };
  "debrief/sensors": { params: SensorsParams; reply: SensorsReply };
  "debrief/resolve_ambiguity": { params: ResolveAmbiguityParams; reply: PlotChangeReply };
  "debrief/import_sensor": { params: ImportSensorParams; reply: SensorImportReply };
  "debrief/set_array_offset": { params: SetArrayOffsetParams; reply: PlotChangeReply };
  "debrief/delete_cuts": { params: CutsParams; reply: PlotChangeReply };
  "debrief/tma_residuals": { params: TmaResidualsParams; reply: TmaResidualsReply };
  "debrief/tma_create": { params: TmaCreateParams; reply: TmaCreateReply };
  "debrief/tma_split_leg": { params: TmaSplitLegParams; reply: PlotChangeReply };
  "debrief/tma_exclude_cut": { params: TmaExcludeCutParams; reply: TmaChangeReply };
  "debrief/edit_track": { params: EditTrackParams; reply: PlotChangeReply };
  "debrief/split_track": { params: SplitTrackParams; reply: PlotChangeReply };
  "debrief/merge_tracks": { params: MergeTracksParams; reply: PlotChangeReply };
  "debrief/find_jumps": { params: FindJumpsParams; reply: JumpsReply };
  "debrief/remove_jumps": { params: RemoveJumpsParams; reply: PlotChangeReply };
  "debrief/preview_smoothing": { params: SmoothingPreviewParams; reply: SmoothingPreviewReply };
  "debrief/smooth_track": { params: SmoothTrackParams; reply: SmoothingReply };
  "debrief/mark_fix": { params: MarkFixParams; reply: PlotChangeReply };
  "debrief/coverage": { params: CoverageParams; reply: CoverageReply };
  "debrief/take_new_data": { params: TakeNewDataParams; reply: TakeNewDataReply };
  "debrief/set_source_preference": { params: SetSourcePreferenceParams; reply: PlotChangeReply };
  "debrief/link_tracks": { params: LinkTracksParams; reply: PlotChangeReply };
  "debrief/dismiss_new_data": { params: DismissNewDataParams; reply: IslandChangeReply };
  "debrief/clear_review_flag": { params: ClearReviewFlagParams; reply: IslandChangeReply };
  "debrief/figure_id": { params: FigureIdParams; reply: FigureIdReply };
  "debrief/export_image": { params: ExportImageParams; reply: StampedImage | ExportedImage };
  "debrief/find_image_source": { params: FindImageSourceParams; reply: ImageSources };
  "debrief/open_revision": { params: OpenRevisionParams; reply: OpenRevisionReply };
  "debrief/host_poll": { params: HostPollParams; reply: HostPollReply };
  "debrief/host_answer": { params: HostAnswerParams; reply: EmptyReply };
}

/** A method the schema describes. */
export type RpcMethod = keyof RpcMethods;
/** What the method takes. */
export type RpcParams<M extends RpcMethod> = RpcMethods[M]["params"];
/** What the method answers. */
export type RpcReply<M extends RpcMethod> = RpcMethods[M]["reply"];
