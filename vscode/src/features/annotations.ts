/**
 * VS Code's annotation commands (CAP-03 to CAP-05): each takes what agents and tests give it instead
 * of asking, and otherwise opens the form beside the map. Registered by the shared registration
 * (webview/panels/flows/annotations.ts), as the playground's dialog is; out of activate() (review of
 * 7 Nov 2026, finding 2), given what they need of it.
 */
import type { AnnotationSpec } from "@debrief/schemas";
import { specOfFeature } from "../../webview/annotationlook.js";
import type { PlotFeature } from "../hidden.js";
import type { AnnotationPanel } from "../panels/annotation.js";
import type { AnnotationChange } from "../service.js";
import type { Session } from "../session.js";
import type { Target } from "../../webview/panels/flows/register.js";

type Annotation = Extract<PlotFeature, { properties: { kind: "annotation" } }>;

/** What the annotation commands need of activate(). */
export interface AnnotationDeps {
  session: Session;
  annotationForm: AnnotationPanel;
  /** A problem said as a warning, and returned. */
  report(problem: string | undefined): string | undefined;
  /** The ids a command acts on: its Target's, else the selection. */
  targets(target?: Target): string[];
  /** An annotation change, one step, one at a time. */
  annotate(change: AnnotationChange): Promise<{ problem?: string; feature?: string }>;
  annotationById(id: string | undefined): Annotation | undefined;
  /** The middle of the map, where a new annotation starts. */
  mapCentre(): [number, number] | undefined;
}

export function annotationCommands(deps: AnnotationDeps) {
  const { session, annotationForm, report, targets, annotate, annotationById, mapCentre } = deps;
  const timeRangeOfPlot = () => session.period();
  const addAnnotationCommand = async (spec?: AnnotationSpec) => {
    if (!session.current) return { problem: report("Open a plot first.") };
    if (spec && typeof spec === "object" && "shape" in spec) {
      const done = await annotate({ kind: "add", annotation: spec });
      report(done.problem);
      return done;
    }
    const centre = mapCentre();
    annotationForm.show({
      spec: centre ? { shape: "circle", name: "", positions: [centre] } : undefined,
      timeRange: timeRangeOfPlot(),
      currentTime: session.time?.current,
    });
    return {};
  };
  // From the outline's menu (a node), the map (an id), or the selection; with changes, without the form.
  const editAnnotationCommand = async (target?: string | Target, changes?: Partial<AnnotationSpec>) => {
    const id = typeof target === "string" ? target : targets(target ?? undefined).find((i) => annotationById(i));
    const feature = annotationById(id);
    if (!feature) return { problem: report("Select an annotation to change.") };
    if (changes) {
      const done = await annotate({ kind: "edit", feature: feature.id, annotation: changes });
      report(done.problem);
      return done;
    }
    annotationForm.show({ spec: specOfFeature(feature), featureId: feature.id, timeRange: timeRangeOfPlot(), currentTime: session.time?.current });
    return {};
  };
  const deleteAnnotationCommand = async (target?: string | Target) => {
    const ids = (typeof target === "string" ? [target] : targets(target ?? undefined)).filter((i) => annotationById(i));
    if (!ids.length) return { problem: report("Select the annotations to delete.") };
    const done = await annotate({ kind: "delete", features: ids });
    return { problem: report(done.problem) };
  };
  // Chart furniture: the north arrow is content, so showing or removing it is a step (CAP-03).
  const northArrowCommand = async (shown?: boolean) => {
    if (!session.current) return { problem: report("Open a plot first.") };
    const has = session.current.plot.features.some((f) => f.properties.kind === "annotation" && f.properties.furniture === "north_arrow");
    const done = await annotate({ kind: "north_arrow", shown: shown ?? !has });
    return { problem: report(done.problem) };
  };
  return { addAnnotationCommand, editAnnotationCommand, deleteAnnotationCommand, northArrowCommand };
}
