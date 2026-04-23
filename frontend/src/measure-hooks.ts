import type { SiteConfig } from "./config";
import type { RouteTubeManager } from "./route-tubes";
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
  tubeMgr: RouteTubeManager,
  config: SiteConfig,
  opts: MeasureHookOptions = {}
): void {
  const measure = app.measure;
  const origAdd = measure.addPoint.bind(measure) as (pt: THREE.Vector3) => unknown;
  const origRemove = measure.removeLastPoint.bind(measure) as () => unknown;
  const origClear = measure.clear.bind(measure) as () => unknown;
  const origShowResult = measure.showResult.bind(measure) as () => void;

  initMeasureTool(app, config);

  measure.addPoint = function (pt: THREE.Vector3) {
    const out = origAdd(pt);
    const mg = measure.markerGroup;
    const lastMarker = mg?.children?.[mg.children.length - 1];
    if (lastMarker) {
      waypointMgr.add(lastMarker, app);
      if (mg.children.length >= 2) {
        segmentMgr.addFromLastTwo(app);
        tubeMgr.addFromLastTwo(app);
      }
    }
    if (editMode) opts.onWaypointAdded?.();
    return out;
  };

  measure.removeLastPoint = function () {
    const out = origRemove();
    waypointMgr.removeLast();
    segmentMgr.removeLast();
    tubeMgr.removeLast();
    return out;
  };

  // origClear early-returns when isActive is false, which skips resetting
  // Qgis2threejs's internal `path` array and leaves stale markers/lines in
  // the scene. Force-activate around the call so clear is always effective,
  // then re-attach the groups (origClear detaches them) and restore state.
  measure.clear = function () {
    const wasActive = measure.isActive;
    measure.isActive = true;
    const out = origClear();
    measure.isActive = wasActive;
    const scene = app.scene as unknown as { add: (o: THREE.Object3D) => void };
    scene.add(measure.markerGroup);
    scene.add(measure.lineGroup);
    waypointMgr.clear();
    segmentMgr.clear();
    tubeMgr.clear();
    return out;
  };

  measure.showResult = function () {
    if (editMode) return;
    origShowResult();
  };
}

/**
 * Replicates the one-time setup that Qgis2threejs's measure.start() performs,
 * without the spurious addPoint(queryTargetPosition) it tacks on the end.
 * Safe to call before any user interaction.
 */
function initMeasureTool(app: Q3DApplication, config: SiteConfig): void {
  const measure = app.measure as unknown as {
    isActive: boolean;
    geom?: unknown;
    mtl?: unknown;
    lineMtl?: unknown;
    markerGroup: THREE.Group;
    lineGroup: THREE.Group;
  };
  if (measure.geom) return;

  const cfg = (Q3D.Config as unknown as {
    measure: {
      marker: { radius: number; color: number; opacity: number };
      line: { color: number };
    };
  }).measure;
  // THREE is the global r110 shim; these classes aren't in types.ts.
  const T = window.THREE as unknown as Record<string, new (...args: unknown[]) => unknown>;
  const Q3DGroupCtor = (window as unknown as {
    Q3DGroup: new () => THREE.Group;
  }).Q3DGroup;

  measure.geom = new T.SphereBufferGeometry(cfg.marker.radius, 32, 32);
  measure.mtl = new T.MeshLambertMaterial({
    color: cfg.marker.color,
    opacity: cfg.marker.opacity,
    transparent: cfg.marker.opacity < 1,
  });
  measure.lineMtl = new T.LineBasicMaterial({
    color: parseInt(config.lineBrightness, 16),
    linewidth: 3,
    transparent: true,
    opacity: 1.0,
  });

  const markerGroup = new Q3DGroupCtor();
  markerGroup.name = "measure marker";
  measure.markerGroup = markerGroup;

  const lineGroup = new Q3DGroupCtor();
  lineGroup.name = "measure line";
  lineGroup.position.z += 3;
  // Hidden — RouteTubeManager draws the visible route as cylinders instead.
  lineGroup.visible = false;
  measure.lineGroup = lineGroup;

  const scene = app.scene as unknown as { add: (o: THREE.Object3D) => void };
  scene.add(markerGroup);
  scene.add(lineGroup);
}

/**
 * Toggles edit mode: when true, map clicks add waypoints (via measure.isActive),
 * the measure-result popup is suppressed, and user-driven addPoint calls fire onWaypointAdded.
 */
export function setEditMode(app: Q3DApplication, flag: boolean): void {
  editMode = flag;
  app.measure.isActive = flag;
}
