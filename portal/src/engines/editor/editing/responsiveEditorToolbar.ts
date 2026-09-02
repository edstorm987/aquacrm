/**
 * The editor can be mounted inside a portal shell whose sidebar makes its
 * usable width narrower than the browser viewport. A viewport breakpoint
 * therefore cannot decide when the toolbar has room for its single-row form.
 *
 * The shell is the size container and these literal attributes keep the
 * wide-layout contract observable in source tests. Below 1280px of ACTUAL
 * editor width, the base Tailwind grid remains in force and keeps Publish in
 * the pinned top-right cell.
 */
export const RESPONSIVE_EDITOR_TOOLBAR_CSS = `
.mm-dev-editor-shell {
  container-type: inline-size;
}

@container (min-width: 1280px) {
  [data-dev-editor-toolbar] {
    display: flex;
    min-height: 68px;
    gap: 0.75rem;
    padding-inline: 1rem;
  }

  [data-dev-editor-toolbar-back] {
    margin-block: 0;
  }

  [data-dev-editor-toolbar-title] {
    display: block;
  }

  [data-dev-editor-project-switcher] {
    display: flex;
  }

  [data-dev-editor-primary-controls],
  [data-dev-editor-context-wrapper] {
    display: contents;
  }

  [data-dev-editor-toolbar-divider] {
    display: block;
  }

  [data-dev-editor-context] {
    grid-column: auto;
    grid-row: auto;
    display: flex;
    flex: 1 1 0%;
    overflow-x: auto;
    border-top-width: 0;
    scrollbar-width: none;
  }

  [data-dev-editor-device-actions] {
    grid-column: auto;
  }

  [data-dev-editor-publish] {
    grid-column: auto;
    grid-row: auto;
  }
}
`;
