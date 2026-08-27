"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { AssistantWorkspace as AssistantWorkspaceComponent } from "./AssistantWorkspace";
import { PortalViewportLoading } from "@/components/ui/PortalViewportLoading";

type AssistantWorkspaceProps = ComponentProps<typeof AssistantWorkspaceComponent>;

// The advisor context remains server-built in page.tsx. Only the sizeable
// interactive assistant is deferred, so opening another Command Centre mode
// never downloads or evaluates it.
const DynamicAssistantWorkspace = dynamic<AssistantWorkspaceProps>(
  () => import("./AssistantWorkspace").then(module => module.AssistantWorkspace),
  { loading: () => <AssistantWorkspaceLoading /> },
);

export function LazyAssistantWorkspace(props: AssistantWorkspaceProps) {
  return <DynamicAssistantWorkspace {...props} />;
}

function AssistantWorkspaceLoading() {
  return <PortalViewportLoading label="Preparing Aqua Advisor…" />;
}
