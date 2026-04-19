// === custom.js ===
// Author: ChatGPT (customized for DY)
// Version: Bright-line edition (anchored waypoint labels, robust lon/lat)
// ------------------------------------------------------------
// Enhancements provided:
//   • Distance + magnetic heading labels at segment midpoints (UNCHANGED)
//   • Waypoint (lat, lon, depth) labels anchored: TOP-RIGHT just above point
//   • Robust lon/lat conversion using proj4 (respects map CRS such as UTM)
//   • Removes glow beams; slightly brightens measure lines
//   • Copious comments for easy future editing
//   • Add the functionality to globally toggle on/off waypoint labels (lat, log, depth) w/ <Shift>-L key
//
// ------------------------------------------------------------

window.addEventListener("load", function () {
  // --- Ensure the Q3D app is fully initialized before running ---
  const app = Q3D?.application;
  if (!app || !app.scene || !app.renderer || !window.THREE) {
    console.error("Q3D not ready yet");
    return;
  }

  console.log("✅ custom.js loaded (bright-line edition)");

  // ------------------------------------------------------------
  // CONFIGURATION
  // ------------------------------------------------------------
  const MAG_DEC = -12.0;            // Magnetic declination for Monterey Bay (°) East of True so by convention is +12
                                    // However to convert Magnetic from True  -->  Magnetic = True - Declination   
  const MID_LABEL_LIFT = 5;         // Lift height for mid-segment labels (scene units)
  const LINE_BRIGHTNESS = 0xffff66; // Bright yellowish color for better visibility

  // ------------------------------------------------------------
  // HELPER: create floating 2D HTML labels
  // ------------------------------------------------------------
  // Used for both waypoint and distance/heading labels.
  // Appearance is controlled by .label class in custom.css
  function makeDivLabel(text, align = "center") {
    const div = document.createElement("div");
    div.className = "label";
    div.innerHTML = text;
    Object.assign(div.style, {
      position: "absolute",
      color: "yellow",
      background: "rgba(0,0,0,0.6)",
      padding: "2px 4px",
      borderRadius: "8px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.8)",
      fontFamily: "monospace",
      fontSize: "11px",
      fontWeight: "bold",
      textShadow: "1px 1px 2px black",
      pointerEvents: "none",
      zIndex: 10000,
      whiteSpace: "nowrap",
      lineHeight: "1.2em",
      // Default centering behavior (used by segment labels).
      // Waypoint labels will override via inline style to "none".
      transform: align === "right" ? "translate(20%, -50%)" : "translate(-50%, -120%)",
    });
    document.body.appendChild(div);
    return div;
  }

  // ------------------------------------------------------------
  // HELPER: continuously project 3D → 2D for visible labels
  // ------------------------------------------------------------
  // Keeps labels "anchored" to 3D points as the camera moves (for mid-segment labels).
  function runProjector(labelArray) {
    function tick() {
      const rect = app.renderer.domElement.getBoundingClientRect();
      const cam = app.camera;
      const v = new THREE.Vector3();
      for (const lbl of labelArray) {
        v.copy(lbl.position).project(cam);
        const x = (v.x + 1) / 2 * rect.width + rect.left;
        const y = (-v.y + 1) / 2 * rect.height + rect.top;
        lbl.div.style.display = v.z < 1 ? "block" : "none";
        lbl.div.style.left = `${x}px`;
        lbl.div.style.top = `${y}px`;
      }
      requestAnimationFrame(tick);
    }
    tick();
  }

  // ------------------------------------------------------------
  // MID-SEGMENT LABELS: distance + heading  (UNCHANGED)
  // ------------------------------------------------------------
  // These appear between consecutive waypoints.
  const segmentLabels = [];
  runProjector(segmentLabels);

  function addSegmentLabelFromLastTwo() {
    const mg = app.measure?.markerGroup;
    if (!mg || mg.children.length < 2) return;

    const a = mg.children[mg.children.length - 2].position;
    const b = mg.children[mg.children.length - 1].position;

    // --- Compute distance and heading ---
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const distFt = Math.sqrt(dx * dx + dy * dy + dz * dz) * 3.28084;
    let heading = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    heading = (heading + MAG_DEC + 360) % 360;

    // --- Find midpoint (for label positioning) ---
    const mid = new THREE.Vector3(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      (a.z + b.z) / 2 + MID_LABEL_LIFT
    );

    // --- Create the 2-line label: distance above heading ---
    const text = `${distFt.toFixed(1)} ft<br>${heading.toFixed(1)}°M`;
    const div = makeDivLabel(text, "center");
    segmentLabels.push({ div, position: mid });

    // --- Brighten the existing Qgis2threejs measure line segments ---
    app.scene.traverse(obj => {
      if (obj.isLine && obj.parent?.name === "measure line") {
        obj.material.color.setHex(LINE_BRIGHTNESS);
        obj.material.needsUpdate = true;
      }
    });
  }

  // Remove only the latest segment label
  function removeLastSegmentLabel() {
    const rec = segmentLabels.pop();
    if (!rec) return;
    rec.div.remove();
  }

  // Remove all segment labels
  function clearSegmentLabels() {
    while (segmentLabels.length) {
      const rec = segmentLabels.pop();
      rec.div.remove();
    }
  }

  // ------------------------------------------------------------
  // LON/LAT CONVERSION: robustly map XY → WGS84 using proj4 if available
  // ------------------------------------------------------------
  // Handles UTM / local projections by reading scene.userData.proj4 (if present).
  function toLonLatXY(x, y) {
    const sUD = (Q3D?.application?.scene?.userData) || {};
    const fromCRS =
      sUD.proj4 || sUD.proj || sUD.crs || sUD.crsDef || sUD.projection || null;

    // Prefer proj4 if CRS is provided by the scene
    if (window.proj4 && fromCRS) {
      try {
        const [lon, lat] = proj4(fromCRS, "EPSG:4326", [x, y]);
        return { lon, lat };
      } catch (e) {
        console.warn("proj4 transform failed; falling back to heuristics", e);
      }
    }

    // Heuristic: already degrees?
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
      return { lon: x, lat: y };
    }

    // Fallback: treat as Spherical Web Mercator meters (EPSG:3857)
    const R_MAJOR = 6378137.0;
    const lon = (x / R_MAJOR) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(y / R_MAJOR)) - Math.PI / 2) * (180 / Math.PI);
    return { lon, lat };
  }

  // ------------------------------------------------------------
  // WAYPOINT LABELS: lat/lon/depth  (UPDATED: TOP-RIGHT ANCHOR)
  // ------------------------------------------------------------
  // Data store: marker.uuid -> { div, marker, offsetPx }
  const waypointLabels = new Map();

