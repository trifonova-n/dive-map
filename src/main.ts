import "./types";
import { loadConfig } from "./config";
import { setupMobile, initMobile, startARMode, moveToCurrentLocation } from "./mobile";
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

/**
 * Bootstrap: configure Q3D, initialize the viewer and mobile controls,
 * then start loading the scene. This replaces the inline <script> block
 * and the mobile.js <script> tag that were previously in index.html.
 */
function bootstrap(): void {
  // Q3D configuration (was inline in index.html)
  Q3D.Config.coord.latlon = true;
  Q3D.Config.viewpoint = {
    lookAt: { x: 598716.3893947866, y: 4052826.0684010955, z: 0.0 },
    pos: { x: 598317.5217757289, y: 4052163.447469877, z: 279.1472300175813 },
  };
  Q3D.Config.localMode = true;

  // Mobile/AR setup — patches app methods, sets Q3D.Config.AR defaults
  setupMobile();

  // Override AR defaults with site-specific values
  Q3D.Config.AR.MND = 12.0;
  Q3D.Config.northArrow.enabled = true;
  Q3D.Config.northArrow.color = 0xe31a1c;

  const container = document.getElementById("view")!;
  const app = Q3D.application;

  // Expose `app` globally — scene.js (loaded by loadSceneFile) calls
  // `app.loadJSONObject(...)` expecting `app` on the global scope.
  (window as unknown as Record<string, unknown>).app = app;

  app.init(container);
  initMobile();

  // Load the scene
  app.loadSceneFile(
    "./data/index/scene.js",
    function () {
      // Scene file loaded
      app.start();

      if ("AR" in app.urlParams) {
        (document.getElementById("ar-checkbox") as HTMLInputElement).checked = true;
        startARMode();
        moveToCurrentLocation();
      }
    },
    function () {
      // All relevant files loaded
    }
  );
}

/**
 * Initialize custom dive-map enhancements (labels, measure hooks, hotkeys).
 * Waits for Q3D scene to be fully ready.
 */
async function initCustom(): Promise<void> {
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

// Run bootstrap immediately (module is deferred, runs after DOM parse)
bootstrap();

// Init custom enhancements once scene is ready
initCustom();
