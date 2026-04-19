import type { SiteConfig } from "./config";
import { toLonLatXY } from "./crs";
import { makeDivLabel } from "./labels";
import type { WaypointLabelRecord } from "./projection";

const LS_KEY = "q3d_waypointLabelsVisible";

/**
 * Manages waypoint labels — lat/lon/depth displayed at each marker,
 * anchored top-right of the projected position.
 */
export class WaypointLabelManager {
  readonly labels = new Map<string, WaypointLabelRecord>();
  private visible: boolean;

  constructor(private config: SiteConfig) {
    try {
      const v = localStorage.getItem(LS_KEY);
      this.visible = v === null ? true : v === "1";
    } catch {
      this.visible = true;
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    try {
      localStorage.setItem(LS_KEY, v ? "1" : "0");
    } catch {
      // localStorage unavailable
    }
    console.log("Waypoint labels:", v ? "ON" : "OFF");
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  /** Creates a waypoint label for a marker, converting its position to lat/lon/depth. */
  add(marker: THREE.Object3D, app: Q3DApplication): void {
    const mapPt = app.scene.toMapCoordinates
      ? app.scene.toMapCoordinates(marker.position as THREE.Vector3)
      : marker.position;

    const { lon, lat } = toLonLatXY(
      mapPt.x,
      mapPt.y,
      app.scene.userData
    );

    const depthFt = Math.abs(mapPt.z * this.config.metersToFeet);
    const html = `${lat.toFixed(4)}, ${lon.toFixed(4)}<br>${depthFt.toFixed(1)} ft`;

    const div = makeDivLabel(html, "right");
    div.style.transform = "none";
    div.style.transformOrigin = "top right";

    this.labels.set(marker.uuid, {
      div,
      marker,
      offsetPx: this.config.labelOffsetPx,
    });
  }

  removeLast(): void {
    const keys = Array.from(this.labels.keys());
    const lastUUID = keys[keys.length - 1];
    if (!lastUUID) return;
    const rec = this.labels.get(lastUUID);
    if (rec) rec.div.remove();
    this.labels.delete(lastUUID);
  }

  clear(): void {
    for (const rec of this.labels.values()) rec.div.remove();
    this.labels.clear();
  }
}