// ------------------------------------------------------------
// WAYPOINT LABEL VISIBILITY (toggle)
// ------------------------------------------------------------
// Only affects waypoint (lat/lon/depth) labels. Segment labels (distance/heading) are unchanged.
const WAYPOINT_LABELS_LSKEY = "q3d_waypointLabelsVisible";
let waypointLabelsVisible = (function () {
  try {
    const v = localStorage.getItem(WAYPOINT_LABELS_LSKEY);
    return (v === null) ? true : (v === "1");
  } catch (e) {
    return true;
  }
})();

function setWaypointLabelsVisible(visible) {
  waypointLabelsVisible = !!visible;
  try { localStorage.setItem(WAYPOINT_LABELS_LSKEY, waypointLabelsVisible ? "1" : "0"); } catch (e) {}
  // No UI needed; but a console hint is useful during testing.
  console.log("Waypoint labels:", waypointLabelsVisible ? "ON" : "OFF");
}

function toggleWaypointLabels() {
  setWaypointLabelsVisible(!waypointLabelsVisible);
}

  // Project and place each waypoint label so its TOP-RIGHT corner is just
  // above the projected marker position, with a small pixel gap.
  (function projectWaypointsAnchored() {
    const v = new THREE.Vector3();

    function tick() {
      // Recompute each frame to survive resizes/scrollbars/zoom/layout shifts
      const rect = app.renderer.domElement.getBoundingClientRect();
      const cam = app.camera;

      for (const { div, marker, offsetPx } of waypointLabels.values()) {

// Project 3D → NDC → screen px
v.copy(marker.position).project(cam);
const x = (v.x + 1) * 0.5 * rect.width + rect.left;
const y = (1 - v.y) * 0.5 * rect.height + rect.top;

// Visibility: hide if behind camera OR if toggled off
const inFront = (v.z < 1);
const shouldShow = waypointLabelsVisible && inFront;
div.style.display = shouldShow ? "block" : "none";
if (!shouldShow) continue;

// Measure current label box (handles font/zoom/line breaks)
const w = div.offsetWidth;
const h = div.offsetHeight;

// Anchor: place label so its TOP-RIGHT corner sits just above the point
const left = Math.round(x - w - offsetPx);
const top  = Math.round(y - h - offsetPx);

// Force absolute placement for waypoint labels only
div.style.transform = "none";
div.style.transformOrigin = "top right";
div.style.left = `${left}px`;
div.style.top  = `${top}px`;
      }

      requestAnimationFrame(tick);
    }
    tick();
  })();

  // Create a waypoint label (lat, lon, depth) and register for projection
  function addWaypointLabel(marker) {
    // Convert the 3D scene position back to map (XY in layer CRS)
    const mapPt = app.scene.toMapCoordinates
      ? app.scene.toMapCoordinates(marker.position)
      : marker.position;

    // Robust lon/lat via proj4 if available
    const { lon, lat } = toLonLatXY(mapPt.x, mapPt.y);

    const depthFt = Math.abs(mapPt.z * 3.28084); // positive depth
    // Display as (lat, lon) per your preference
    const html = `${lat.toFixed(4)}, ${lon.toFixed(4)}<br>${depthFt.toFixed(1)} ft`;

    const div = makeDivLabel(html, "right"); // reuse helper for look & feel
    // Override the default centering for waypoint labels only:
    div.style.transform = "none";
    div.style.transformOrigin = "top right";

    // Pixel gap between point and label box (tweak to taste)
    const offsetPx = 6;

    waypointLabels.set(marker.uuid, { div, marker, offsetPx });
  }

  function removeLastWaypointLabel() {
    const keys = Array.from(waypointLabels.keys());
    const lastUUID = keys[keys.length - 1];
    if (!lastUUID) return;
    const rec = waypointLabels.get(lastUUID);
    if (rec) rec.div.remove();
    waypointLabels.delete(lastUUID);
  }

  function clearWaypointLabels() {
    for (const rec of waypointLabels.values()) rec.div.remove();
    waypointLabels.clear();
  }

  // ------------------------------------------------------------
  // MEASURE TOOL HOOKS
  // ------------------------------------------------------------
  // Hook into Qgis2threejs' measure tool lifecycle to sync labels
  const origAdd = app.measure.addPoint;
  app.measure.addPoint = function (...args) {
    const out = origAdd.apply(this, args);
    const mg = this.markerGroup;
    const lastMarker = mg?.children?.[mg.children.length - 1];
    if (lastMarker) {
      addWaypointLabel(lastMarker);
      if (mg.children.length >= 2) addSegmentLabelFromLastTwo();
    }
    return out;
  };

  const origRemove = app.measure.removeLastPoint;
  app.measure.removeLastPoint = function (...args) {
    const out = origRemove.apply(this, args);
    removeLastWaypointLabel();
    removeLastSegmentLabel();
    return out;
  };

  const origClear = app.measure.clear;
  app.measure.clear = function (...args) {
    const out = origClear.apply(this, args);
    clearWaypointLabels();
    clearSegmentLabels();
    return out;
  };

