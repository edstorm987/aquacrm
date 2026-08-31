"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import dynamic from "next/dynamic";
// Types only — erased at compile time, so @xyflow/react stays out of this chunk.
import type { Edge, Node } from "@xyflow/react";
import {
  Bot,
  Check,
  ChevronDown,
  CirclePause,
  Clock3,
  Copy,
  ExternalLink,
  FileClock,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  History,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type {
  AgencyTaskPriority,
  AutomationFolder,
  AutomationNodeConfig,
  AutomationNodeKind,
  AutomationRun,
  AutomationTriggerType,
  AutomationWorkflow,
  AutomationWorkflowEdge,
  AutomationWorkflowNode,
  CustomAIRecord,
  CustomAIStatus,
} from "@/server/types";
import { automationRunFeedback } from "@/lib/automationRunFeedback";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { PortalViewportLoading } from "@/components/ui/PortalViewportLoading";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

type WorkspaceTab = "flows" | "runs" | "ais";
export type BuilderNodeData = AutomationNodeConfig & { kind: AutomationNodeKind; [key: string]: unknown };
export type BuilderNode = Node<BuilderNodeData, "automation">;
type TeamMember = { id: string; name: string; email: string };

/**
 * React Flow is the largest dependency in this route's bundle, so the canvas subtree
 * (and every @xyflow/react import) lives in its own chunk that only downloads when the
 * flow builder is actually rendered.
 */
const AutomationsCanvas = dynamic(() => import("./_AutomationsCanvas").then(module => module.AutomationsCanvas), {
  ssr: false,
  loading: () => <CanvasSkeleton />,
});

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  manual: "Manual run",
  "website-enquiry.received": "Website enquiry received",
  "client-form.received": "Client website form received",
  "client-request.received": "Client portal message received",
  "social-message.received": "Social message received",
  "client.created": "Client created",
  "client.updated": "Client updated",
  "client.archived": "Client archived",
  "client.stage_changed": "Client stage changed",
  "phase.advanced": "Delivery phase advanced",
  "phase.checklist_item_completed": "Phase checklist item completed",
  "deliverable.submitted": "Deliverable submitted",
  "deliverable.approved": "Deliverable approved",
  "page.published": "Website page published",
  "invoice.paid": "Invoice paid",
  "email.delivered": "Email delivered",
  "schedule.daily": "Daily schedule",
  "custom.event": "Custom CRM event",
};

const NODE_LABELS: Record<AutomationNodeKind, string> = {
  trigger: "Trigger",
  delay: "Wait",
  condition: "Condition",
  action: "Action",
};

/** Module constant so the canvas prop is referentially stable across renders. */
const CANVAS_LABELS = { trigger: TRIGGER_LABELS, node: NODE_LABELS };

const STATUS_CLASS = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
} as const;

const FOLDER_TONES: Record<string, string> = {
  teal: "bg-cyan-100 text-cyan-800",
  blue: "bg-blue-100 text-blue-800",
  violet: "bg-violet-100 text-violet-800",
  amber: "bg-amber-100 text-amber-800",
  rose: "bg-rose-100 text-rose-800",
  emerald: "bg-emerald-100 text-emerald-800",
  slate: "bg-slate-200 text-slate-700",
};

function builderNodes(workflow?: AutomationWorkflow): BuilderNode[] {
  return (workflow?.nodes ?? []).map(node => ({
    id: node.id,
    type: "automation",
    position: node.position,
    data: { kind: node.kind, ...node.config },
  }));
}

function builderEdges(workflow?: AutomationWorkflow): Edge[] {
  return (workflow?.edges ?? []).map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    animated: true,
    label: edge.sourceHandle,
    style: { stroke: edge.sourceHandle === "no" ? "#94a3b8" : "#0f8b8d", strokeWidth: 2 },
    labelStyle: { fill: "#475569", fontSize: 11, fontWeight: 700 },
  }));
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Module-scope so the canvas prop is referentially stable (its onConnect memo depends on it). */
function newEdgeId(): string {
  return uid("edge");
}

function template(kind: "enquiry" | "client-request" | "client" | "stage" | "daily"): Pick<AutomationWorkflow, "name" | "description" | "nodes" | "edges"> {
  const trigger = uid("node");
  const first = uid("node");
  if (kind === "enquiry") {
    const condition = uid("node");
    const action = uid("node");
    return {
      name: "Unanswered enquiry reminder",
      description: "Wait after a website enquiry, check whether it still needs a reply, then remind the owner.",
      nodes: [
        node(trigger, "trigger", 40, 210, { label: "New enquiry", triggerType: "website-enquiry.received" }),
        node(first, "delay", 310, 210, { label: "Give me time to reply", delayMinutes: 60 }),
        node(condition, "condition", 580, 210, { label: "Reply still needed?", conditionType: "enquiry.awaiting-response" }),
        node(action, "action", 870, 140, { label: "Remind me by email", actionType: "send-email", recipient: "{{owner.email}}", subject: "Reply needed: {{event.name}}", message: "{{event.name}} is still waiting for a reply to their {{event.brandName}} enquiry.\n\nEmail: {{event.email}}\nService: {{event.service}}" }),
      ],
      edges: [edge(trigger, first), edge(first, condition), edge(condition, action, "yes")],
    };
  }
  if (kind === "client-request") {
    const condition = uid("node");
    const action = uid("node");
    return {
      name: "Unanswered client message reminder",
      description: "Wait after a portal message, check for an agency reply, then create an urgent response task.",
      nodes: [
        node(trigger, "trigger", 40, 210, { label: "Client sends a message", triggerType: "client-request.received" }),
        node(first, "delay", 310, 210, { label: "Allow response time", delayMinutes: 30 }),
        node(condition, "condition", 580, 210, { label: "Reply still needed?", conditionType: "client-request.awaiting-response" }),
        node(action, "action", 870, 140, { label: "Create response task", actionType: "create-task", taskTitle: "Reply to {{event.clientName}}", taskPriority: "urgent", dueInMinutes: 30, message: "{{event.clientName}} sent a {{event.requestType}} request: {{event.message}}" }),
      ],
      edges: [edge(trigger, first), edge(first, condition), edge(condition, action, "yes")],
    };
  }
  if (kind === "client") return {
    name: "New client onboarding task",
    description: "Create the first internal onboarding task whenever a client is created.",
    nodes: [
      node(trigger, "trigger", 70, 210, { label: "New client", triggerType: "client.created" }),
      node(first, "action", 390, 210, { label: "Prepare onboarding", actionType: "create-task", taskTitle: "Prepare onboarding for {{event.name}}", taskPriority: "high", dueInMinutes: 1440, message: "Open the new client workspace, review the service brief, and prepare the welcome steps." }),
    ],
    edges: [edge(trigger, first)],
  };
  if (kind === "stage") return {
    name: "Client stage handover",
    description: "Create a handover task whenever a client moves to a new stage.",
    nodes: [
      node(trigger, "trigger", 70, 210, { label: "Stage changes", triggerType: "client.stage_changed" }),
      node(first, "action", 390, 210, { label: "Review the handover", actionType: "create-task", taskTitle: "Review client stage handover", taskPriority: "normal", dueInMinutes: 240, message: "Client {{event.clientId}} moved from {{event.from}} to {{event.to}}. Check ownership and next actions." }),
    ],
    edges: [edge(trigger, first)],
  };
  return {
    name: "Daily founder planning",
    description: "Put a focused planning task onto the dashboard each morning.",
    nodes: [
      node(trigger, "trigger", 70, 210, { label: "Every morning", triggerType: "schedule.daily", scheduleHour: 8 }),
      node(first, "action", 390, 210, { label: "Plan the day", actionType: "create-task", taskTitle: "Set today's priorities", taskPriority: "high", dueInMinutes: 60, message: "Review the dashboard, choose the three outcomes that matter, and block the work." }),
    ],
    edges: [edge(trigger, first)],
  };
}

