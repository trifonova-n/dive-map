import type { SiteConfig } from "./config";

/**
 * One-shot camera centering: waits for the first visible mesh to appear
 * in the scene, computes a bounding box, and frames the camera on it.
 */
export function centerCameraOnSceneWhenReady(
  app: Q3DApplication,
  config: SiteConfig
): void {
  let done = false;

  function attempt() {
    if (done) return;

    const scene3D = app.scene;
    if (!scene3D) {
      requestAnimationFrame(attempt);
      return;
    }

    const box = new THREE.Box3();
    scene3D.traverse((obj: THREE.Object3D) => {
      if (obj.isMesh && obj.visible) {
        box.expandByObject(obj);
      }
    });

    if (box.isEmpty()) {
      requestAnimationFrame(attempt);
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * config.cameraDistanceFactor || 100;

    const camera = app.camera;
    const controls = app.controls;

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

    done = true;
    app.render();
  }

  requestAnimationFrame(attempt);
}
