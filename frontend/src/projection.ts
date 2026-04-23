/**
 * Continuous requestAnimationFrame loops that project 3D label positions
 * onto 2D screen coordinates each frame.
 */

export interface LabelRecord {
  div: HTMLDivElement;
  position: THREE.Vector3;
  /** Optional segment endpoints: when set, the projector rotates `arrow` to the on-screen A→B angle. */
  a?: THREE.Vector3;
  b?: THREE.Vector3;
  arrow?: SVGElement;
}

export interface WaypointLabelRecord {
  div: HTMLDivElement;
  marker: THREE.Object3D;
  offsetPx: number;
}

export interface LandmarkProjectorRecord {
  div: HTMLDivElement;
  position: THREE.Vector3;
}

/**
 * Projects an array of labels (used for segment labels) from 3D to 2D
 * each frame, centering each label div at the projected point.
 */
export function runProjector(
  labelArray: LabelRecord[],
  app: Q3DApplication
): void {
  const v = new THREE.Vector3();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();

  function tick() {
    const rect = app.renderer.domElement.getBoundingClientRect();
    const cam = app.camera;
    for (const lbl of labelArray) {
      v.copy(lbl.position).project(cam);
      const x = (v.x + 1) / 2 * rect.width + rect.left;
      const y = (-v.y + 1) / 2 * rect.height + rect.top;
      lbl.div.style.display = v.z < 1 ? "block" : "none";
      lbl.div.style.left = `${x}px`;
      lbl.div.style.top = `${y}px`;

      if (lbl.arrow && lbl.a && lbl.b) {
        va.copy(lbl.a).project(cam);
        vb.copy(lbl.b).project(cam);
        // Screen-space delta: +x right, +y up (NDC) → flip y for CSS where +y is down.
        // Rotate so the needle's tip (0,-7 in its viewBox, i.e. "up") points along A→B.
        const dxs = vb.x - va.x;
        const dys = -(vb.y - va.y); // NDC → screen y
        const deg = (Math.atan2(dxs, -dys) * 180) / Math.PI;
        lbl.arrow.style.transform = `rotate(${deg.toFixed(1)}deg)`;
      }
    }
    requestAnimationFrame(tick);
  }
  tick();
}

/**
 * Projects landmark labels from 3D to 2D each frame. Each frame, snapshots
 * obstacle rects (waypoint + segment labels) via the caller-supplied closure
 * and hides any landmark whose projected rect intersects an obstacle.
 * Route labels always win; landmarks are context and yield.
 */
export function projectLandmarks(
  records: LandmarkProjectorRecord[],
  app: Q3DApplication,
  getObstacleRects: () => DOMRect[]
): void {
  const v = new THREE.Vector3();
  // Labels declutter at overview zoom: only shown within this camera distance
  // of each landmark. Scene diagonal is ~1500 m; 800 m shows labels once the
  // user zooms in past the initial full-scene fit.
  const LABEL_VISIBLE_MAX_DISTANCE = 800;

  function tick() {
    const rect = app.renderer.domElement.getBoundingClientRect();
    const cam = app.camera;

    // Pass 1: position each visible landmark div.
    for (const r of records) {
      if (cam.position.distanceTo(r.position) > LABEL_VISIBLE_MAX_DISTANCE) {
        r.div.style.display = "none";
        continue;
      }
      v.copy(r.position).project(cam);
      if (v.z >= 1) {
        r.div.style.display = "none";
        continue;
      }
      const x = (v.x + 1) * 0.5 * rect.width + rect.left;
      const y = (-v.y + 1) * 0.5 * rect.height + rect.top;
      r.div.style.left = `${x}px`;
      r.div.style.top = `${y}px`;
      r.div.style.display = "block";
    }

    // Pass 2: now that positions are applied, measure and cull overlaps.
    const obstacles = getObstacleRects();
    if (obstacles.length) {
      for (const r of records) {
        if (r.div.style.display === "none") continue;
        const lr = r.div.getBoundingClientRect();
        for (const o of obstacles) {
          if (
            lr.left < o.right &&
            lr.right > o.left &&
            lr.top < o.bottom &&
            lr.bottom > o.top
          ) {
            r.div.style.display = "none";
            break;
          }
        }
      }
    }

    requestAnimationFrame(tick);
  }
  tick();
}

/**
 * Projects waypoint labels from 3D to 2D each frame, anchoring each
 * label's top-right corner just above the projected marker position.
 */
export function projectWaypointsAnchored(
  waypointLabels: Map<string, WaypointLabelRecord>,
  app: Q3DApplication,
  isVisible: () => boolean
): void {
  const v = new THREE.Vector3();

  function tick() {
    const rect = app.renderer.domElement.getBoundingClientRect();
    const cam = app.camera;

    for (const { div, marker, offsetPx } of waypointLabels.values()) {
      v.copy(marker.position).project(cam);
      const x = (v.x + 1) * 0.5 * rect.width + rect.left;
      const y = (1 - v.y) * 0.5 * rect.height + rect.top;

      const inFront = v.z < 1;
      const shouldShow = isVisible() && inFront;
      div.style.display = shouldShow ? "block" : "none";
      if (!shouldShow) continue;

      const w = div.offsetWidth;
      const h = div.offsetHeight;

      const left = Math.round(x - w - offsetPx);
      const top = Math.round(y - h - offsetPx);

      div.style.transform = "none";
      div.style.transformOrigin = "top right";
      div.style.left = `${left}px`;
      div.style.top = `${top}px`;
    }

    requestAnimationFrame(tick);
  }
  tick();
}