function node(id: string, kind: AutomationNodeKind, x: number, y: number, config: AutomationNodeConfig): AutomationWorkflowNode {
  return { id, kind, position: { x, y }, config };
}

function edge(source: string, target: string, sourceHandle?: "yes" | "no"): AutomationWorkflowEdge {
  return { id: uid("edge"), source, target, sourceHandle };
}

export function AutomationsWorkspace({
  initialFolders,
  initialWorkflows,
  initialRuns,
  initialCustomAIs,
  canEdit,
  ownerEmail,
  team,
  embedded = false,
}: {
  initialFolders: AutomationFolder[];
  initialWorkflows: AutomationWorkflow[];
  initialRuns: AutomationRun[];
  initialCustomAIs: CustomAIRecord[];
  canEdit: boolean;
  ownerEmail: string;
  team: TeamMember[];
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("flows");
  const [folders, setFolders] = useState(initialFolders);
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [runs, setRuns] = useState(initialRuns);
  const [customAIs, setCustomAIs] = useState(initialCustomAIs);
  const [selectedId, setSelectedId] = useState(initialWorkflows[0]?.id ?? "");
  const selected = workflows.find(workflow => workflow.id === selectedId);
  const [name, setName] = useState(selected?.name ?? "");
  const [description, setDescription] = useState(selected?.description ?? "");
  // useNodesState/useEdgesState are just useState + apply*Changes, so the arrays stay here
  // (the toolbar, inspector and save payload all read them) and the canvas owns the handlers.
  const [nodes, setNodes] = useState<BuilderNode[]>(builderNodes(selected));
  const [edges, setEdges] = useState<Edge[]>(builderEdges(selected));
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [templateMenu, setTemplateMenu] = useState(false);
  const [folderFilter, setFolderFilter] = useState<"all" | "unfiled" | string>("all");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [folderEditor, setFolderEditor] = useState<AutomationFolder | "new" | null>(null);
  const [testPayload, setTestPayload] = useState(() => JSON.stringify({ name: "Test contact", email: ownerEmail || "owner@example.com", awaitingResponse: true }, null, 2));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [runDetailId, setRunDetailId] = useState<string>();
  const [aiEditor, setAiEditor] = useState<CustomAIRecord | "new" | null>(null);

  useEffect(() => {
    setName(selected?.name ?? "");
    setDescription(selected?.description ?? "");
    setNodes(builderNodes(selected));
    setEdges(builderEdges(selected));
    setSelectedNodeId(undefined);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedNode = nodes.find(item => item.id === selectedNodeId);
  const metrics = useMemo(() => ({
    active: workflows.filter(workflow => workflow.status === "active").length,
    waiting: runs.filter(run => run.status === "waiting").length,
    success: runs.filter(run => run.status === "succeeded" && run.createdAt > Date.now() - 86_400_000).length,
    failed: runs.filter(run => run.status === "failed").length,
  }), [workflows, runs]);

  const visibleWorkflows = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return workflows.filter(workflow => {
      if (folderFilter === "unfiled" && workflow.folderId) return false;
      if (folderFilter !== "all" && folderFilter !== "unfiled" && workflow.folderId !== folderFilter) return false;
      if (!query) return true;
      const trigger = workflow.nodes.find(item => item.kind === "trigger")?.config.triggerType ?? "manual";
      return `${workflow.name} ${workflow.description ?? ""} ${TRIGGER_LABELS[trigger]}`.toLowerCase().includes(query);
    });
  }, [folderFilter, libraryQuery, workflows]);

  function workflowPayload(status = selected?.status ?? "draft") {
    return {
      name,
      description,
      status,
      nodes: nodes.map(item => ({ id: item.id, kind: item.data.kind, position: item.position, config: stripKind(item.data) })),
      edges: edges.map(item => ({ id: item.id, source: item.source, target: item.target, sourceHandle: item.sourceHandle === "yes" || item.sourceHandle === "no" ? item.sourceHandle : undefined })),
    };
  }

  async function api(body: Record<string, unknown>) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await fetch("/api/portal/automations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { ok?: boolean; error?: string; folder?: AutomationFolder; folders?: AutomationFolder[]; workflow?: AutomationWorkflow; run?: AutomationRun; workflows?: AutomationWorkflow[]; runs?: AutomationRun[] };
      if (!response.ok || !data.ok) throw new Error(data.error || "Automation request failed.");
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function createFromTemplate(kind: "enquiry" | "client-request" | "client" | "stage" | "daily") {
    try {
      const data = await api({ action: "create", ...template(kind), folderId: folderFilter !== "all" && folderFilter !== "unfiled" ? folderFilter : null, status: "draft" });
      if (!data.workflow) return;
      setWorkflows(current => [data.workflow as AutomationWorkflow, ...current]);
      setSelectedId(data.workflow.id);
      setTemplateMenu(false);
      setNotice("Starter flow created. Connect or edit any node, then activate it when ready.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create automation."); }
  }

  async function createBlankFlow() {
    const triggerId = uid("node");
    try {
      const data = await api({
        action: "create",
        name: "Untitled automation",
        description: "Build this flow from a blank canvas.",
        folderId: folderFilter !== "all" && folderFilter !== "unfiled" ? folderFilter : null,
        status: "draft",
        nodes: [node(triggerId, "trigger", 80, 220, { label: "Start manually", triggerType: "manual" })],
        edges: [],
      });
      if (!data.workflow) return;
      setWorkflows(current => [data.workflow as AutomationWorkflow, ...current]);
      setSelectedId(data.workflow.id);
      setTemplateMenu(false);
      setNotice("Blank automation created. Add and configure blocks, then connect the flow.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create blank automation."); }
  }

  async function saveFolder(values: { name: string; description: string; color: string }) {
    try {
      const editing = folderEditor && folderEditor !== "new" ? folderEditor : undefined;
      const data = await api({
        action: editing ? "update-folder" : "create-folder",
        folderId: editing?.id,
        folderName: values.name,
        folderDescription: values.description,
        folderColor: values.color,
      });
      if (data.folders) setFolders(data.folders);
      if (!editing && data.folder) setFolderFilter(data.folder.id);
      setFolderEditor(null);
      setNotice(editing ? "Automation folder updated." : "Automation folder created.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save automation folder."); }
  }

  async function deleteFolder(folder: AutomationFolder) {
    if (!confirm(`Delete folder "${folder.name}"? Its automations will move to Unfiled.`)) return;
    try {
      const data = await api({ action: "delete-folder", folderId: folder.id });
      if (data.folders) setFolders(data.folders);
      if (data.workflows) setWorkflows(data.workflows);
      if (folderFilter === folder.id) setFolderFilter("unfiled");
      setFolderEditor(null);
      setNotice("Folder deleted. Its automations are now Unfiled.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete automation folder."); }
  }

  async function moveSelected(folderId: string) {
    if (!selected) return;
    try {
      const data = await api({ action: "move", workflowId: selected.id, folderId: folderId || null });
      if (data.workflow) setWorkflows(current => current.map(workflow => workflow.id === data.workflow?.id ? data.workflow as AutomationWorkflow : workflow));
      setNotice(folderId ? "Automation moved." : "Automation moved to Unfiled.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not move automation."); }
  }

  async function save(status = selected?.status ?? "draft") {
    if (!selected) return;
    try {
      const data = await api({ action: "update", workflowId: selected.id, ...workflowPayload(status) });
      if (data.workflow) setWorkflows(current => current.map(workflow => workflow.id === data.workflow?.id ? data.workflow as AutomationWorkflow : workflow));
      setNotice(status === "active" ? "Automation is active." : "Automation saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save automation."); }
  }

  async function testFlow() {
    if (!selected) return;
    try {
      let eventData: Record<string, unknown>;
      try {
        const parsed = JSON.parse(testPayload) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        eventData = parsed as Record<string, unknown>;
      } catch {
        throw new Error("Test event data must be a valid JSON object.");
      }
      await save("draft");
      const data = await api({ action: "test", workflowId: selected.id, eventData });
      if (data.run) setRuns(current => [data.run as AutomationRun, ...current.filter(run => run.id !== data.run?.id)]);
      if (data.workflows) setWorkflows(data.workflows);
      if (!data.run) throw new Error("The automation test returned no run record.");
      const feedback = automationRunFeedback(data.run, "test");
      if (feedback.kind === "error") setError(feedback.message);
      else setNotice(feedback.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not test automation."); }
  }

  async function runNow() {
    if (!selected) return;
    try {
      const data = await api({ action: "run", workflowId: selected.id, eventData: { source: "manual", requestedAt: Date.now() } });
      if (data.run) setRuns(current => [data.run as AutomationRun, ...current.filter(run => run.id !== data.run?.id)]);
      if (!data.run) throw new Error("The automation run returned no run record.");
      const feedback = automationRunFeedback(data.run, "live");
      if (feedback.kind === "error") setError(feedback.message);
      else setNotice(feedback.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not run automation."); }
  }

  async function duplicateSelected() {
    if (!selected) return;
    try {
      const data = await api({ action: "duplicate", workflowId: selected.id });
      if (data.workflow) {
        setWorkflows(current => [data.workflow as AutomationWorkflow, ...current]);
        setSelectedId(data.workflow.id);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not duplicate automation."); }
  }

  async function deleteSelected() {
    if (!selected || !confirm(`Delete "${selected.name}" and its run history?`)) return;
    try {
      await api({ action: "delete", workflowId: selected.id });
      const remaining = workflows.filter(workflow => workflow.id !== selected.id);
      setWorkflows(remaining);
      setRuns(current => current.filter(run => run.workflowId !== selected.id));
      setSelectedId(remaining[0]?.id ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete automation."); }
  }

  function addNode(kind: AutomationNodeKind) {
    if (kind === "trigger" && nodes.some(item => item.data.kind === "trigger")) {
      setError("A flow can only contain one trigger. Configure the existing trigger or delete it first.");
      return;
    }
    const actionType = kind === "action" ? "create-task" : undefined;
    const nodeId = uid("node");
    setNodes(current => [...current, {
      id: nodeId,
      type: "automation",
      position: { x: 340 + current.length * 70, y: 120 + current.length * 45 },
      data: { kind, label: kind === "trigger" ? "Start flow" : kind === "delay" ? "Wait" : kind === "condition" ? "Check a condition" : "Create a task", triggerType: kind === "trigger" ? "manual" : undefined, delayMinutes: 60, conditionType: kind === "condition" ? "event-field" : undefined, operator: "equals", actionType, taskPriority: "normal", dueInMinutes: 1440 },
    }]);
    setSelectedNodeId(nodeId);
  }

  function updateSelectedNode(patch: Partial<BuilderNodeData>) {
    if (!selectedNodeId) return;
    setNodes(current => current.map(item => item.id === selectedNodeId ? { ...item, data: { ...item.data, ...patch } } : item));
  }

  function removeSelectedNode() {
    if (!selectedNodeId) return;
    setNodes(current => current.filter(item => item.id !== selectedNodeId));
    setEdges(current => current.filter(item => item.source !== selectedNodeId && item.target !== selectedNodeId));
    setSelectedNodeId(undefined);
  }

  function duplicateSelectedNode() {
    if (!selectedNode) return;
    const copyId = uid("node");
    setNodes(current => [...current, {
      ...selectedNode,
      id: copyId,
      selected: false,
      position: { x: selectedNode.position.x + 48, y: selectedNode.position.y + 48 },
      data: { ...selectedNode.data, label: `${selectedNode.data.label} copy` },
    }]);
    setSelectedNodeId(copyId);
  }

  async function refreshRuns() {
    try {
      const data = await api({ action: "sweep" });
      if (data.workflows) setWorkflows(data.workflows);
      if (data.runs) setRuns(data.runs);
      setNotice("Due automations processed.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not process due runs."); }
  }

  async function saveAI(values: SaveAIValues) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/portal/custom-ais", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: aiEditor === "new" ? "create" : "update", id: aiEditor && aiEditor !== "new" ? aiEditor.id : undefined, ...values }) });
      const data = await response.json() as { ok?: boolean; error?: string; record?: CustomAIRecord };
      if (!response.ok || !data.record) throw new Error(data.error || "Could not save custom AI.");
      setCustomAIs(current => aiEditor === "new" ? [data.record as CustomAIRecord, ...current] : current.map(record => record.id === data.record?.id ? data.record as CustomAIRecord : record));
      setAiEditor(null);
      setNotice("Custom AI registry updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save custom AI."); }
    finally { setBusy(false); }
  }

  async function deleteAI(record: CustomAIRecord) {
    if (!confirm(`Remove "${record.name}" from the registry?`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/portal/custom-ais", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id: record.id }) });
      if (!response.ok) throw new Error("Could not remove custom AI.");
      setCustomAIs(current => current.filter(item => item.id !== record.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove custom AI."); }
    finally { setBusy(false); }
  }

  function openFolder(id: "all" | "unfiled" | string) {
    setFolderFilter(id);
    const first = workflows.find(workflow => id === "all" || (id === "unfiled" ? !workflow.folderId : workflow.folderId === id));
    if (first) setSelectedId(first.id);
  }

  return (
    <div className={`min-h-full bg-[#f5f6f4] text-slate-950 ${embedded ? "rounded-md border border-black/10 px-3 py-4 sm:px-5" : "px-4 py-5 sm:px-6 lg:px-8"}`} data-automation-workspace data-embedded={embedded || undefined}>
      <header className="mx-auto flex max-w-[1680px] flex-col gap-4 border-b border-black/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase text-[#087f8c]"><Workflow size={15} /> Internal marketing control</div>
          {embedded ? <h2 className="text-2xl font-semibold">Marketing automations</h2> : <h1 className="text-2xl font-semibold">Automations</h1>}
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Build dependable CRM routines, inspect every run, and keep external AI workspaces recorded in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Automation views">
          <TabButton active={tab === "flows"} onClick={() => setTab("flows")} icon={<Workflow size={15} />} label="Flows" />
          <TabButton active={tab === "runs"} onClick={() => setTab("runs")} icon={<History size={15} />} label="Run history" count={runs.length} />
          <TabButton active={tab === "ais"} onClick={() => setTab("ais")} icon={<Bot size={15} />} label="Custom AIs" count={customAIs.length} />
        </div>
      </header>

      <section className="mx-auto grid max-w-[1680px] grid-cols-2 gap-px border-b border-black/10 bg-black/10 md:grid-cols-4">
        <Metric label="Active flows" value={metrics.active} tone="text-emerald-700" />
        <Metric label="Waiting now" value={metrics.waiting} tone="text-amber-700" />
        <Metric label="24h successes" value={metrics.success} tone="text-[#087f8c]" />
        <Metric label="Failed runs" value={metrics.failed} tone={metrics.failed ? "text-red-700" : "text-slate-700"} />
      </section>

      {(notice || error) ? <div className={`mx-auto mt-4 flex max-w-[1680px] items-center justify-between rounded-md border px-3 py-2 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}><span>{error || notice}</span><button type="button" onClick={() => { setError(undefined); setNotice(undefined); }} aria-label="Dismiss"><X size={15} /></button></div> : null}

      {tab === "flows" ? (
        <section className="mx-auto mt-5 grid max-w-[1680px] gap-3 min-[1600px]:grid-cols-[250px_minmax(560px,1fr)_300px]">
          <aside className="min-h-0 border border-black/10 bg-white min-[1600px]:min-h-[650px]">
            <div className="relative flex items-center justify-between gap-2 border-b border-black/10 p-3">
              <div><h2 className="text-sm font-semibold">Flow library</h2><p className="text-xs text-slate-500">{workflows.length} automations · {folders.length} {folders.length === 1 ? "folder" : "folders"}</p></div>
              <div className="flex items-center gap-1">
                <button type="button" disabled={!canEdit || busy} onClick={() => setFolderEditor("new")} className="icon-button" title="Create automation folder"><FolderPlus size={15} /></button>
                <button type="button" disabled={!canEdit || busy} onClick={() => setTemplateMenu(value => !value)} className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-2.5 text-xs font-semibold text-white" aria-expanded={templateMenu}><Plus size={14} /> New <ChevronDown size={13} /></button>
              </div>
              {templateMenu ? <TemplateMenu create={createFromTemplate} createBlank={createBlankFlow} /> : null}
            </div>

            <div className="border-b border-black/10 p-2">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input aria-label="Search automations" value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)} placeholder="Search flows" className="h-9 w-full rounded-md border border-black/10 bg-white pl-8 pr-2 text-xs outline-none focus:border-[#087f8c]" />
              </label>
              <nav aria-label="Automation folders" className="mt-2 space-y-0.5">
                <button type="button" aria-pressed={folderFilter === "all"} onClick={() => openFolder("all")} className={`flex min-h-8 w-full items-center gap-2 rounded px-2 text-left text-xs ${folderFilter === "all" ? "bg-slate-900 font-semibold text-white" : "text-slate-600 hover:bg-slate-50"}`}><FolderOpen size={14} /><span className="min-w-0 flex-1 truncate">All flows</span><span className="tabular-nums opacity-70">{workflows.length}</span></button>
                <button type="button" aria-pressed={folderFilter === "unfiled"} onClick={() => openFolder("unfiled")} className={`flex min-h-8 w-full items-center gap-2 rounded px-2 text-left text-xs ${folderFilter === "unfiled" ? "bg-slate-900 font-semibold text-white" : "text-slate-600 hover:bg-slate-50"}`}><Folder size={14} /><span className="min-w-0 flex-1 truncate">Unfiled</span><span className="tabular-nums opacity-70">{workflows.filter(workflow => !workflow.folderId).length}</span></button>
                {folders.map(folder => (
                  <div key={folder.id} className="flex items-center gap-0.5">
                    <button type="button" aria-pressed={folderFilter === folder.id} onClick={() => openFolder(folder.id)} className={`flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded px-2 text-left text-xs ${folderFilter === folder.id ? "bg-slate-900 font-semibold text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                      <span className={`grid size-5 shrink-0 place-items-center rounded ${folderFilter === folder.id ? "bg-white/15 text-white" : FOLDER_TONES[folder.color] ?? FOLDER_TONES.teal}`}><Folder size={12} /></span>
                      <span className="min-w-0 flex-1 truncate">{folder.name}</span><span className="tabular-nums opacity-70">{workflows.filter(workflow => workflow.folderId === folder.id).length}</span>
                    </button>
                    {canEdit ? <button type="button" onClick={() => setFolderEditor(folder)} className="icon-button size-8 shrink-0" title={`Edit ${folder.name}`}><Pencil size={13} /></button> : null}
                  </div>
                ))}
              </nav>
            </div>

            <div className="max-h-[390px] overflow-y-auto p-2 xl:max-h-[405px]">
              {visibleWorkflows.length ? visibleWorkflows.map(workflow => {
                const folder = folders.find(item => item.id === workflow.folderId);
                return (
                  <button key={workflow.id} type="button" onClick={() => setSelectedId(workflow.id)} className={`mb-1 w-full rounded-md border px-3 py-2.5 text-left ${workflow.id === selectedId ? "border-[#087f8c] bg-cyan-50" : "border-transparent hover:bg-slate-50"}`}>
                    <span className="flex items-start justify-between gap-2"><span className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold">{workflow.name}</span><span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_CLASS[workflow.status]}`}>{workflow.status}</span></span>
                    <span className="mt-1.5 block text-xs text-slate-500">{TRIGGER_LABELS[workflow.nodes.find(item => item.kind === "trigger")?.config.triggerType ?? "manual"]}</span>
                    <span className="mt-2 flex items-center gap-3 text-[11px] text-slate-500"><span>{workflow.runCount} runs</span><span>{workflow.successCount} passed</span>{folder ? <span className="ml-auto inline-flex items-center gap-1 truncate"><Folder size={11} />{folder.name}</span> : null}</span>
                  </button>
                );
              }) : <div className="px-3 py-10 text-center"><Workflow className="mx-auto text-slate-300" size={28} /><p className="mt-3 text-sm font-medium">No flows here</p><p className="mt-1 text-xs text-slate-500">Create a blank flow or move an automation into this folder.</p></div>}
            </div>
          </aside>

          <div className="min-h-[650px] min-w-0 border border-black/10 bg-white">
            {selected ? <>
              <div className="flex flex-col gap-3 border-b border-black/10 p-3">
                <div className="min-w-0 flex-1">
                  <input aria-label="Automation name" value={name} disabled={!canEdit} onChange={event => setName(event.target.value)} className="w-full border-0 bg-transparent p-0 text-base font-semibold outline-none" />
                  <input aria-label="Automation description" value={description} disabled={!canEdit} onChange={event => setDescription(event.target.value)} placeholder="What this automation owns" className="mt-1 w-full border-0 bg-transparent p-0 text-xs text-slate-500 outline-none" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/15 bg-white px-2 text-xs font-semibold text-slate-600" title="Move automation to folder">
                    <Folder size={13} aria-hidden="true" />
                    <select aria-label="Automation folder" disabled={!canEdit || busy} value={selected.folderId ?? ""} onChange={event => void moveSelected(event.target.value)} className="h-6 max-w-36 border-0 bg-transparent p-0 text-xs font-semibold outline-none">
                      <option value="">Unfiled</option>
                      {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={!canEdit || busy} onClick={() => save()} className="tool-button"><Save size={14} /> Save</button>
                  <button type="button" disabled={!canEdit || busy} onClick={testFlow} className="tool-button"><Play size={14} /> Test</button>
                  <button type="button" disabled={!canEdit || busy || nodes.find(item => item.data.kind === "trigger")?.data.triggerType !== "manual"} onClick={runNow} className="tool-button" title={nodes.find(item => item.data.kind === "trigger")?.data.triggerType === "manual" ? "Run the live workflow now" : "Event-driven flows start from their real trigger"}><Zap size={14} /> Run now</button>
                  <select aria-label="Automation status" disabled={!canEdit || busy} value={selected.status} onChange={event => save(event.target.value as AutomationWorkflow["status"])} className="h-8 rounded-md border border-black/15 bg-white px-2 text-xs font-semibold"><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option></select>
                  <button type="button" disabled={!canEdit || busy} onClick={duplicateSelected} className="tool-button" title="Duplicate automation"><Copy size={14} /> Duplicate</button>
                  <button type="button" disabled={!canEdit || busy} onClick={deleteSelected} className="tool-button text-red-700" title="Delete automation"><Trash2 size={14} /> Delete</button>
                </div>
              </div>
              <div className="flex min-h-11 flex-wrap items-center gap-1.5 border-b border-black/10 px-3 py-2">
                <span className="mr-1 text-[11px] font-bold uppercase text-slate-400">Add block</span>
                <button type="button" disabled={!canEdit || nodes.some(item => item.data.kind === "trigger")} onClick={() => addNode("trigger")} className="node-add"><Zap size={13} /> Trigger</button>
                <button type="button" disabled={!canEdit} onClick={() => addNode("delay")} className="node-add"><Clock3 size={13} /> Wait</button>
                <button type="button" disabled={!canEdit} onClick={() => addNode("condition")} className="node-add"><GitBranch size={13} /> Condition</button>
                <button type="button" disabled={!canEdit} onClick={() => addNode("action")} className="node-add"><Check size={13} /> Action</button>
                <span className="ml-auto text-xs text-slate-400">Select a block to configure it</span>
              </div>
              <div className="aqua-automation-flow h-[550px] w-full">
                <AutomationsCanvas nodes={nodes} edges={edges} setNodes={setNodes} setEdges={setEdges} selectNode={setSelectedNodeId} newEdgeId={newEdgeId} canEdit={canEdit} labels={CANVAS_LABELS} />
              </div>
            </> : <div className="flex min-h-[650px] items-center justify-center px-8 text-center"><div><Sparkles className="mx-auto text-[#087f8c]" size={30} /><h2 className="mt-3 text-lg font-semibold">Build your first automation</h2><p className="mt-1 max-w-sm text-sm text-slate-500">Choose New and start with an enquiry reminder, client onboarding, stage handover, or daily planning flow.</p></div></div>}
          </div>

          <aside className="min-h-[650px] border border-black/10 bg-white p-4">
            {selectedNode ? <NodeInspector node={selectedNode} update={updateSelectedNode} duplicate={duplicateSelectedNode} remove={removeSelectedNode} disabled={!canEdit} /> : <FlowInspector workflow={selected} ownerEmail={ownerEmail} testPayload={testPayload} setTestPayload={setTestPayload} />}
          </aside>
        </section>
      ) : null}

      {tab === "runs" ? <RunHistory runs={runs} workflows={workflows} selectedId={runDetailId} setSelectedId={setRunDetailId} refresh={refreshRuns} busy={busy} canEdit={canEdit} /> : null}
      {tab === "ais" ? <CustomAIRegistry records={customAIs} team={team} canEdit={canEdit} edit={setAiEditor} remove={deleteAI} /> : null}
      {folderEditor ? <FolderEditor folder={folderEditor === "new" ? undefined : folderEditor} busy={busy} close={() => setFolderEditor(null)} save={saveFolder} remove={folderEditor === "new" ? undefined : deleteFolder} /> : null}
      {aiEditor ? <AIEditor record={aiEditor === "new" ? undefined : aiEditor} team={team} busy={busy} close={() => setAiEditor(null)} save={saveAI} /> : null}
      {tab === "ais" && canEdit ? <button type="button" onClick={() => setAiEditor("new")} className="fixed bottom-6 right-6 inline-flex h-11 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white shadow-lg"><Plus size={16} /> Register custom AI</button> : null}
    </div>
  );
}

function stripKind(data: BuilderNodeData): AutomationNodeConfig {
  const { kind: _kind, ...config } = data;
  return config;
}

/** Intentional slow-path while the React Flow chunk downloads. */
function CanvasSkeleton() {
  return <PortalViewportLoading label="Preparing the automation canvas…" />;
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return <button type="button" aria-current={active ? "true" : undefined} onClick={onClick} className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium ${active ? "border-slate-900 bg-slate-900 text-white" : "border-black/10 bg-white text-slate-700"}`}>{icon}{label}{count !== undefined ? <span className={`rounded px-1.5 text-[10px] ${active ? "bg-white/15" : "bg-slate-100"}`}>{count}</span> : null}</button>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="bg-[#f5f6f4] px-4 py-3"><p className="text-[11px] font-bold uppercase text-slate-500">{label}</p><p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p></div>;
}

function TemplateMenu({ create, createBlank }: { create: (kind: "enquiry" | "client-request" | "client" | "stage" | "daily") => void; createBlank: () => void }) {
  const items = [
    ["enquiry", "Unanswered enquiry", "Wait, re-check, then remind you"],
    ["client-request", "Unanswered client message", "Turn an overdue portal reply into a task"],
    ["client", "New client onboarding", "Create the first delivery task"],
    ["stage", "Stage handover", "Make each client move actionable"],
    ["daily", "Daily founder planning", "Put the day plan on your list"],
  ] as const;
  return <div className="absolute right-2 top-12 z-30 w-64 rounded-md border border-black/10 bg-white p-1.5 shadow-xl"><button type="button" onClick={createBlank} className="w-full rounded border-b border-black/10 px-2.5 py-2.5 text-left hover:bg-slate-50"><span className="flex items-center gap-2 text-xs font-semibold"><Sparkles size={13} /> Blank automation</span><span className="mt-0.5 block text-[11px] text-slate-500">Start with one configurable trigger</span></button>{items.map(([id, label, detail]) => <button key={id} type="button" onClick={() => create(id)} className="w-full rounded px-2.5 py-2 text-left hover:bg-slate-50"><span className="block text-xs font-semibold">{label}</span><span className="block text-[11px] text-slate-500">{detail}</span></button>)}</div>;
}

function FlowInspector({ workflow, ownerEmail, testPayload, setTestPayload }: { workflow?: AutomationWorkflow; ownerEmail: string; testPayload: string; setTestPayload: (value: string) => void }) {
  if (!workflow) return null;
  const validation = workflow.status === "active" ? "Live events can start this flow." : "Activate this flow when every node is connected.";
  return <div><p className="text-[11px] font-bold uppercase text-[#087f8c]">Flow status</p><h3 className="mt-1 text-base font-semibold">{workflow.name}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{validation}</p><dl className="mt-5 space-y-3 text-sm"><InfoRow label="Blocks" value={String(workflow.nodes.length)} /><InfoRow label="Connections" value={String(workflow.edges.length)} /><InfoRow label="Owner email" value={ownerEmail || "Not configured"} /><InfoRow label="Last outcome" value={workflow.lastOutcome || "Not run yet"} /></dl><div className="mt-6 border-t border-black/10 pt-4"><p className="text-xs font-semibold">Test event data</p><p className="mt-1 text-[11px] leading-4 text-slate-500">Edit this JSON, then press Test. Test runs never send emails, create tasks, or call webhooks.</p><textarea aria-label="Test event data JSON" value={testPayload} onChange={event => setTestPayload(event.target.value)} rows={9} spellCheck={false} className="mt-3 w-full rounded-md border border-black/10 bg-slate-50 p-2 font-mono text-[11px] leading-5 outline-none focus:border-[#087f8c]" /></div><div className="mt-6 border-t border-black/10 pt-4"><p className="text-xs font-semibold">Template variables</p><code className="mt-2 block whitespace-pre-wrap text-[11px] leading-5 text-slate-500">{"{{owner.email}}\n{{owner.name}}\n{{agency.name}}\n{{event.name}}\n{{event.email}}\n{{event.clientId}}\n{{event.eventName}}\n{{workflow.name}}\n{{now}}"}</code></div></div>;
}

function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="max-w-[170px] break-words text-right font-medium">{value}</dd></div>; }

function NodeInspector({ node, update, duplicate, remove, disabled }: { node: BuilderNode; update: (patch: Partial<BuilderNodeData>) => void; duplicate: () => void; remove: () => void; disabled: boolean }) {
  const data = node.data;
  return <div>
    <div className="flex items-start justify-between gap-2"><div><p className="text-[11px] font-bold uppercase text-[#087f8c]">{NODE_LABELS[data.kind]} block</p><h3 className="mt-1 text-base font-semibold">Configure block</h3></div><div className="flex gap-1"><button type="button" onClick={duplicate} disabled={disabled || data.kind === "trigger"} className="icon-button" title="Duplicate block"><Copy size={15} /></button><button type="button" onClick={remove} disabled={disabled} className="icon-button text-red-700" title="Delete block"><Trash2 size={15} /></button></div></div>
    <label className="field-label mt-5">Label<input disabled={disabled} value={data.label} onChange={event => update({ label: event.target.value })} /></label>
    <label className="field-label">Internal description<textarea rows={3} disabled={disabled} value={data.description ?? ""} onChange={event => update({ description: event.target.value })} placeholder="What this block does and why" /></label>
    {data.kind === "trigger" ? <><label className="field-label">Starts when<select disabled={disabled} value={data.triggerType ?? "manual"} onChange={event => update({ triggerType: event.target.value as AutomationTriggerType })}>{Object.entries(TRIGGER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{data.triggerType === "custom.event" ? <label className="field-label">CRM event name<input disabled={disabled} placeholder="order.created or membership.changed" value={data.eventName ?? ""} onChange={event => update({ eventName: event.target.value })} /><span>Matches an event emitted inside AquaCRM or an installed module.</span></label> : null}{data.triggerType === "schedule.daily" ? <label className="field-label">Hour (London time)<input type="number" min={0} max={23} disabled={disabled} value={data.scheduleHour ?? 9} onChange={event => update({ scheduleHour: Number(event.target.value) })} /></label> : null}</> : null}
    {data.kind === "delay" ? <label className="field-label">Wait minutes<input type="number" min={0} max={525600} disabled={disabled} value={data.delayMinutes ?? 60} onChange={event => update({ delayMinutes: Number(event.target.value) })} /><span>Use 0 to continue immediately. Maximum wait: 365 days.</span></label> : null}
    {data.kind === "condition" ? <><label className="field-label">Condition<select disabled={disabled} value={data.conditionType ?? "event-field"} onChange={event => update({ conditionType: event.target.value as AutomationNodeConfig["conditionType"] })}><option value="enquiry.awaiting-response">Website enquiry still awaits reply</option><option value="client-request.awaiting-response">Client message still awaits reply</option><option value="event-field">Compare an event field</option></select></label>{data.conditionType === "event-field" ? <><label className="field-label">Event field<input disabled={disabled} placeholder="status or event.status" value={data.field ?? ""} onChange={event => update({ field: event.target.value })} /></label><label className="field-label">Comparison<select disabled={disabled} value={data.operator ?? "equals"} onChange={event => update({ operator: event.target.value as AutomationNodeConfig["operator"] })}><option value="equals">Equals</option><option value="not-equals">Does not equal</option><option value="contains">Contains</option><option value="starts-with">Starts with</option><option value="ends-with">Ends with</option><option value="greater-than">Greater than</option><option value="less-than">Less than</option><option value="exists">Exists</option><option value="not-exists">Does not exist</option></select></label>{data.operator !== "exists" && data.operator !== "not-exists" ? <label className="field-label">Value<input disabled={disabled} value={data.value ?? ""} onChange={event => update({ value: event.target.value })} /></label> : null}</> : null}</> : null}
    {data.kind === "action" ? <ActionFields data={data} update={update} disabled={disabled} /> : null}
    <div className="mt-5 flex gap-2 border-t border-black/10 pt-4"><button type="button" onClick={duplicate} disabled={disabled || data.kind === "trigger"} className="tool-button"><Copy size={14} /> Duplicate block</button><button type="button" onClick={remove} disabled={disabled} className="tool-button text-red-700"><Trash2 size={14} /> Delete block</button></div>
  </div>;
}

function ActionFields({ data, update, disabled }: { data: BuilderNodeData; update: (patch: Partial<BuilderNodeData>) => void; disabled: boolean }) {
  return <><label className="field-label">Action<select disabled={disabled} value={data.actionType ?? "create-task"} onChange={event => update({ actionType: event.target.value as AutomationNodeConfig["actionType"] })}><option value="create-task">Create task</option><option value="send-email">Send email</option><option value="log-activity">Record activity</option><option value="send-webhook">Send webhook</option></select></label>
    {data.actionType === "send-email" ? <><label className="field-label">Recipient<input disabled={disabled} placeholder="{{owner.email}}" value={data.recipient ?? ""} onChange={event => update({ recipient: event.target.value })} /></label><label className="field-label">Subject<input disabled={disabled} value={data.subject ?? ""} onChange={event => update({ subject: event.target.value })} /></label></> : null}
    {data.actionType === "create-task" ? <><label className="field-label">Task title<input disabled={disabled} value={data.taskTitle ?? ""} onChange={event => update({ taskTitle: event.target.value })} /></label><div className="grid grid-cols-2 gap-2"><label className="field-label">Priority<select disabled={disabled} value={data.taskPriority ?? "normal"} onChange={event => update({ taskPriority: event.target.value as AgencyTaskPriority })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="field-label">Due in minutes<input type="number" min={0} disabled={disabled} value={data.dueInMinutes ?? 1440} onChange={event => update({ dueInMinutes: Number(event.target.value) })} /></label></div></> : null}
    {data.actionType === "send-webhook" ? <><div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2"><label className="field-label">Method<select disabled={disabled} value={data.webhookMethod ?? "POST"} onChange={event => update({ webhookMethod: event.target.value as AutomationNodeConfig["webhookMethod"] })}><option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option><option value="PATCH">PATCH</option><option value="DELETE">DELETE</option></select></label><label className="field-label">Webhook URL<input type="url" disabled={disabled} placeholder="https://..." value={data.webhookUrl ?? ""} onChange={event => update({ webhookUrl: event.target.value })} /></label></div><label className="field-label">Headers JSON<textarea rows={4} spellCheck={false} disabled={disabled} placeholder={'{\n  "Authorization": "Bearer ..."\n}'} value={data.webhookHeaders ?? ""} onChange={event => update({ webhookHeaders: event.target.value })} /></label><label className="field-label">Request body<textarea rows={7} spellCheck={false} disabled={disabled} placeholder={'{\n  "name": "{{event.name}}"\n}'} value={data.webhookBody ?? ""} onChange={event => update({ webhookBody: event.target.value })} /><span>Variables are resolved immediately before delivery.</span></label></> : <label className="field-label">{data.actionType === "log-activity" ? "Activity message" : data.actionType === "send-email" ? "Email message" : "Task notes"}<textarea rows={6} disabled={disabled} value={data.message ?? ""} onChange={event => update({ message: event.target.value })} /></label>}</>;
}

function FolderEditor({ folder, busy, close, save, remove }: { folder?: AutomationFolder; busy: boolean; close: () => void; save: (values: { name: string; description: string; color: string }) => void; remove?: (folder: AutomationFolder) => void }) {
  // Modal keyboard contract: focus enters the editor, Tab stays inside it, Escape backs out (except mid-save), focus returns to the folder control.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: busy ? undefined : close });
  const [name, setName] = useState(folder?.name ?? "");
  const [description, setDescription] = useState(folder?.description ?? "");
  const [color, setColor] = useState(folder?.color ?? "teal");
  const colors = ["teal", "blue", "violet", "amber", "rose", "emerald", "slate"];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="dialog" ref={dialogRef} aria-modal="true" aria-label={folder ? "Edit automation folder" : "Create automation folder"}><form onSubmit={event => { event.preventDefault(); save({ name, description, color }); }} className="w-full max-w-lg overflow-hidden rounded-md bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-black/10 px-5 py-4"><div><p className="text-[11px] font-bold uppercase text-[#087f8c]">Flow library</p><h2 className="mt-1 font-semibold">{folder ? "Edit folder" : "Create folder"}</h2></div><button type="button" onClick={close} className="icon-button" aria-label="Close"><X size={16} /></button></header><div className="p-5"><label className="field-label">Folder name<input required autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Sales follow-up" /></label><label className="field-label">Description<textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="What belongs in this folder" /></label><fieldset><legend className="text-[11px] font-bold text-slate-600">Colour</legend><div className="mt-2 flex flex-wrap gap-2">{colors.map(option => <button key={option} type="button" aria-label={`${option} folder colour`} aria-pressed={color === option} onClick={() => setColor(option)} className={`grid size-8 place-items-center rounded-md border ${color === option ? "border-slate-950 ring-2 ring-slate-950/15" : "border-black/10"}`}><span className={`size-4 rounded-sm ${FOLDER_TONES[option]}`} /></button>)}</div></fieldset></div><footer className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 px-5 py-4">{folder && remove ? <button type="button" disabled={busy} onClick={() => remove(folder)} className="tool-button mr-auto text-red-700"><Trash2 size={14} /> Delete folder</button> : null}<button type="button" onClick={close} className="tool-button">Cancel</button><button type="submit" disabled={busy || !name.trim()} className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white"><Save size={15} /> Save folder</button></footer></form></div>;
}

function RunHistory({ runs, workflows, selectedId, setSelectedId, refresh, busy, canEdit }: { runs: AutomationRun[]; workflows: AutomationWorkflow[]; selectedId?: string; setSelectedId: (id?: string) => void; refresh: () => void; busy: boolean; canEdit: boolean }) {
  const selected = runs.find(run => run.id === selectedId);
  return <section className="mx-auto mt-5 grid max-w-[1680px] gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
    <div className="min-h-[600px] border border-black/10 bg-white"><div className="flex items-center justify-between border-b border-black/10 px-4 py-3"><div><h2 className="font-semibold">Run history</h2><p className="text-xs text-slate-500">Every wait, decision and action is recorded.</p></div><button type="button" disabled={!canEdit || busy} onClick={refresh} className="tool-button"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Process due runs</button></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-black/10 bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2.5">Flow</th><th className="px-3 py-2.5">Trigger</th><th className="px-3 py-2.5">Started</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Mode</th><th className="w-10" /></tr></thead><tbody>{runs.map(run => { const flowName = workflows.find(item => item.id === run.workflowId)?.name ?? "Deleted flow"; return <tr key={run.id} onClick={() => setSelectedId(run.id)} className={`cursor-pointer border-b border-black/5 ${selectedId === run.id ? "bg-cyan-50" : "hover:bg-slate-50"}`}><td className="px-4 py-3 font-medium">{flowName}</td><td className="px-3 py-3 text-slate-600">{TRIGGER_LABELS[run.triggerType]}</td><td className="px-3 py-3 text-slate-600">{formatDate(run.createdAt)}</td><td className="px-3 py-3"><RunStatus status={run.status} /></td><td className="px-3 py-3 capitalize text-slate-600">{run.mode}</td><td className="px-2"><button type="button" onClick={event => { event.stopPropagation(); setSelectedId(run.id); }} aria-label={`Inspect the ${flowName} run started ${formatDate(run.createdAt)}`} aria-pressed={selectedId === run.id} className="icon-button"><MoreHorizontal size={15} aria-hidden /></button></td></tr>; })}</tbody></table>{!runs.length ? <div className="py-20 text-center text-sm text-slate-500"><FileClock className="mx-auto mb-3 text-slate-300" />No runs have started yet.</div> : null}</div></div>
    <aside className="min-h-[600px] border border-black/10 bg-white p-4">{selected ? <><div className="flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase text-[#087f8c]">Run detail</p><h3 className="mt-1 font-semibold">{workflows.find(item => item.id === selected.workflowId)?.name ?? "Deleted flow"}</h3></div><button type="button" onClick={() => setSelectedId(undefined)} aria-label="Close run detail" className="icon-button"><X size={15} aria-hidden /></button></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="bg-slate-50 p-2"><span className="block text-[10px] uppercase text-slate-500">Status</span><RunStatus status={selected.status} /></div><div className="bg-slate-50 p-2"><span className="block text-[10px] uppercase text-slate-500">Duration</span><span className="font-medium">{duration(selected)}</span></div></div><ol className="mt-5 space-y-4 border-l border-slate-200 pl-4">{selected.logs.map((log, index) => <li key={`${log.at}-${index}`} className="relative"><span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${log.level === "error" ? "bg-red-500" : log.level === "success" ? "bg-emerald-500" : "bg-slate-400"}`} /><p className="text-sm leading-5">{log.message}</p><time className="mt-1 block text-[11px] text-slate-400">{formatDate(log.at)}</time></li>)}</ol></> : <div className="flex min-h-[500px] items-center justify-center text-center text-sm text-slate-500"><div><History className="mx-auto mb-3 text-slate-300" />Select a run to inspect every step.</div></div>}</aside>
  </section>;
}

function RunStatus({ status }: { status: AutomationRun["status"] }) {
  const classes = status === "succeeded" ? "bg-emerald-100 text-emerald-800" : status === "failed" ? "bg-red-100 text-red-800" : status === "waiting" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-bold capitalize ${classes}`}>{status}</span>;
}

function duration(run: AutomationRun): string {
  if (run.status === "waiting" && run.waitUntil) return `until ${formatUkDate(run.waitUntil, { hour: "2-digit", minute: "2-digit" })}`;
  const milliseconds = (run.finishedAt ?? run.updatedAt) - run.createdAt;
  return milliseconds < 1_000 ? `${milliseconds} ms` : `${Math.round(milliseconds / 1_000)} sec`;
}

function formatDate(value: number): string { return formatUkDate(value, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

function CustomAIRegistry({ records, team, canEdit, edit, remove }: { records: CustomAIRecord[]; team: TeamMember[]; canEdit: boolean; edit: (record: CustomAIRecord) => void; remove: (record: CustomAIRecord) => void }) {
  return <section className="mx-auto mt-5 max-w-[1680px]"><div className="flex items-end justify-between border-b border-black/10 pb-3"><div><h2 className="font-semibold">Custom AI registry</h2><p className="mt-1 text-sm text-slate-500">Record external assistants, their ownership, capabilities and working links.</p></div><span className="rounded bg-slate-200 px-2 py-1 text-[11px] font-bold uppercase text-slate-600">Registry only</span></div><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{records.map(record => <article key={record.id} className="rounded-md border border-black/10 bg-white p-4"><div className="flex items-start justify-between gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-cyan-50 text-[#087f8c]"><Bot size={18} /></span><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${record.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{record.status}</span></div><h3 className="mt-3 font-semibold">{record.name}</h3><p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">{record.purpose || "No purpose recorded yet."}</p><div className="mt-3 flex min-h-6 flex-wrap gap-1">{record.capabilities.slice(0, 4).map(item => <span key={item} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{item}</span>)}</div><p className="mt-4 text-xs text-slate-500">Owner: {team.find(member => member.id === record.ownerUserId)?.name || "Unassigned"}</p><div className="mt-4 flex flex-wrap gap-1.5 border-t border-black/10 pt-3"><a href={record.workspaceUrl} target="_blank" rel="noreferrer" className="tool-button">Open AI <ExternalLink size={13} /></a>{record.docsUrl ? <a href={record.docsUrl} target="_blank" rel="noreferrer" className="tool-button">Docs <ExternalLink size={13} /></a> : null}{canEdit ? <><button type="button" onClick={() => edit(record)} className="tool-button ml-auto">Edit</button><button type="button" onClick={() => remove(record)} className="icon-button text-red-700" title="Remove from registry"><Trash2 size={14} /></button></> : null}</div></article>)}{!records.length ? <div className="col-span-full py-20 text-center"><Bot className="mx-auto text-slate-300" size={30} /><h3 className="mt-3 font-semibold">No custom AIs recorded</h3><p className="mt-1 text-sm text-slate-500">Keep links and ownership clear as you create them.</p></div> : null}</div></section>;
}

type SaveAIValues = { name: string; purpose: string; provider: string; workspaceUrl: string; docsUrl: string; status: CustomAIStatus; ownerUserId: string; capabilities: string[]; notes: string };

function AIEditor({ record, team, busy, close, save }: { record?: CustomAIRecord; team: TeamMember[]; busy: boolean; close: () => void; save: (values: SaveAIValues) => void }) {
  // Modal keyboard contract: focus enters the editor, Tab stays inside it, Escape backs out (except mid-save), focus returns to the registry control.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: busy ? undefined : close });
  const [values, setValues] = useState<SaveAIValues>({ name: record?.name ?? "", purpose: record?.purpose ?? "", provider: record?.provider ?? "", workspaceUrl: record?.workspaceUrl ?? "", docsUrl: record?.docsUrl ?? "", status: record?.status ?? "testing", ownerUserId: record?.ownerUserId ?? "", capabilities: record?.capabilities ?? [], notes: record?.notes ?? "" });
  const [capabilityText, setCapabilityText] = useState(values.capabilities.join(", "));
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="dialog" ref={dialogRef} aria-modal="true" aria-label={record ? "Edit custom AI" : "Register custom AI"}><form onSubmit={event => { event.preventDefault(); save({ ...values, capabilities: capabilityText.split(",").map(item => item.trim()).filter(Boolean) }); }} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-md bg-white shadow-2xl"><header className="sticky top-0 flex items-center justify-between border-b border-black/10 bg-white px-5 py-4"><div><p className="text-[11px] font-bold uppercase text-[#087f8c]">External workspace</p><h2 className="font-semibold">{record ? "Edit custom AI" : "Register custom AI"}</h2></div><button type="button" onClick={close} className="icon-button" aria-label="Close"><X size={16} /></button></header><div className="grid gap-4 p-5 md:grid-cols-2"><label className="field-label">Name<input required value={values.name} onChange={event => setValues(current => ({ ...current, name: event.target.value }))} /></label><label className="field-label">Provider or platform<input value={values.provider} onChange={event => setValues(current => ({ ...current, provider: event.target.value }))} placeholder="OpenAI, Claude, custom app" /></label><label className="field-label md:col-span-2">Purpose<textarea rows={3} value={values.purpose} onChange={event => setValues(current => ({ ...current, purpose: event.target.value }))} /></label><label className="field-label">Workspace URL<input required type="url" value={values.workspaceUrl} onChange={event => setValues(current => ({ ...current, workspaceUrl: event.target.value }))} /></label><label className="field-label">Documentation URL<input type="url" value={values.docsUrl} onChange={event => setValues(current => ({ ...current, docsUrl: event.target.value }))} /></label><label className="field-label">Status<select value={values.status} onChange={event => setValues(current => ({ ...current, status: event.target.value as CustomAIStatus }))}><option value="testing">Testing</option><option value="active">Active</option><option value="paused">Paused</option><option value="retired">Retired</option></select></label><label className="field-label">Owner<select value={values.ownerUserId} onChange={event => setValues(current => ({ ...current, ownerUserId: event.target.value }))}><option value="">Unassigned</option>{team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className="field-label md:col-span-2">Capabilities<input value={capabilityText} onChange={event => setCapabilityText(event.target.value)} placeholder="Research, proposals, reporting" /><span>Separate capabilities with commas.</span></label><label className="field-label md:col-span-2">Internal notes<textarea rows={5} value={values.notes} onChange={event => setValues(current => ({ ...current, notes: event.target.value }))} /></label></div><footer className="flex justify-end gap-2 border-t border-black/10 px-5 py-4"><button type="button" onClick={close} className="tool-button">Cancel</button><button type="submit" disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white"><Save size={15} /> Save AI</button></footer></form></div>;
}
