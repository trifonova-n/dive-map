import "./types";
import { loadConfig, type SiteConfig } from "./config";
import { setupMobile, initMobile, startARMode, moveToCurrentLocation } from "./mobile";
import { runProjector, projectWaypointsAnchored, projectLandmarks } from "./projection";
import { SegmentLabelManager, computeSegment } from "./segment-labels";
import { WaypointLabelManager } from "./waypoint-labels";
import { LandmarkLabelManager } from "./landmark-labels";
import { patchMeasureTool, setEditMode, setMeasureMode } from "./measure-hooks";
import { patchQueryPopup } from "./popup-hooks";
import { RouteTubeManager } from "./route-tubes";
import { fetchMe, getLandmarks, getToken, type LandmarkAPI } from "./api-client";
import { toLonLatXY } from "./crs";
import { centerCameraOnSceneWhenReady } from "./camera";
import { registerHotkeys, disableQ3DHotkeys } from "./hotkeys";
import { patchLoadJSONObjectForSafari } from "./safari-texture-fix";
import { createAuthPanel } from "./ui/auth-panel";
import { createPlanPanel, type PlanPanelAPI } from "./ui/plan-panel";
import { createLandmarkPanel, type LandmarkPanelAPI } from "./ui/landmark-panel";
import { createSpeedPanel, type SpeedPanelAPI } from "./ui/speed-panel";
import { renderSitePicker } from "./ui/site-picker";
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

/** Resolves once the scene has at least one visible mesh — implies scene.js
 *  has finished executing and userData (proj4/origin/baseExtent) is populated,
 *  so toWorldCoordinates can be called. */
function waitForSceneReady(app: Q3DApplication): Promise<void> {
  return new Promise((resolve) => {
    (function poll() {
      const scene = app.scene;
      if (scene) {
        const box = new THREE.Box3();
        scene.traverse((obj) => {
          if (obj.isMesh && obj.visible) box.expandByObject(obj);
        });
        if (!box.isEmpty()) {
          resolve();
          return;
        }
      }
      requestAnimationFrame(poll);
    })();
  });
}

/**
 * Bootstrap: configure Q3D, initialize the viewer and mobile controls,
 * then start loading the scene from the site's configured scene_path.
 */
