/**
 * Where a project's VISUAL editor lives, when it has one.
 *
 * The visual editors are keyed by client: the website block editor mounts in
 * the client workspace, the portal studio takes the client as a param. The
 * Aqua Tag site is the bridge — its destination client says whose workspace
 * the site belongs to. No routed tag, no door; said out loud rather than a
 * dead button.
 *
 * A website door additionally depends on the client having the
 * website-editor plugin installed — the same `builderReady` predicate the
 * Development portfolio uses. Not ready means the door ACTIVATES first
 * (the WebsiteBuilderLauncher flow), never a link that 404s.
 *
 * A plain module (no React) so the routing rule is testable on its own.
 */

export interface VisualEditorProject {
  type: "software" | "website" | "portal";
}

export interface VisualEditorSite {
  destinationClientId?: string;
  builderReady?: boolean;
}

export type VisualEditorDoorState =
  | { kind: "open"; href: string }
  | { kind: "activate"; clientId: string; href: string }
  | null;

export function visualEditorDoor(project: VisualEditorProject, site: VisualEditorSite | null): VisualEditorDoorState {
  if (!site?.destinationClientId) return null;
  const clientId = site.destinationClientId;
  if (project.type === "website") {
    // The launcher's own deep link — the plugin registers /edit-website.
    const href = `/portal/clients/${encodeURIComponent(clientId)}/edit-website`;
    return site.builderReady ? { kind: "open", href } : { kind: "activate", clientId, href };
  }
  if (project.type === "portal") {
    return { kind: "open", href: `/portal/agency/portals/editor?scope=client&clientId=${encodeURIComponent(clientId)}` };
  }
  return null;
}
