import type { SiteConfig } from "./config";
import { makeDivLabel } from "./labels";

export interface LandmarkRecord {
  div: HTMLDivElement;
  marker: THREE.Object3D;
  position: THREE.Vector3;
}

type Adder = { add(o: THREE.Object3D): void; remove(o: THREE.Object3D): void };

/**
 * Manages curated + user-owned landmarks as small gold spheres in the 3D scene
 * with DOM labels above. Shares one sphere geometry/material across all landmarks.
 */
export class LandmarkLabelManager {
  readonly records: LandmarkRecord[] = [];
  private readonly group: THREE.Group;
  private readonly geom: unknown;
  private readonly mtl: unknown;
  private readonly app: Q3DApplication;

  constructor(private config: SiteConfig, app: Q3DApplication) {
    this.app = app;
    const T = window.THREE as unknown as Record<string, new (...args: unknown[]) => unknown>;
    const Q3DGroupCtor = (window as unknown as { Q3DGroup: new () => THREE.Group }).Q3DGroup;

    // Gold to match the label accent. Geometry radius is tiny because
    // `app.queryMarker.onBeforeRender` rescales each frame by distance-to-camera,
    // giving a constant on-screen size. Waypoint markers use the same hook with
    // radius 0.004; landmarks are slightly larger so they read as distinct.
    this.geom = new T.SphereBufferGeometry(0.005, 20, 14);
    this.mtl = new T.MeshBasicMaterial({ color: 0xd4a84b });

    this.group = new Q3DGroupCtor();
    this.group.name = "landmarks";
    (app.scene as unknown as Adder).add(this.group);
  }

  add(name: string, lat: number, lon: number, depth_m: number | null): void {
    const depthForScene = depth_m ?? 0;
    const world = this.app.scene.toWorldCoordinates(
      { x: lon, y: lat, z: -depthForScene },
      true
    );
    // Surface features (no depth) sit at z=0 where the terrain mesh can bury
    // them; a small lift prevents that. Underwater features are placed at
    // their true depth with no adjustment.
    const z = depth_m == null ? world.z + 3 : world.z;

    const T = window.THREE as unknown as Record<string, new (...args: unknown[]) => unknown>;
    const Vec3 = T.Vector3 as unknown as new (x: number, y: number, z: number) => THREE.Vector3;
    const mesh = new T.Mesh(
      this.geom as unknown as object,
      this.mtl as unknown as object
    ) as unknown as THREE.Object3D & {
      onBeforeRender: unknown;
    };
    mesh.position.set(world.x, world.y, z);
    // Reuse the Q3D per-frame scale hook so the sphere stays a constant size on
    // screen (same behavior as waypoint markers).
    mesh.onBeforeRender = (this.app.queryMarker as unknown as {
      onBeforeRender: unknown;
    }).onBeforeRender;
    (this.group as unknown as Adder).add(mesh);

    const depthHtml =
      depth_m != null
        ? `<br><span class="lm-depth">${(
            Math.abs(depth_m) * this.config.metersToFeet
          ).toFixed(0)} ft</span>`
        : "";
    const div = makeDivLabel(`${escapeHtml(name)}${depthHtml}`, "landmark", "center");

    this.records.push({
      div,
      marker: mesh,
      position: new Vec3(world.x, world.y, z),
    });
  }

  clear(): void {
    for (const r of this.records) {
      r.div.remove();
      (this.group as unknown as Adder).remove(r.marker);
    }
    this.records.length = 0;
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