function bootstrap(config: SiteConfig): void {
  Q3D.Config.coord.latlon = true;
  // Placeholder viewpoint — overridden once the scene loads by
  // centerCameraOnSceneWhenReady(), which auto-frames the bounding box.
  Q3D.Config.viewpoint = {
    lookAt: { x: 0, y: 0, z: 0 },
    pos: { x: 100, y: -100, z: 100 },
  };
  Q3D.Config.localMode = true;

  setupMobile();

  // AR magnetic-north deviation comes from the active site's config.
  Q3D.Config.AR.MND = Math.abs(config.magDeclination);
  Q3D.Config.northArrow.enabled = true;
  Q3D.Config.northArrow.color = 0xe31a1c;

  // Override the default yellow marker with magenta; selected waypoints use
  // the original yellow via the highlighter to stand out.
  (Q3D.Config as unknown as {
    measure: { marker: { color: number } };
  }).measure.marker.color = 0xff00ff;

  const container = document.getElementById("view")!;
  const app = Q3D.application;

  // Expose `app` globally — scene.js calls `app.loadJSONObject(...)`
  (window as unknown as Record<string, unknown>).app = app;

  app.init(container);
  initMobile();

  patchLoadJSONObjectForSafari(app);

  app.loadSceneFile(
    config.scenePath,
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
async function initCustom(config: SiteConfig): Promise<void> {
  await waitForQ3D();

  const app = Q3D.application;
  if (!app || !app.scene || !app.renderer || !window.THREE) {
    console.error("Q3D not ready");
    return;
  }

  // Hydrate the current user (admin flag) before panels render, so the first
  // paint reflects admin affordances. Best-effort: a stale or invalid token
  // is cleared inside fetchMe().
  if (getToken()) {
    try {
      await fetchMe();
    } catch {
      // ignore network/server errors at boot
    }
  }

  console.log("\u2705 custom modules loaded (bright-line edition)");

  const segmentMgr = new SegmentLabelManager(config);
  runProjector(segmentMgr.labels, app);

  const waypointMgr = new WaypointLabelManager(config);
  projectWaypointsAnchored(
    waypointMgr.labels,
    app,
    () => waypointMgr.isVisible()
  );

  const tubeMgr = new RouteTubeManager(config, app);

  // Landmarks: fetch + mount after the scene is ready so toWorldCoordinates
  // has a populated CRS on scene.userData.
  const landmarkMgr = new LandmarkLabelManager(config, app);
  projectLandmarks(landmarkMgr.records, app, () => {
    const out: DOMRect[] = [];
    if (waypointMgr.isVisible()) {
      for (const { div } of waypointMgr.labels.values()) {
        if (div.style.display !== "none") out.push(div.getBoundingClientRect());
      }
    }
    for (const { div } of segmentMgr.labels) {
      if (div.style.display !== "none") out.push(div.getBoundingClientRect());
    }
    return out;
  });
  waitForSceneReady(app).then(async () => {
    try {
      const rows = await getLandmarks(config.siteId);
      for (const r of rows) landmarkMgr.add(r);
    } catch (e) {
      console.warn("Landmarks not loaded", e);
    }
  });

  // Forward-references so the patch and hotkeys can call into panels
  // once they're created below.
  let planPanel: PlanPanelAPI | null = null;
  let landmarkPanel: LandmarkPanelAPI | null = null;
  let speedPanel: SpeedPanelAPI | null = null;

  const highlightWaypoint = makeHighlighter(app);

  patchMeasureTool(app, waypointMgr, segmentMgr, tubeMgr, config, {
    onWaypointAdded: () => planPanel?.markDirty(),
    onLandmarkPointPicked: (pt) => landmarkPanel?.handlePlacementPick(pt),
  });
  patchQueryPopup(config);
  disableQ3DHotkeys(app);
  registerHotkeys(waypointMgr, {
    onEscape: () =>
      (planPanel?.handleEscape() ?? false) ||
      (landmarkPanel?.handleEscape() ?? false),
    onCycleSpeed: () => speedPanel?.cycle(),
  });
  centerCameraOnSceneWhenReady(app, config);

  // --- UI panels ---
  const panelContainer = document.getElementById("divemap-panel");
  if (!panelContainer) return;

  // Speed selector: created before the plan panel so the plan panel can read
  // the current speed for its total-time readout. Selecting a speed reveals
  // per-leg times; Off (the default) hides them.
  speedPanel = createSpeedPanel(panelContainer, {
    onChange: (v) => {
      segmentMgr.setSpeed(v);
      planPanel?.update();
    },
  });
  segmentMgr.setSpeed(speedPanel.getSpeed()); // apply persisted selection on load

  planPanel = createPlanPanel(panelContainer, {
    siteId: config.siteId,
    exportWaypoints: () => waypointMgr.exportWaypoints(app),
    exportSegments: () => {
      const mg = app.measure?.markerGroup;
      if (!mg || mg.children.length < 2) return [];
      const out: Array<{ distFt: number; heading: number }> = [];
      for (let i = 1; i < mg.children.length; i++) {
        out.push(
          computeSegment(
            mg.children[i - 1].position,
            mg.children[i].position,
            config.metersToFeet,
            config.magDeclination
          )
        );
      }
      return out;
    },
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
      highlightWaypoint(null);
      app.measure.clear();
    },
    setEditMode: (flag) => setEditMode(app, flag),
    highlightWaypoint,
    metersToFeet: config.metersToFeet,
    getSelectedSpeedMPerMin: () => speedPanel?.getSpeed() ?? null,
  });

  landmarkPanel = createLandmarkPanel(panelContainer, {
    siteId: config.siteId,
    metersToFeet: config.metersToFeet,
    setPlacementActive: (flag) => {
      if (flag) {
        // Entering landmark placement cancels plan-edit so only one consumer
        // owns the click stream.
        planPanel?.handleEscape();
      }
      setMeasureMode(app, flag ? "landmark" : "off");
    },
    worldToLatLonDepth: (pt) => {
      const mapPt = app.scene.toMapCoordinates
        ? app.scene.toMapCoordinates(pt as THREE.Vector3)
        : (pt as unknown as { x: number; y: number; z: number });
      const { lon, lat } = toLonLatXY(mapPt.x, mapPt.y, app.scene.userData);
      const depth_m = mapPt.z < 0 ? Math.abs(mapPt.z) : null;
      return { latitude: lat, longitude: lon, depth_m };
    },
    resolveLatLon: (lat, lon) => {
      // Project lat/lon to world XY, then raycast straight down against the
      // DEM layers to read the bathymetry depth at that point. Mirrors the
      // current-location pattern in mobile.ts:293–319.
      const w = app.scene.toWorldCoordinates({ x: lon, y: lat, z: 0 }, true);
      const objects: THREE.Object3D[] = [];
      for (const lyrId in app.scene.mapLayers) {
        const layer = app.scene.mapLayers[lyrId] as {
          visibleObjects?: () => THREE.Object3D[];
        };
        if ((layer as unknown) instanceof Q3DDEMLayer) {
          objects.push(...(layer.visibleObjects?.() || []));
        }
      }
      const origin = new THREE.Vector3(w.x, w.y, 1e6);
      const ray = new THREE.Raycaster();
      ray.set(origin, new THREE.Vector3(0, 0, -1));
      const hits = ray.intersectObjects(objects);
      if (hits.length) {
        const z = hits[0].point.z;
        const mapZ = app.scene.toMapCoordinates({
          x: w.x,
          y: w.y,
          z,
        } as THREE.Vector3).z;
        return {
          world: { x: w.x, y: w.y, z },
          depth_m: mapZ < 0 ? Math.abs(mapZ) : null,
        };
      }
      // No terrain under that point — surface, no depth.
      return { world: { x: w.x, y: w.y, z: 0 }, depth_m: null };
    },
    setPendingMarker: (world) => {
      const scene = app.scene as unknown as {
        add: (o: THREE.Object3D) => void;
        remove: (o: THREE.Object3D) => void;
      };
      if (!world) {
        scene.remove(app.queryMarker);
      } else {
        app.queryMarker.position.set(world.x, world.y, world.z);
        app.queryMarker.visible = true;
        scene.add(app.queryMarker);
      }
      app.render();
    },
    onLandmarkCreated: (l) => landmarkMgr.add(l),
    onLandmarkUpdated: (l) => landmarkMgr.update(l),
    onLandmarkRemoved: (id) => landmarkMgr.remove(id),
    resetScene: (rows: LandmarkAPI[]) => {
      landmarkMgr.clear();
      for (const r of rows) landmarkMgr.add(r);
    },
  });
  landmarkMgr.setOnSelect((id) => landmarkPanel?.selectLandmark(id));

  createAuthPanel(panelContainer, {
    siteName: config.siteName,
    onLogin: () => {
      planPanel?.update();
      landmarkPanel?.handleLogin();
    },
    onLogout: () => {
      planPanel?.handleLogout();
      landmarkPanel?.handleLogout();
    },
  });

  // Mobile: toggle the panel column overlay (see mobile.css @media block).
  const fab = document.getElementById("mobile-panel-fab");
  fab?.addEventListener("click", () => {
    const open = document.body.classList.toggle("panel-open");
    fab.setAttribute("aria-expanded", String(open));
  });
}

/**
 * Builds a highlighter that toggles a bright, enlarged appearance on the
 * measure-tool marker at a given 1-indexed seq. The shared material stays
 * untouched — the selected marker gets a cloned material so siblings aren't
 * affected, and the clone is disposed when selection moves on.
 */
function makeHighlighter(app: Q3DApplication): (seq: number | null) => void {
  type Disposable = THREE.Material & { dispose?: () => void };
  type Cloneable = THREE.Material & {
    clone: () => THREE.Material & { color: { setHex: (h: number) => void } };
  };
  type Scalable = THREE.Object3D & {
    scale: { set: (x: number, y: number, z: number) => void };
  };
  let highlighted: (THREE.Object3D & Scalable) | null = null;

  return (seq: number | null) => {
    const sharedMtl = (app.measure as unknown as { mtl: THREE.Material }).mtl;
    if (highlighted) {
      (highlighted.material as Disposable).dispose?.();
      highlighted.material = sharedMtl;
      highlighted.scale.set(1, 1, 1);
      highlighted = null;
    }
    if (seq !== null) {
      const marker = app.measure.markerGroup?.children?.[seq - 1] as
        | (THREE.Object3D & Scalable)
        | undefined;
      if (marker) {
        const clone = (marker.material as Cloneable).clone() as THREE.Material & {
          color: { setHex: (h: number) => void };
          opacity: number;
          transparent: boolean;
          needsUpdate: boolean;
        };
        clone.color.setHex(0xffff00);
        clone.opacity = 1;
        clone.transparent = false;
        clone.needsUpdate = true;
        marker.material = clone;
        marker.scale.set(2.2, 2.2, 2.2);
        highlighted = marker;
      }
    }
    app.render();
  };
}

/**
 * Entry point: parse `?site=<id>` from the URL. If absent, render the site
 * picker landing page and stop. Otherwise resolve the site's config first,
 * then bootstrap Q3D and the panels.
 */
async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("site");
  const siteId = raw !== null ? Number.parseInt(raw, 10) : NaN;

  if (!Number.isFinite(siteId) || siteId <= 0) {
    await renderSitePicker(document.body);
    return;
  }

  const config = await loadConfig(siteId);
  bootstrap(config);
  await initCustom(config);
}

main();
