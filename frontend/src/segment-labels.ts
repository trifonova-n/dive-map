import type { SiteConfig } from "./config";
import { makeDivLabel } from "./labels";
import type { LabelRecord } from "./projection";

/**
 * Pure computation: distance in feet and bearings between two 3D points.
 * `trueBearing` is the world-space bearing (matches the on-screen line direction
 * when north is up); `heading` is the magnetic compass reading for the diver.
 */
export function computeSegment(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  metersToFeet: number,
  magDeclination: number
): { distFt: number; heading: number; trueBearing: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const distFt = Math.sqrt(dx * dx + dy * dy + dz * dz) * metersToFeet;
  const trueBearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  const heading = (trueBearing + magDeclination + 360) % 360;
  return { distFt, heading, trueBearing };
}

/**
 * Two-line HTML: neutral distance on top, rotated compass needle + heading below.
 * Needle uses `trueBearing` so it visually aligns with the on-screen line; the
 * numeric readout uses magnetic `heading` for diver compass use.
 */
function buildSegmentHtml(distFt: number, heading: number, trueBearing: number): string {
  const hdg = heading.toFixed(1);
  // Elongated kite shape with a notched base — tip unambiguous at any rotation.
  const needle =
    `<svg class="seg-arrow" viewBox="-5 -7 10 14" style="transform:rotate(${trueBearing.toFixed(1)}deg)">` +
    `<polygon points="0,-7 4,6 0,3 -4,6" fill="currentColor"/>` +
    `</svg>`;
  return (
    `<span class="seg-dist">${distFt.toFixed(1)} ft</span>` +
    `<span class="seg-hdg">${needle}${hdg}°M</span>`
  );
}

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

    const { distFt, heading, trueBearing } = computeSegment(
      a, b, this.config.metersToFeet, this.config.magDeclination
    );

    const mid = new THREE.Vector3(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      (a.z + b.z) / 2 + this.config.midLabelLift
    );

    const div = makeDivLabel(buildSegmentHtml(distFt, heading, trueBearing), "segment", "center");
    const arrow = div.querySelector("svg.seg-arrow") as SVGElement | null;
    this.labels.push({
      div,
      position: mid,
      a: new THREE.Vector3(a.x, a.y, a.z),
      b: new THREE.Vector3(b.x, b.y, b.z),
      arrow: arrow ?? undefined,
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
