import type { SegmentLabelManager } from "./segment-labels";
import type { WaypointLabelManager } from "./waypoint-labels";

/**
 * Monkey-patches app.measure.addPoint / removeLastPoint / clear
 * to keep waypoint and segment labels in sync with the measure tool.
 */
export function patchMeasureTool(
  app: Q3DApplication,
  waypointMgr: WaypointLabelManager,
  segmentMgr: SegmentLabelManager
): void {
  const measure = app.measure;
  const origAdd = measure.addPoint.bind(measure) as (pt: THREE.Vector3) => unknown;
  const origRemove = measure.removeLastPoint.bind(measure) as () => unknown;
  const origClear = measure.clear.bind(measure) as () => unknown;

  measure.addPoint = function (pt: THREE.Vector3) {
    const out = origAdd(pt);
    const mg = measure.markerGroup;
    const lastMarker = mg?.children?.[mg.children.length - 1];
    if (lastMarker) {
      waypointMgr.add(lastMarker, app);
      if (mg.children.length >= 2) segmentMgr.addFromLastTwo(app);
    }
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
}
