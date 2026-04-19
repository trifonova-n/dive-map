/**
 * Converts scene map coordinates (XY in the layer's CRS) to WGS84 lon/lat.
 *
 * Conversion chain:
 *   1. proj4 with scene CRS (if available)
 *   2. Heuristic: already degrees?
 *   3. Fallback: treat as EPSG:3857 (Web Mercator meters)
 */
export function toLonLatXY(
  x: number,
  y: number,
  sceneUserData: Q3DSceneUserData
): { lon: number; lat: number } {
  const fromCRS =
    sceneUserData.proj4 ||
    sceneUserData.proj ||
    sceneUserData.crs ||
    sceneUserData.crsDef ||
    sceneUserData.projection ||
    null;

  if (typeof proj4 !== "undefined" && fromCRS) {
    try {
      const [lon, lat] = proj4(fromCRS, "EPSG:4326", [x, y]);
      return { lon, lat };
    } catch (e) {
      console.warn("proj4 transform failed; falling back to heuristics", e);
    }
  }

  // Heuristic: already degrees?
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return { lon: x, lat: y };
  }

  // Fallback: treat as Spherical Web Mercator meters (EPSG:3857)
  const R_MAJOR = 6378137.0;
  const lon = (x / R_MAJOR) * (180 / Math.PI);
  const lat =
    (2 * Math.atan(Math.exp(y / R_MAJOR)) - Math.PI / 2) * (180 / Math.PI);
  return { lon, lat };
}
