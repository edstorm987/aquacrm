"use client";

import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
// React Flow's base stylesheet. It used to be the first line of `src/app/globals.css`,
// so every route in the app downloaded it even though this canvas is the only thing
// that renders React Flow. Importing it here scopes it to this chunk — and because the
// workspace pulls this module in with `next/dynamic`, the CSS arrives with the canvas.
import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { Activity, Check, Clock3, GitBranch, Mail, Webhook, Zap } from "lucide-react";
import type { AutomationNodeKind, AutomationTriggerType } from "@/server/types";
import type { BuilderNode, BuilderNodeData } from "./_AutomationsWorkspace";

/**
 * Label maps live in the workspace (it needs them for the library, run history and
 * the node inspector). They are handed to the canvas as a prop so this module never
 * imports the workspace at runtime — that would defeat the code split.
 */
export type AutomationCanvasLabels = {
  trigger: Record<AutomationTriggerType, string>;
  node: Record<AutomationNodeKind, string>;
};

export type AutomationsCanvasProps = {
  nodes: BuilderNode[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<BuilderNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  selectNode: (id: string | undefined) => void;
  newEdgeId: () => string;
  canEdit: boolean;
  labels: AutomationCanvasLabels;
};

function AutomationNodeCard({ data, selected, labels }: NodeProps<BuilderNode> & { labels: AutomationCanvasLabels }) {
  const Icon = data.kind === "trigger" ? Zap : data.kind === "delay" ? Clock3 : data.kind === "condition" ? GitBranch : data.actionType === "send-email" ? Mail : data.actionType === "send-webhook" ? Webhook : data.actionType === "log-activity" ? Activity : Check;
  const detail = data.kind === "trigger"
    ? data.triggerType === "custom.event" ? data.eventName || "Choose an event name" : labels.trigger[data.triggerType ?? "manual"]
    : data.kind === "delay"
      ? `${data.delayMinutes ?? 60} minutes`
      : data.kind === "condition"
        ? data.conditionType === "enquiry.awaiting-response" || data.conditionType === "client-request.awaiting-response" ? "Still awaiting a reply?" : `${data.field || "event field"} ${data.operator || "equals"}`
        : data.actionType === "send-email" ? "Send email" : data.actionType === "send-webhook" ? `${data.webhookMethod ?? "POST"} webhook` : data.actionType === "log-activity" ? "Record activity" : "Create task";
  return (
    <div className={`aqua-automation-node ${selected ? "is-selected" : ""}`} data-node-kind={data.kind}>
      {data.kind !== "trigger" ? <Handle type="target" position={Position.Left} /> : null}
      <div className="flex items-start gap-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/5"><Icon size={16} /></span>
        <span className="min-w-0">
          <span className="block text-[10px] font-bold uppercase text-black/45">{labels.node[data.kind]}</span>
          <span className="block truncate text-sm font-semibold text-slate-900">{data.label}</span>
          <span className="mt-1 block truncate text-xs text-slate-500">{detail}</span>
        </span>
      </div>
      {data.kind === "condition" ? (
        <>
          <span className="absolute -right-9 top-[34px] text-[10px] font-bold text-emerald-700">YES</span>
          <Handle id="yes" type="source" position={Position.Right} style={{ top: 41 }} />
          <span className="absolute -right-8 top-[76px] text-[10px] font-bold text-slate-500">NO</span>
          <Handle id="no" type="source" position={Position.Right} style={{ top: 83 }} />
        </>
      ) : <Handle type="source" position={Position.Right} />}
    </div>
  );
}

function miniMapColour(item: Node): string {
  const kind = (item.data as BuilderNodeData).kind;
  return kind === "trigger" ? "#0f8b8d" : kind === "delay" ? "#c77600" : kind === "condition" ? "#2563a8" : "#187554";
}

export function AutomationsCanvas({ nodes, edges, setNodes, setEdges, selectNode, newEdgeId, canEdit, labels }: AutomationsCanvasProps) {
  // Same semantics as useNodesState/useEdgesState (which are plain useState + apply*Changes);
  // the array state itself stays in the workspace so every toolbar and inspector control is unchanged.
  const onNodesChange = useCallback<OnNodesChange<BuilderNode>>(changes => {
    setNodes(current => applyNodeChanges(changes, current));
  }, [setNodes]);

  const onEdgesChange = useCallback<OnEdgesChange<Edge>>(changes => {
    setEdges(current => applyEdgeChanges(changes, current));
  }, [setEdges]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(current => addEdge({ ...connection, id: newEdgeId(), animated: true, label: connection.sourceHandle || undefined, style: { stroke: connection.sourceHandle === "no" ? "#94a3b8" : "#0f8b8d", strokeWidth: 2 } }, current));
  }, [setEdges, newEdgeId]);

  const nodeTypes = useMemo(() => ({
    automation: function AutomationNode(props: NodeProps<BuilderNode>) {
      return <AutomationNodeCard {...props} labels={labels} />;
    },
  }), [labels]);

  return (
    <ReactFlow<BuilderNode, Edge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_event, item) => selectNode(item.id)} onPaneClick={() => selectNode(undefined)} fitView minZoom={0.35} maxZoom={1.8} deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}>
      <Background gap={20} size={1} color="#d6dcdd" /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={miniMapColour} />
    </ReactFlow>
  );
}
