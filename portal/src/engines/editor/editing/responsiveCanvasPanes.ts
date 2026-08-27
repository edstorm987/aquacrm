export type EditorCanvasPane = "preview" | "code";

/**
 * The attributes consumed by the compact-canvas media rule.
 *
 * This is deliberately independent from Tailwind display utilities. The real
 * browser proved that a composed `hidden xl:block`/`flex` class string could
 * update its button state while leaving the old pane painted. These literal
 * data values plus the important media rule below make the state-to-layout
 * contract observable and immune to generated utility order.
 */
export function responsiveCanvasPaneAttributes(
  activePane: EditorCanvasPane,
  pane: EditorCanvasPane,
  switching: boolean,
): {
  "data-editor-canvas-pane": EditorCanvasPane;
  "data-compact-visible": "true" | "false";
} {
  return {
    "data-editor-canvas-pane": pane,
    "data-compact-visible": !switching || activePane === pane ? "true" : "false",
  };
}

/** Desktop remains the normal draggable flex split; only compact viewports act. */
export const RESPONSIVE_CANVAS_PANE_CSS = `
@media (max-width: 1279px) {
  [data-editor-canvas-pane][data-compact-visible="false"] {
    display: none !important;
  }
}
`;
