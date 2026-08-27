type PortalViewportLoadingProps = {
  label?: string;
  scope?: "route" | "workspace";
  testId?: string;
};

/**
 * The shared slow-path for portal navigation and major streamed workspaces.
 *
 * It is server-safe and client-compatible, with no icon, hook, or third-party
 * runtime dependency. Cinematic route transitions intentionally render above
 * the workspace-scoped variant (see globals.css), so an enabled cinematic and
 * a slow network never compete on screen.
 */
export function PortalViewportLoading({
  label = "Preparing your workspace…",
  scope = "route",
  testId = "aqua-viewport-loader",
}: PortalViewportLoadingProps) {
  return (
    <div
      className="aqua-viewport-loading"
      data-aqua-viewport-loader
      data-loading-scope={scope}
      data-testid={testId}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="aqua-viewport-loading__content" aria-hidden="true">
        <span className="aqua-viewport-loading__spinner" />
        <span className="aqua-viewport-loading__brand">Aqua</span>
        <span className="aqua-viewport-loading__label">{label}</span>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
