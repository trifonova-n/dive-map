import type { SiteConfig } from "./config";

/**
 * Monkey-patches Q3D.gui.showQueryResult so the click popup shows depth in
 * feet instead of elevation in meters. The vendor renders "<DMS>, Elev. <z>"
 * into #qr_coords; we let it run, then swap the suffix.
 */
export function patchQueryPopup(config: SiteConfig): void {
  const gui = Q3D.gui;
  const orig = gui.showQueryResult.bind(gui);
  gui.showQueryResult = function (point, layer, obj, showCoords) {
    orig(point, layer, obj, showCoords);
    if (!showCoords) return;
    const el = Q3D.E("qr_coords");
    if (!el) return;
    const pt = Q3D.application.scene.toMapCoordinates(point as THREE.Vector3);
    const depthFt = Math.abs(pt.z * config.metersToFeet);
    el.innerHTML = el.innerHTML.replace(
      /, Elev\.\s*-?[\d.]+/,
      `, Depth: ${depthFt.toFixed(1)} ft`
    );
  };
}
