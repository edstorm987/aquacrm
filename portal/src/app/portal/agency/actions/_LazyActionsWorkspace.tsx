"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { ActionsWorkspace as ActionsWorkspaceComponent } from "./_ActionsWorkspace";
import { PortalViewportLoading } from "@/components/ui/PortalViewportLoading";

type ActionsWorkspaceProps = ComponentProps<typeof ActionsWorkspaceComponent>;

// Keep the data loader in _ActionsPage on the server, but do not make its
// large interactive workspace part of the default Command Centre client
// graph. This boundary is reached only after ?station=actions|calendar has
// selected the server-backed station.
const DynamicActionsWorkspace = dynamic<ActionsWorkspaceProps>(
  () => import("./_ActionsWorkspace").then(module => module.ActionsWorkspace),
  { loading: () => <ActionsWorkspaceLoading /> },
);

export function LazyActionsWorkspace(props: ActionsWorkspaceProps) {
  return <DynamicActionsWorkspace {...props} />;
}

function ActionsWorkspaceLoading() {
  return <PortalViewportLoading label="Preparing Command Centre Actions…" />;
}
