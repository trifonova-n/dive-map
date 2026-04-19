/**
 * Continuous requestAnimationFrame loops that project 3D label positions
 * onto 2D screen coordinates each frame.
 */

export interface LabelRecord {
  div: HTMLDivElement;
  position: THREE.Vector3;
}

export interface WaypointLabelRecord {
  div: HTMLDivElement;
  marker: THREE.Object3D;
  offsetPx: number;
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
