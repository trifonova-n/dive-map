import type { SegmentLabelManager } from "./segment-labels";
import type { WaypointLabelManager } from "./waypoint-labels";

let editMode = false;

export interface MeasureHookOptions {
  onWaypointAdded?: () => void;
}

/**
 * Monkey-patches app.measure.addPoint / removeLastPoint / clear / showResult
 * to keep waypoint and segment labels in sync, suppress the measure-result
 * popup during edit mode, and notify the plan panel on user-driven adds.
 */
export function patchMeasureTool(
  app: Q3DApplication,
  waypointMgr: WaypointLabelManager,
  segmentMgr: SegmentLabelManager,
  opts: MeasureHookOptions = {}
): void {
  const measure = app.measure;
  const origAdd = measure.addPoint.bind(measure) as (pt: THREE.Vector3) => unknown;
  const origRemove = measure.removeLastPoint.bind(measure) as () => unknown;
  const origClear = measure.clear.bind(measure) as () => unknown;
  const origShowResult = measure.showResult.bind(measure) as () => void;

  measure.addPoint = function (pt: THREE.Vector3) {
    const out = origAdd(pt);
    const mg = measure.markerGroup;
    const lastMarker = mg?.children?.[mg.children.length - 1];
    if (lastMarker) {
      waypointMgr.add(lastMarker, app);
      if (mg.children.length >= 2) segmentMgr.addFromLastTwo(app);
    }
    if (editMode) opts.onWaypointAdded?.();
    return out;
  };

  measure.removeLastPoint = function () {
    const out = origRemove();
    waypointMgr.removeLast();
    segmentMgr.removeLast();
    return out;
  };

  measure.clear = function () {
    const out = origClear();
    waypointMgr.clear();
    segmentMgr.clear();
    return out;
  };

  measure.showResult = function () {
    if (editMode) return;
    origShowResult();
  };
}

/**
 * Toggles edit mode: when true, map clicks add waypoints (via measure.isActive),
 * the measure-result popup is suppressed, and user-driven addPoint calls fire onWaypointAdded.
 */
export function setEditMode(app: Q3DApplication, flag: boolean): void {
  editMode = flag;
  app.measure.isActive = flag;
}