// ------------------------------------------------------------
// HOTKEY: toggle waypoint (lat/lon/depth) labels
// ------------------------------------------------------------
// NOTE: Ctrl+W is a browser "close tab" shortcut and won't reliably reach JavaScript.
// Also plain "W" is already used by Qgis2threejs for wireframe mode.
// So we use Shift+L (L = Labels) by default.
window.addEventListener("keydown", function (e) {
  // Ignore if typing in a form element
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  const key = e.key || "";
  const isShiftL = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && (key === "L" || key === "l");
  if (isShiftL) {
    e.preventDefault();
    e.stopImmediatePropagation();
    toggleWaypointLabels();
  }
}, true); // capture = intercept before Q3D's key handler

  // ------------------------------------------------------------
  // AUTO-CENTER CAMERA ON SCENE ONCE
  // ------------------------------------------------------------
  // This will run once on startup. It waits until the scene has
  // at least one visible mesh, then:
  //   1) computes the overall bounding box
  //   2) moves the camera to a reasonable distance
  //   3) updates OrbitControls target
  let cameraCentered = false;

  function centerCameraOnSceneWhenReady() {
    if (cameraCentered) return;

    const scene3D = app.scene;
    if (!scene3D) {
      requestAnimationFrame(centerCameraOnSceneWhenReady);
      return;
    }

    const box = new THREE.Box3();
    scene3D.traverse(obj => {
      // Only include visible meshes in the bounding box
      if (obj.isMesh && obj.visible) {
        box.expandByObject(obj);
      }
    });

    // If nothing has been added yet, try again next frame
    if (box.isEmpty()) {
      requestAnimationFrame(centerCameraOnSceneWhenReady);
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    // Factor controls how far back the camera sits; tweak to taste
    const distance = maxDim * 1.5 || 100;

    const camera = app.camera;
    const controls = app.controls;

    // Put the camera diagonally above the scene looking toward the center
    camera.position.set(
      center.x + distance,
      center.y - distance,
      center.z + distance
    );
    camera.lookAt(center);

    if (controls) {
      controls.target.copy(center);
      controls.update();
    }

    cameraCentered = true;
    app.render();
  }

  // Kick off the centering loop
  requestAnimationFrame(centerCameraOnSceneWhenReady);

});
