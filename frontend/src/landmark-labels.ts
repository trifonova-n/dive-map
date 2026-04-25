import type { LandmarkAPI } from "./api-client";
import type { SiteConfig } from "./config";
import { makeDivLabel } from "./labels";

export interface LandmarkRecord {
  id: number;
  userId: number | null;
  div: HTMLDivElement;
  marker: THREE.Object3D;
  position: THREE.Vector3;
}

type Adder = { add(o: THREE.Object3D): void; remove(o: THREE.Object3D): void };

/**
 * Manages curated + user-owned landmarks as small spheres in the 3D scene
 * with DOM labels above. User-owned landmarks render in a different color
 * and their labels are clickable (curated labels are too — both open the
 * detail view).
 */
export class LandmarkLabelManager {
  // Array kept in insertion order so `projectLandmarks` can iterate it
  // by reference every frame (see main.ts wiring).
  readonly records: LandmarkRecord[] = [];
  private readonly byId: Map<number, LandmarkRecord> = new Map();
  private readonly group: THREE.Group;
  private readonly geom: unknown;
  private readonly mtlCurated: unknown;
  private readonly mtlOwned: unknown;
  private readonly app: Q3DApplication;
  private onSelect: ((id: number) => void) | null = null;

  constructor(private config: SiteConfig, app: Q3DApplication) {
    this.app = app;
    const T = window.THREE as unknown as Record<string, new (...args: unknown[]) => unknown>;
    const Q3DGroupCtor = (window as unknown as { Q3DGroup: new () => THREE.Group }).Q3DGroup;

    // Geometry radius is tiny because `app.queryMarker.onBeforeRender` rescales
    // each frame by distance-to-camera, giving a constant on-screen size.
    this.geom = new T.SphereBufferGeometry(0.005, 20, 14);
    // Same gold family for both; user-owned is a touch lighter/brighter so
    // it reads as "yours" without breaking the palette.
    this.mtlCurated = new T.MeshBasicMaterial({ color: 0xd4a84b });
    this.mtlOwned = new T.MeshBasicMaterial({ color: 0xf0d878 });

    this.group = new Q3DGroupCtor();
    this.group.name = "landmarks";
    (app.scene as unknown as Adder).add(this.group);
  }

  setOnSelect(cb: (id: number) => void): void {
    this.onSelect = cb;
  }

  add(landmark: LandmarkAPI): void {
    // Idempotent-ish: if it's already there, replace it.
    if (this.byId.has(landmark.id)) this.remove(landmark.id);

    const depth_m = landmark.depth_m;
    const depthForScene = depth_m ?? 0;
    const world = this.app.scene.toWorldCoordinates(
      { x: landmark.longitude, y: landmark.latitude, z: -depthForScene },
      true
    );
    // Surface features (no depth) sit at z=0 where the terrain mesh can bury
    // them; a small lift prevents that. Underwater features are placed at
    // their true depth with no adjustment.
    const z = depth_m == null ? world.z + 3 : world.z;

    const T = window.THREE as unknown as Record<string, new (...args: unknown[]) => unknown>;
    const Vec3 = T.Vector3 as unknown as new (x: number, y: number, z: number) => THREE.Vector3;
    const mtl = landmark.user_id != null ? this.mtlOwned : this.mtlCurated;
    const mesh = new T.Mesh(
      this.geom as unknown as object,
      mtl as unknown as object
    ) as unknown as THREE.Object3D & { onBeforeRender: unknown };
    mesh.position.set(world.x, world.y, z);
    // Reuse the Q3D per-frame scale hook so the sphere stays a constant size on
    // screen (same behavior as waypoint markers).
    mesh.onBeforeRender = (this.app.queryMarker as unknown as {
      onBeforeRender: unknown;
    }).onBeforeRender;
    (this.group as unknown as Adder).add(mesh);

    const div = makeDivLabel(this.labelHtml(landmark), "landmark", "center");
    if (landmark.user_id != null) div.classList.add("label-landmark--owned");
    // Override the pointerEvents:"none" default in makeDivLabel so labels are
    // clickable. Curated labels also open the detail view (read-only).
    div.style.pointerEvents = "auto";
    div.style.cursor = "pointer";
    div.addEventListener("click", () => this.onSelect?.(landmark.id));

    const record: LandmarkRecord = {
      id: landmark.id,
      userId: landmark.user_id,
      div,
      marker: mesh,
      position: new Vec3(world.x, world.y, z),
    };
    this.records.push(record);
    this.byId.set(landmark.id, record);
  }

  /**
   * Update label text in place (name + depth). Position is fixed for v1;
   * moving a landmark requires delete + recreate.
   */
  update(landmark: LandmarkAPI): void {
    const rec = this.byId.get(landmark.id);
    if (!rec) return;
    rec.div.innerHTML = this.labelHtml(landmark);
  }

  remove(id: number): void {
    const rec = this.byId.get(id);
    if (!rec) return;
    rec.div.remove();
    (this.group as unknown as Adder).remove(rec.marker);
    this.byId.delete(id);
    const idx = this.records.indexOf(rec);
    if (idx >= 0) this.records.splice(idx, 1);
  }

  clear(): void {
    for (const r of this.records) {
      r.div.remove();
      (this.group as unknown as Adder).remove(r.marker);
    }
    this.records.length = 0;
    this.byId.clear();
  }

  private labelHtml(landmark: LandmarkAPI): string {
    const depthHtml =
      landmark.depth_m != null
        ? `<br><span class="lm-depth">${(
            Math.abs(landmark.depth_m) * this.config.metersToFeet
          ).toFixed(0)} ft</span>`
        : "";
    return `${escapeHtml(landmark.name)}${depthHtml}`;
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
