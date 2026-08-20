"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { BellRing, Sparkles, X } from "lucide-react";

import type { AssistantWorkspaceState } from "@/server/types";
import type { AdvisorRadarDigest } from "@/lib/radar/businessRadar";

// Lazy-load the Advisor chat. It's a heavy client workspace (~880 lines) that
// used to be always-mounted (hidden with a CSS transform) on EVERY agency page,
// so it hydrated even when never opened. Now its chunk loads — and it mounts —
// only on first open. The drawer is closed by default, so nothing visible
// changes; the first open pays a tiny lazy-chunk cost (with a loading fallback).
const AssistantWorkspace = dynamic(
  () => import("@/app/portal/agency/assistant/AssistantWorkspace").then(m => m.AssistantWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="grid flex-1 place-items-center text-sm text-black/40">Loading Advisor…</div>
    ),
  },
);

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
  // Mount the heavy chat only after the drawer's first open, then keep it
  // mounted so conversation state persists across open/close.
  const [mounted, setMounted] = useState(false);
  const [notice, setNotice] = useState("");
  const [prefill, setPrefill] = useState("");
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const openRef = useRef(false);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    // The event may carry a question — an alert the operator could not make
    // sense of. Loaded into the composer, never sent automatically: spending
    // a request on their behalf is not ours to decide.
    const handleOpen = (event: Event) => {
      const question = (event as CustomEvent<{ question?: string }>).detail?.question;
      if (typeof question === "string" && question.trim()) setPrefill(question.trim());
      openDrawer();
    };
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
    setMounted(true);
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
        aria-label={notice ? "Open Aqua Advisor, reply ready" : "Open Aqua Advisor"}
        aria-expanded={open}
        aria-controls="aqua-advisor-drawer"
        className="mm-has-attention-badge relative inline-flex size-9 items-center justify-center gap-2 overflow-visible rounded-md border border-black/10 bg-white/60 text-black/55 transition hover:bg-white hover:text-black xl:w-auto xl:px-3"
      >
        <Sparkles size={16} />
        <span className="hidden text-xs font-semibold xl:inline">Advisor</span>
        {notice ? <span className="mm-attention-badge absolute -right-1 -top-1 size-2 rounded-full bg-brand" aria-hidden /> : null}
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
              {mounted ? (
                <AssistantWorkspace
                  initialWorkspace={initialWorkspace}
                  configured={configured}
                  model={model}
                  userName={userName}
                  coverage={coverage}
                  variant="drawer"
                  prefill={prefill}
                  onClose={closeDrawer}
                  onAssistantDone={handleDone}
                />
              ) : null}
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
