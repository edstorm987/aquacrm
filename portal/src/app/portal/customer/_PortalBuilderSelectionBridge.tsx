"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

export function PortalBuilderSelectionBridge({ blockId, blockType, children, className }: {
  blockId: string;
  blockType: string;
  children: ReactNode;
  className: string;
}) {
  const [editablePreview, setEditablePreview] = useState(false);

  useEffect(() => {
    setEditablePreview(window.self !== window.top && new URLSearchParams(window.location.search).get("portalDraft") === "1");
  }, []);

  function select(event: MouseEvent<HTMLDivElement>) {
    if (!editablePreview) return;
    event.preventDefault();
    event.stopPropagation();
    window.parent.postMessage({ type: "aqua:portal-block-select", blockId }, window.location.origin);
  }

  return (
    <div
      className={`${className} ${editablePreview ? "group relative cursor-pointer outline outline-1 outline-transparent transition hover:outline-cyan-500/55 hover:outline-offset-2" : ""}`}
      data-portal-block={blockId}
      data-portal-block-type={blockType}
      onClickCapture={select}
    >
      {editablePreview ? <span className="pointer-events-none absolute right-2 top-2 z-20 rounded-sm bg-[#0e191b] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-cyan-200 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">Select block</span> : null}
      {children}
    </div>
  );
}
