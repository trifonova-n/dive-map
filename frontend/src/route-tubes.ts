import type { SiteConfig } from "./config";

type LooseMesh = THREE.Mesh & {
  position: THREE.Vector3;
  scale: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  quaternion: { setFromUnitVectors(from: unknown, to: unknown): unknown };
};

type Adder = { add(o: THREE.Object3D): void; remove(o: THREE.Object3D): void };

/**
 * Manages thin cylinders drawn between consecutive waypoints as the visible
 * route. Replaces the Qgis2threejs measure line (which renders as a 1px
 * primitive regardless of LineBasicMaterial.linewidth).
 */
export class RouteTubeManager {
  private readonly tubes: THREE.Object3D[] = [];
  private readonly group: THREE.Group;
  private readonly geom: unknown;
  private readonly mtl: unknown;
  private readonly app: Q3DApplication;

  constructor(private config: SiteConfig, app: Q3DApplication) {
    this.app = app;
    const T = window.THREE as unknown as Record<string, new (...args: unknown[]) => unknown>;
    const Q3DGroupCtor = (window as unknown as { Q3DGroup: new () => THREE.Group }).Q3DGroup;

    const color = parseInt(config.lineBrightness, 16);
    const radius = config.routeTubeRadius;
    // Unit-height cylinder; per-segment mesh scales Y to segment length.
    this.geom = new T.CylinderBufferGeometry(radius, radius, 1, 16, 1, false);
    this.mtl = new T.MeshBasicMaterial({ color });

    this.group = new Q3DGroupCtor();
    this.group.name = "route tubes";
    // Match the lift Q3D applies to its native lineGroup so tubes sit above terrain.
    this.group.position.z = (this.group.position.z ?? 0) + 3;
    (app.scene as unknown as Adder).add(this.group);
  }

  /** Create a tube between the last two markers in the measure group. */
  addFromLastTwo(app: Q3DApplication): void {
    const mg = app.measure?.markerGroup;
    if (!mg || mg.children.length < 2) return;

    const a = mg.children[mg.children.length - 2].position;
    const b = mg.children[mg.children.length - 1].position;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len === 0) return;

    const T = window.THREE as unknown as Record<string, new (...args: unknown[]) => unknown>;
    const mesh = new T.Mesh(this.geom as unknown as object, this.mtl as unknown as object) as unknown as LooseMesh;

    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.scale.set(1, len, 1);

    // Cylinder's default axis is +Y; rotate it to point from A to B.
    const Vec3 = T.Vector3 as unknown as new (x: number, y: number, z: number) => THREE.Vector3;
    const up = new Vec3(0, 1, 0);
    const dir = new Vec3(dx / len, dy / len, dz / len);
    mesh.quaternion.setFromUnitVectors(up, dir);

    this.tubes.push(mesh as unknown as THREE.Object3D);
    (this.group as unknown as Adder).add(mesh as unknown as THREE.Object3D);
    this.app.render();
  }

  removeLast(): void {
    const mesh = this.tubes.pop();
    if (!mesh) return;
    (this.group as unknown as Adder).remove(mesh);
    this.app.render();
  }

  clear(): void {
    if (!this.tubes.length) return;
    while (this.tubes.length) {
      const mesh = this.tubes.pop();
      if (mesh) (this.group as unknown as Adder).remove(mesh);
    }
    this.app.render();
  }
}
