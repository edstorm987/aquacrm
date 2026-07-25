"use client";

// PluginRequired pass-through. The foundation handles plugin gating
// upstream (T1 mounts admin pages only when the plugin is enabled), so
// the plugin's lifted admin page can render its children directly. The
// shim preserves the JSX shape from 02 so the lifted page's
// `<PluginRequired plugin="website">…</PluginRequired>` pattern compiles.
//
// If a future requirement re-introduces in-page gating, swap the
// implementation here (single-file change).

import type { ReactNode } from "react";

export interface PluginRequiredProps {
  plugin: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export default function PluginRequired({ children }: PluginRequiredProps) {
  return <>{children}</>;
}
