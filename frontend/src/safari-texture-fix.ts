/**
 * Safari refuses to load `data:` URIs larger than a few MB, surfacing as
 * "Not allowed to load local resource". Our baked scene.js embeds a ~90 MB
 * base64 texture, so on Safari the DEM renders with no surface material.
 *
 * Fix: before the scene JSON reaches Qgis2threejs' material loader, decode
 * oversized data URIs into Blobs and swap `image.base64` for `image.url`
 * pointing at a blob: URL. Blob URLs have no size limit in Safari and Chrome
 * handles them identically, so this runs unconditionally.
 */

function dataURItoBlob(dataURI: string): Blob {
  const commaIdx = dataURI.indexOf(",");
  const header = dataURI.slice(5, commaIdx); // strip leading "data:"
  const semiIdx = header.indexOf(";");
  const mime = semiIdx >= 0 ? header.slice(0, semiIdx) : header;
  const isBase64 = header.includes(";base64");
  const payload = dataURI.slice(commaIdx + 1);

  if (!isBase64) {
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function rewriteImageNode(image: { base64?: string; url?: string }): void {
  const src = image.base64;
  if (typeof src !== "string" || !src.startsWith("data:")) return;
  const blob = dataURItoBlob(src);
  image.url = URL.createObjectURL(blob);
  delete image.base64;
}

function walk(node: unknown): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item);
    return;
  }
  const obj = node as Record<string, unknown>;
  const image = obj.image;
  if (image && typeof image === "object") {
    rewriteImageNode(image as { base64?: string; url?: string });
  }
  for (const key of Object.keys(obj)) walk(obj[key]);
}

export function patchLoadJSONObjectForSafari(app: Q3DApplication): void {
  const original = app.loadJSONObject.bind(app);
  app.loadJSONObject = function (jsonObject: unknown) {
    walk(jsonObject);
    return original(jsonObject);
  };
}
