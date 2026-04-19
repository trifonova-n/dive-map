import "./types";
import { loadConfig } from "./config";
import { runProjector, projectWaypointsAnchored } from "./projection";
import { SegmentLabelManager } from "./segment-labels";
import { WaypointLabelManager } from "./waypoint-labels";
import { patchMeasureTool } from "./measure-hooks";
import { centerCameraOnSceneWhenReady } from "./camera";
import { registerHotkeys } from "./hotkeys";

/** Polls until Q3D.application.scene and .renderer are ready. */
function waitForQ3D(): Promise<void> {
  return new Promise((resolve) => {
    (function poll() {
      if (
        window.Q3D?.application?.scene &&
        window.Q3D.application.renderer
      ) {
        resolve();
      } else {
        requestAnimationFrame(poll);
      }
    })();
  });
}

async function init() {
  await waitForQ3D();

  const app = Q3D.application;
  if (!app || !app.scene || !app.renderer || !window.THREE) {
    console.error("Q3D not ready");
    return;
  }

  const config = await loadConfig();

  console.log("\u2705 custom modules loaded (bright-line edition)");

  // Segment labels: distance + heading at midpoints
  const segmentMgr = new SegmentLabelManager(config);
  runProjector(segmentMgr.labels, app);

  // Waypoint labels: lat/lon/depth at each marker
  const waypointMgr = new WaypointLabelManager(config);
  projectWaypointsAnchored(
    waypointMgr.labels,
    app,
    () => waypointMgr.isVisible()
  );

  // Hook measure tool to sync labels
  patchMeasureTool(app, waypointMgr, segmentMgr);

  // Shift+L toggles waypoint labels
  registerHotkeys(waypointMgr);

  // Auto-center camera on scene once meshes are visible
  centerCameraOnSceneWhenReady(app, config);
}

window.addEventListener("load", init);
