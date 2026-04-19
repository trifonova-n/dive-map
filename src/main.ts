import "./types";
import { loadConfig } from "./config";
import { setupMobile, initMobile, startARMode, moveToCurrentLocation } from "./mobile";
import { runProjector, projectWaypointsAnchored } from "./projection";
import { SegmentLabelManager } from "./segment-labels";
import { WaypointLabelManager } from "./waypoint-labels";
import { patchMeasureTool, setEditMode } from "./measure-hooks";
import { centerCameraOnSceneWhenReady } from "./camera";
import { registerHotkeys } from "./hotkeys";
import { createAuthPanel } from "./ui/auth-panel";
import { createPlanPanel, type PlanPanelAPI } from "./ui/plan-panel";
import "./ui/styles.css";

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
 * then start loading the scene.
 */
function bootstrap(): void {
  Q3D.Config.coord.latlon = true;
  Q3D.Config.viewpoint = {
    lookAt: { x: 598716.3893947866, y: 4052826.0684010955, z: 0.0 },
    pos: { x: 598317.5217757289, y: 4052163.447469877, z: 279.1472300175813 },
  };
  Q3D.Config.localMode = true;

  setupMobile();

  Q3D.Config.AR.MND = 12.0;
  Q3D.Config.northArrow.enabled = true;
  Q3D.Config.northArrow.color = 0xe31a1c;

  const container = document.getElementById("view")!;
  const app = Q3D.application;

  // Expose `app` globally — scene.js calls `app.loadJSONObject(...)`
  (window as unknown as Record<string, unknown>).app = app;

  app.init(container);
  initMobile();

  app.loadSceneFile(
    "./data/index/scene.js",
    function () {
      app.start();
      if ("AR" in app.urlParams) {
        (document.getElementById("ar-checkbox") as HTMLInputElement).checked = true;
        startARMode();
        moveToCurrentLocation();
      }
    },
    function () {}
  );
}

/**
 * Initialize custom enhancements + UI panels.
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

  const segmentMgr = new SegmentLabelManager(config);
  runProjector(segmentMgr.labels, app);

  const waypointMgr = new WaypointLabelManager(config);
  projectWaypointsAnchored(
    waypointMgr.labels,
    app,
    () => waypointMgr.isVisible()
  );

  // Forward-reference so the patch and hotkeys can call into the panel
  // once it's created below.
  let planPanel: PlanPanelAPI | null = null;

  patchMeasureTool(app, waypointMgr, segmentMgr, {
    onWaypointAdded: () => planPanel?.markDirty(),
  });
  registerHotkeys(waypointMgr, {
    onEscape: () => planPanel?.handleEscape() ?? false,
  });
  centerCameraOnSceneWhenReady(app, config);

  // --- UI panels ---
  const panelContainer = document.getElementById("divemap-panel");
  if (!panelContainer) return;

  planPanel = createPlanPanel(panelContainer, {
    exportWaypoints: () => waypointMgr.exportWaypoints(app),
    importWaypoints: (waypoints) => {
      for (const wp of waypoints) {
        const worldPt = app.scene.toWorldCoordinates(
          { x: wp.longitude, y: wp.latitude, z: -wp.depth_m },
          true
        );
        const pt = new THREE.Vector3(worldPt.x, worldPt.y, worldPt.z);
        app.measure.addPoint(pt);
      }
    },
    clearWaypoints: () => {
      app.measure.clear();
    },
    setEditMode: (flag) => setEditMode(app, flag),
    metersToFeet: config.metersToFeet,
  });

  createAuthPanel(panelContainer, {
    onLogin: () => planPanel?.update(),
    onLogout: () => planPanel?.update(),
  });
}

bootstrap();
initCustom();
