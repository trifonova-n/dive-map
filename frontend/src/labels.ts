/**
 * Creates floating 2D HTML label elements that overlay the 3D scene.
 * Visual styling lives in src/styles/custom.css — .label base + .label-waypoint / .label-segment modifiers.
 */
export function makeDivLabel(
  text: string,
  kind: "waypoint" | "segment",
  align: "center" | "right" = "center"
): HTMLDivElement {
  const div = document.createElement("div");
  div.className = `label label-${kind}`;
  div.innerHTML = text;
  Object.assign(div.style, {
    position: "absolute",
    pointerEvents: "none",
    zIndex: "10000",
    whiteSpace: "nowrap",
    lineHeight: "1.2em",
    transform:
      align === "right"
        ? "translate(20%, -50%)"
        : "translate(-50%, -120%)",
  });
  document.body.appendChild(div);
  return div;
}
