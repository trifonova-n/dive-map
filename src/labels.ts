/**
 * Creates floating 2D HTML label elements that overlay the 3D scene.
 * Used for both waypoint (lat/lon/depth) and segment (distance/heading) labels.
 * Styling is controlled by the `.label` class in src/styles/custom.css.
 */
export function makeDivLabel(
  text: string,
  align: "center" | "right" = "center"
): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "label";
  div.innerHTML = text;
  Object.assign(div.style, {
    position: "absolute",
    color: "yellow",
    background: "rgba(0,0,0,0.6)",
    padding: "2px 4px",
    borderRadius: "8px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.8)",
    fontFamily: "monospace",
    fontSize: "11px",
    fontWeight: "bold",
    textShadow: "1px 1px 2px black",
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
