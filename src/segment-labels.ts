import type { SiteConfig } from "./config";
import { makeDivLabel } from "./labels";
import type { LabelRecord } from "./projection";

/**
 * Manages segment labels — distance (ft) + magnetic heading displayed
 * at the midpoint between consecutive waypoints.
 */
export class SegmentLabelManager {
  readonly labels: LabelRecord[] = [];

  constructor(private config: SiteConfig) {}

  /** Creates a label between the last two markers in the measure group. */
  addFromLastTwo(app: Q3DApplication): void {
    const mg = app.measure?.markerGroup;
    if (!mg || mg.children.length < 2) return;

    const a = mg.children[mg.children.length - 2].position;
    const b = mg.children[mg.children.length - 1].position;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const distFt =
      Math.sqrt(dx * dx + dy * dy + dz * dz) * this.config.metersToFeet;

    let heading = (Math.atan2(dx, dy) * 180) / Math.PI;
    heading = (heading + this.config.magDeclination + 360) % 360;

    const mid = new THREE.Vector3(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      (a.z + b.z) / 2 + this.config.midLabelLift
    );

    const text = `${distFt.toFixed(1)} ft<br>${heading.toFixed(1)}\u00B0M`;
    const div = makeDivLabel(text, "center");
    this.labels.push({ div, position: mid });

    // Brighten the existing Qgis2threejs measure line segments
    const brightness = parseInt(this.config.lineBrightness, 16);
    app.scene.traverse((obj: THREE.Object3D) => {
      if (obj.isLine && obj.parent?.name === "measure line") {
        obj.material.color.setHex(brightness);
        obj.material.needsUpdate = true;
      }
    });
  }

  removeLast(): void {
    const rec = this.labels.pop();
    if (rec) rec.div.remove();
  }

  clear(): void {
    while (this.labels.length) {
      const rec = this.labels.pop();
      if (rec) rec.div.remove();
    }
  }
}
