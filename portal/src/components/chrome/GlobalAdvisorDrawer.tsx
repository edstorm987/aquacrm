"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BellRing, Sparkles, X } from "lucide-react";

import { AssistantWorkspace } from "@/app/portal/agency/assistant/AssistantWorkspace";
import type { AssistantWorkspaceState } from "@/server/types";
import type { AdvisorRadarDigest } from "@/lib/businessRadar";

interface Coverage {
  clients: number;
  team: number;
  pipelines: number;
  recentActivity: number;
  modules: string[];
  radar: AdvisorRadarDigest;
}

export function GlobalAdvisorDrawer({
  initialWorkspace,
  configured,
  model,
  userName,
  coverage,
}: {
  initialWorkspace: AssistantWorkspaceState;
  configured: boolean;
  model: string;
  userName: string;
  coverage: Coverage;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const openRef = useRef(false);
  const attentionCount = coverage.radar.critical + coverage.radar.warning;

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    const handleOpen = () => openDrawer();
    window.addEventListener("aqua-advisor:open", handleOpen);
    return () => window.removeEventListener("aqua-advisor:open", handleOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrawer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function openDrawer() {
    openRef.current = true;
    setOpen(true);
    setNotice("");
  }

  function closeDrawer() {
    openRef.current = false;
    setOpen(false);
  }

  function handleDone() {
    if (!openRef.current) setNotice("Aqua Advisor reply is ready.");
  }

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        aria-label={attentionCount ? `Open Aqua Advisor, ${attentionCount} issues need attention` : "Open Aqua Advisor"}
        aria-expanded={open}
        aria-controls="aqua-advisor-drawer"
        className="mm-has-attention-badge relative inline-flex size-9 items-center justify-center gap-2 overflow-visible rounded-md border border-black/10 bg-white/60 text-black/55 transition hover:bg-white hover:text-black xl:w-auto xl:px-3"
      >
        <Sparkles size={16} />
        <span className="hidden text-xs font-semibold xl:inline">Advisor</span>
        {attentionCount ? <span className="mm-attention-badge absolute -right-1.5 -top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white" aria-hidden>{Math.min(99, attentionCount)}</span> : notice ? <span className="mm-attention-badge absolute -right-1 -top-1 size-2 rounded-full bg-brand" aria-hidden /> : null}
      </button>

      {portalRoot ? createPortal(
        <>
          <div className={`pointer-events-none fixed inset-0 z-[70] transition ${open ? "visible" : "invisible"}`} aria-hidden={!open}>
            <aside
              id="aqua-advisor-drawer"
              role="dialog"
              aria-modal="false"
              aria-label="Aqua Advisor"
              className={[
                "mm-portal-root mm-advisor-drawer mm-drawer-panel-right pointer-events-auto absolute inset-y-0 right-0 flex flex-col bg-[#fbfaf8] shadow-2xl transition-transform duration-300",
                open ? "translate-x-0" : "translate-x-full",
              ].join(" ")}
            >
              <AssistantWorkspace
                initialWorkspace={initialWorkspace}
                configured={configured}
                model={model}
                userName={userName}
                coverage={coverage}
                variant="drawer"
                onClose={closeDrawer}
                onAssistantDone={handleDone}
              />
            </aside>
          </div>

          {notice ? (
            <div role="status" aria-live="polite" className="mm-portal-root mm-toast fixed bottom-4 right-4 z-[80] flex w-[min(92vw,360px)] items-start rounded-lg border border-brand/20 bg-white shadow-xl">
              <button type="button" onClick={openDrawer} className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand/10 text-brand"><BellRing size={16} /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-black/85">{notice}</span>
                  <span className="mt-0.5 block text-xs text-black/45">Open the side panel to read it.</span>
                </span>
              </button>
              <button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")} className="mr-2 mt-2 grid size-8 shrink-0 place-items-center rounded-md text-black/35 hover:bg-black/[0.04] hover:text-black/70">
                <X size={14} />
              </button>
            </div>
          ) : null}
        </>,
        portalRoot,
      ) : null}
    </>
  );
}
