"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, FolderPlus, Plus, Search, Upload, X } from "lucide-react";
import { useMenuKeys } from "@/lib/a11y/useMenuKeys";

// ─── DEV EDITOR — the universal "+" ──────────────────────────────────────────
//
// Ed's simplification: ONE add affordance, whose contents depend on what you
// are looking at. In a visual view it offers blocks, sections and the
// components you have saved — the Wix-Studio "+" people already understand. In
// the code view the same button offers a new file, a new folder or an upload.
//
// One button to learn, one place to look, and every future "add" lands here
// instead of growing another control somewhere else in the chrome. It is
// mounted twice by the editor — the canvas header and the inspector rail —
// and both are the same instance of this component with the same options.
//
// ── The skin ────────────────────────────────────────────────────────────────
// This panel wears the EDITOR's vocabulary (dark, translucent, `#171a17`
// ground, `border-white/10` — the same words as `editorAiSkin.ts`), because
// the editor is its only mount: nothing else in the tree renders <AddMenu>
// today (checked 2026-08-22). The light-themed element-library popover seen in
// Ed's walkthrough predates this restyle. If a light portal surface ever
// mounts this menu, give it a `skin` prop THEN and derive these classes from
// it — do not fork the component, and do not default the editor to light.

export interface AddOption {
  id: string;
  label: string;
  description?: string;
  /** Grouping header inside the panel. */
  group: string;
  icon?: React.ReactNode;
  /** Absent = shown but not selectable, with `unavailableReason` explaining. */
  onSelect?: () => void;
  unavailableReason?: string;
}

export function AddMenu({
  options,
  label = "Add",
  title = "Add to this page",
  align = "start",
}: {
  options: AddOption[];
  label?: string;
  title?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // issues #138 — the `role="menu"` below promises arrow keys; this keeps it.
  useMenuKeys(wrapRef, { open, onOpen: () => setOpen(true), onClose: () => setOpen(false) });

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? options.filter(option =>
          option.label.toLowerCase().includes(needle) || (option.description ?? "").toLowerCase().includes(needle))
      : options;
    const out = new Map<string, AddOption[]>();
    for (const option of matching) {
      const list = out.get(option.group) ?? [];
      list.push(option);
      out.set(option.group, list);
    }
    return [...out.entries()];
  }, [options, query]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        title={label}
        data-mm-add-menu
        className="grid size-8 place-items-center rounded-md border border-white/12 bg-white/[0.06] text-white/70 transition hover:bg-cyan-300/15 hover:text-cyan-200"
      >
        <Plus size={15} aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute top-full z-[90] mt-1.5 max-h-[26rem] w-72 overflow-hidden rounded-lg border border-white/12 bg-[#171a17] shadow-2xl shadow-black/50 ${align === "end" ? "right-0" : "left-0"}`}
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white/80">{title}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-5 place-items-center rounded text-white/35 hover:bg-white/10 hover:text-white/80">
              <X size={11} aria-hidden />
            </button>
          </div>

          <div className="relative border-b border-white/10 p-2">
            <Search size={12} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search what you can add"
              className="h-8 w-full rounded-md border border-white/10 bg-white/[0.04] pl-7 pr-2 text-[11px] text-white/85 outline-none placeholder:text-white/25 focus:border-cyan-300/40"
            />
          </div>

          <div className="max-h-[19rem] overflow-y-auto p-1.5">
            {groups.length === 0 ? (
              <p className="px-2 py-3 text-[11px] text-white/40">Nothing matches that.</p>
            ) : groups.map(([group, items]) => (
              <div key={group} className="mb-1.5 last:mb-0">
                <p className="px-2 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-wide text-white/30">{group}</p>
                {items.map(option => {
                  const disabled = !option.onSelect;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitem"
                      disabled={disabled}
                      title={option.unavailableReason ?? option.description}
                      onClick={() => { option.onSelect?.(); setOpen(false); }}
                      className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition ${
                        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-white/[0.06]"
                      }`}
                    >
                      {option.icon ? <span className="mt-0.5 shrink-0 text-white/40">{option.icon}</span> : null}
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-semibold text-white/85">{option.label}</span>
                        {option.description ? <span className="mt-0.5 block text-[10px] leading-4 text-white/40">{option.description}</span> : null}
                        {disabled && option.unavailableReason ? <span className="mt-0.5 block text-[10px] leading-4 text-amber-200/60">{option.unavailableReason}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The code-view options.
 *
 * `onCreate` receives what to make. Both targets have a live path now: the
 * local workspace writes to disk through the files route, and a repository-
 * backed project COMMITS the new file (or the folder's .gitkeep) to its draft
 * branch through /api/portal/dev/repo-write. When `onCreate` is absent the
 * options still SHOW, disabled, with the reason — an option that silently
 * does nothing is worse than one that says why.
 */
export function fileAddOptions(
  onCreate?: (kind: "file" | "folder") => void,
  unavailableReason?: string,
): AddOption[] {
  return [
    {
      id: "new-file", group: "Repository", label: "New file",
      description: "Create a file in this repository.", icon: <FilePlus2 size={13} />,
      onSelect: onCreate ? () => onCreate("file") : undefined, unavailableReason,
    },
    {
      id: "new-folder", group: "Repository", label: "New folder",
      description: "Create a folder.", icon: <FolderPlus size={13} />,
      onSelect: onCreate ? () => onCreate("folder") : undefined, unavailableReason,
    },
    {
      id: "upload", group: "Repository", label: "Upload files",
      description: "Drop images, fonts or documents in.", icon: <Upload size={13} />,
      unavailableReason: "Uploads need a binary write path — not wired yet.",
    },
  ];
}
