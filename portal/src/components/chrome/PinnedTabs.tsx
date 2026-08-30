"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Crosshair, MapPin, PanelLeft, PanelTop, Pencil, Pin, Star, Trash2, X } from "lucide-react";

import { findTab, tabsAt, useChromeLayout, type SavedTab, type SavedTabPlacement } from "./pinnedTabsStore";
import { useLongPress } from "./useLongPress";
import { SavedTabIconPicker } from "./SavedTabIconPicker";
import { chosenNavIcon } from "./navIcons";
import { SpotPicker } from "./SpotPicker";
import type { SavedSpot } from "./savedSpot";
import { sharedChromeLinkPrefetch } from "@/lib/chrome/sharedChromeLinkPrefetch";
import { navToneStyle } from "./navTones";

// The full current location (path + query) — a saved tab must remember
// ?tab=…/?view=… so it returns you to the exact working VIEW, not just the base
// route. Ed: *"the view so we get the right icon"* — the icon is resolved from
// this href against the live nav tree, in `sidebarLayout.applyPersonalChrome`.
function useCurrentHref(): string {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function prettyPathLabel(href: string): string {
  try {
    const path = href.split("?")[0].replace(/\/+$/, "");
    const seg = path.split("/").filter(Boolean).pop() || "Page";
    const words = seg.replace(/[-_]+/g, " ").trim();
    return words.replace(/\b\w/g, c => c.toUpperCase()) || "Page";
  } catch {
    return "Page";
  }
}

// The label the user recognises the page by — its own heading, not the tenant
// name the topbar shows. Read live at save time; fall back to a route segment.
function derivePageLabel(href: string, fallback: string): string {
  if (typeof document !== "undefined") {
    const heading = document.querySelector("main h1, h1")?.textContent?.trim();
    if (heading) return heading.length > 42 ? `${heading.slice(0, 41)}…` : heading;
  }
  const pretty = prettyPathLabel(href);
  return pretty !== "Page" ? pretty : fallback;
}

const TOPBAR: SavedTabPlacement = { kind: "topbar" };
const SIDEBAR: SavedTabPlacement = { kind: "sidebar" };

/**
 * The ★ control in the topbar. The star quick-saves the current view to the
 * topbar strip; the ▾ opens the rest — keep it in the sidebar instead, save a
 * specific SPOT on the page, rename it, or clear everything.
 */
export function PinCurrentControl({ label }: { label: string }) {
  const href = useCurrentHref();
  const { savedTabs, pin, toggle, rename, remove, clear } = useChromeLayout();
  const current = findTab(savedTabs, href);
  const saved = Boolean(current);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Built at SAVE TIME, inside the handler — never during render. derivePageLabel
  // reads the live DOM, which is impure in the render phase and answers
  // differently on the server than on the client.
  const currentEntry = (spot?: SavedSpot) => ({ href, label: current?.label ?? derivePageLabel(href, label), spot });
  const setPlacement = (placement: SavedTabPlacement) => { pin(currentEntry(), placement); setOpen(false); };

  const onPickSpot = (spot: SavedSpot) => {
    setPicking(false);
    // Saving a spot saves the tab too, if it was not saved already — otherwise
    // "save this spot" would appear to do nothing for a page nobody had pinned.
    pin(currentEntry(spot), current?.placement ?? TOPBAR);
  };

  return (
    <div ref={wrapRef} className="relative flex shrink-0 items-center">
      {picking ? <SpotPicker onPick={onPickSpot} onCancel={() => setPicking(false)} /> : null}
      <button
        type="button"
        onClick={() => toggle(currentEntry(), TOPBAR)}
        aria-pressed={saved}
        aria-label={current ? "Unpin this page" : "Pin this page to the topbar"}
        title={current ? (current.placement.kind === "topbar" ? "Saved to the topbar" : "Saved to the sidebar") : "Save this view"}
        data-mm-pin-toggle
        className="mm-pinned-toggle inline-flex h-9 items-center gap-0.5 rounded-l-md border border-r-0 border-black/10 bg-white/60 pl-2 pr-1 text-black/45 transition hover:bg-white hover:text-black"
      >
        <Star size={16} className={saved ? "fill-amber-400 text-amber-500" : ""} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Pinning options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="mm-pinned-caret inline-flex h-9 items-center rounded-r-md border border-black/10 bg-white/60 px-1 text-black/40 transition hover:bg-white hover:text-black"
      >
        <ChevronDown size={13} aria-hidden />
      </button>

      {open ? (
        <div role="menu" className="mm-pinned-menu absolute left-0 top-full z-[80] mt-1.5 w-64 overflow-hidden rounded-lg border border-black/10 bg-white p-1 text-sm shadow-xl shadow-black/10">
          {renaming ? (
            <form
              className="p-1.5"
              onSubmit={event => {
                event.preventDefault();
                if (current) rename(current.id, draftName);
                setRenaming(false);
                setOpen(false);
              }}
            >
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-black/45">
                Name this shortcut
                <input
                  autoFocus
                  value={draftName}
                  onChange={event => setDraftName(event.target.value)}
                  maxLength={60}
                  className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 text-xs font-normal text-black/80"
                />
              </label>
              <div className="mt-2 flex gap-1.5">
                <button type="submit" className="flex-1 rounded-md bg-black/85 px-2 py-1.5 text-xs font-semibold text-white">Save</button>
                <button type="button" onClick={() => setRenaming(false)} className="rounded-md border border-black/10 px-2 py-1.5 text-xs font-medium text-black/60">Cancel</button>
              </div>
            </form>
          ) : (
            <>
              {!current || current.placement.kind !== "topbar" ? (
                <MenuItem icon={<PanelTop size={14} />} onClick={() => setPlacement(TOPBAR)}>Save to topbar</MenuItem>
              ) : null}
              {!current || current.placement.kind !== "sidebar" ? (
                <MenuItem icon={<PanelLeft size={14} />} onClick={() => setPlacement(SIDEBAR)}>
                  {current ? "Move to sidebar" : "Save to sidebar"}
                </MenuItem>
              ) : null}
              <MenuItem icon={<Crosshair size={14} />} onClick={() => { setPicking(true); setOpen(false); }}>
                {current?.spot ? "Change the saved spot…" : "Save this spot…"}
              </MenuItem>
              {current ? (
                <MenuItem
                  icon={<Pencil size={14} />}
                  onClick={() => { setDraftName(current.label); setRenaming(true); }}
                >
                  Rename this shortcut
                </MenuItem>
              ) : null}
              {current?.spot ? (
                <p className="flex items-start gap-2 px-2 py-1.5 text-[11px] leading-4 text-black/45">
                  <MapPin size={12} className="mt-0.5 shrink-0 text-black/35" aria-hidden />
                  <span className="min-w-0">Lands on <span className="font-medium text-black/65">{current.spot.text || "the saved spot"}</span></span>
                </p>
              ) : null}
              {current ? (
                <MenuItem icon={<X size={14} />} onClick={() => { remove(href); setOpen(false); }}>Unpin this page</MenuItem>
              ) : null}
              {savedTabs.length ? (
                <>
                  <div className="my-1 border-t border-black/10" />
                  <MenuItem icon={<Trash2 size={14} />} tone="danger" onClick={() => { clear(); setOpen(false); }}>Unpin all pages</MenuItem>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The inline rename box a long press opens.
 *
 * Inline rather than a modal because the thing being renamed has to stay in
 * view: half the point of a name is how it looks in the strip it lives in.
 */
function RenameBox({ initial, onDone, onCancel }: { initial: string; onDone: (value: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus AND select, from an effect rather than `onFocus`. `autoFocus` fires
  // before React attaches the handler, so the browser walk found the box
  // opening with the cursor at the end and typing appending to the old name.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={event => { event.preventDefault(); onDone(value); }}
      onClick={event => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={value}
        maxLength={60}
        onChange={event => setValue(event.target.value)}
        onBlur={() => onDone(value)}
        onKeyDown={event => {
          if (event.key === "Escape") { event.stopPropagation(); onCancel(); return; }
          // Enter commits EXPLICITLY. Implicit form submission depends on the
          // form having a submit button, and this one deliberately has none —
          // relying on it left the box open with the new name untaken.
          if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); onDone(value); }
        }}
        aria-label="Rename this shortcut"
        className="w-36 rounded border border-brand/40 bg-white px-1.5 py-0.5 text-xs text-black/80 outline-none"
      />
    </form>
  );
}

function MenuItem({ icon, children, onClick, tone }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; tone?: "danger" }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition hover:bg-black/[0.05] ${tone === "danger" ? "text-red-600 hover:bg-red-50" : "text-black/75"}`}
    >
      <span className="grid size-5 shrink-0 place-items-center text-black/40" aria-hidden>{icon}</span>
      {children}
    </button>
  );
}

/**
 * A saved chip. Draggable, because Ed asked for saved tabs to integrate into
 * the sidebar *"if dragged into it"* — the drop targets live in
 * `SidebarReorder`, and this is the thing being dragged.
 */
function SavedChip({ tab, active, moveTo, onMove, onRemove, onRename, onIcon }: {
  tab: SavedTab; active: boolean;
  moveTo: "topbar" | "sidebar"; onMove: () => void; onRemove: () => void;
  onRename: (label: string) => void; onIcon: (icon: string | undefined) => void;
}) {
  const { id, href, label } = tab;
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);
  // Ed: *"rename saved tabs if i do a long hold on it"*. The same action stays
  // in the star menu — a long press is not discoverable and must never be the
  // only way to reach something.
  const hold = useLongPress(() => setRenaming(true), !renaming);
  const holdIcon = useLongPress(() => setPicking(true), !renaming);
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const Chosen = chosenNavIcon(tab.icon);

  return (
    <span
      {...hold}
      draggable
      onDragStart={event => {
        event.dataTransfer.effectAllowed = "move";
        // The id, under a type the sidebar listens for. Plain text/plain would
        // be indistinguishable from a text selection dragged in from elsewhere.
        event.dataTransfer.setData("application/x-aqua-saved-tab", id);
        event.dataTransfer.setData("text/plain", label);
      }}
      className={[
        "group inline-flex shrink-0 cursor-grab items-center gap-0.5 rounded-md border py-1 pl-2.5 pr-1 text-xs transition active:cursor-grabbing",
        active ? "border-brand/40 bg-brand/10 text-brand" : "border-black/10 bg-white/60 text-black/70 hover:border-black/20 hover:bg-white hover:text-black",
      ].join(" ")}
    >
      <span
        ref={iconRef}
        className="relative flex size-4 shrink-0 items-center justify-center"
        {...holdIcon}
        // The icon's press must not ALSO start the chip's. Both handlers see the
        // same pointerdown otherwise, and holding the icon opened the rename box
        // as well as the picker.
        onPointerDown={event => { event.stopPropagation(); holdIcon.onPointerDown(event); }}
      >
        {/* Hold the icon to change it — Ed, 2026-08-27. */}
        {Chosen ? <Chosen size={12} className="text-black/45" aria-hidden /> : <Star size={10} className="fill-amber-400 text-amber-500" aria-hidden />}
      </span>
      {renaming ? (
        <RenameBox initial={label} onDone={value => { onRename(value); setRenaming(false); }} onCancel={() => setRenaming(false)} />
      ) : (
        <Link href={href} prefetch={sharedChromeLinkPrefetch()} className="max-w-[12rem] truncate font-medium" title={`${label} — hold to rename`}>{label}</Link>
      )}
      {tab.spot ? <MapPin size={10} className="shrink-0 text-black/30" aria-label="Lands on a saved spot" /> : null}
      <button
        type="button"
        onClick={onMove}
        aria-label={moveTo === "sidebar" ? `Move ${label} to sidebar` : `Move ${label} to topbar`}
        title={moveTo === "sidebar" ? "Move to sidebar" : "Move to topbar"}
        className="grid size-4 shrink-0 place-items-center rounded text-black/25 opacity-0 transition group-hover:opacity-100 hover:bg-black/10 hover:text-black/70"
      >
        {moveTo === "sidebar" ? <PanelLeft size={11} aria-hidden /> : <PanelTop size={11} aria-hidden />}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Unpin ${label}`}
        title="Unpin"
        className="grid size-4 shrink-0 place-items-center rounded text-black/30 transition hover:bg-black/10 hover:text-black/70"
      >
        <X size={11} aria-hidden />
      </button>
      {picking ? (
        <SavedTabIconPicker current={tab.icon} anchor={iconRef.current} onPick={onIcon} onClose={() => setPicking(false)} />
      ) : null}
    </span>
  );
}

/** The topbar strip — quick back-and-forth shortcuts. */
export function PinnedTabsBar() {
  const currentHref = useCurrentHref();
  const { savedTabs, pin, remove, rename, setIcon } = useChromeLayout();
  const items = tabsAt(savedTabs, TOPBAR);
  if (!items.length) return null;
  return (
    <nav aria-label="Pinned pages" className="mm-pinned-bar flex items-center gap-1.5 overflow-x-auto border-b border-black/10 bg-white/25 px-3 py-1.5 backdrop-blur-xl sm:px-4 md:px-6">
      <span className="mm-pinned-bar-label hidden shrink-0 items-center gap-1 pr-1 text-[10px] font-semibold uppercase tracking-wide text-black/35 sm:inline-flex">
        <Star size={11} className="fill-amber-400 text-amber-500" aria-hidden /> Pinned
      </span>
      {items.map(item => (
        <SavedChip
          key={item.id}
          tab={item}
          active={item.href === currentHref}
          moveTo="sidebar"
          onMove={() => pin({ href: item.href, label: item.label }, SIDEBAR)}
          onRemove={() => remove(item.href)}
          onRename={value => rename(item.id, value)}
          onIcon={icon => setIcon(item.id, icon)}
        />
      ))}
    </nav>
  );
}

/**
 * The sidebar's own "Saved" section — shortcuts that were not dropped into a
 * nav panel. Anything dropped INTO a panel is rendered by the sidebar itself as
 * an ordinary nav row (`applyPersonalChrome`), which is what "properly
 * integrate" means; this section is the home for the rest.
 */
export function SidebarPinnedTabs() {
  const currentHref = useCurrentHref();
  const { savedTabs, pin, remove, rename, setIcon, setTone } = useChromeLayout();
  const items = tabsAt(savedTabs, SIDEBAR);
  if (!items.length) return null;
  return (
    <div className="mm-sidebar-panel" data-panel-id="pinned">
      <div className="mm-sidebar-heading flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-black/50">
        <Pin size={12} aria-hidden className="text-black/40" />
        <span className="flex-1 truncate">Saved</span>
        <span className="rounded-full text-[10px] font-medium tabular-nums text-black/40">{items.length}</span>
      </div>
      <ul className="mt-0.5 flex flex-col">
        {items.map(item => (
          <SidebarSavedRow
            key={item.id}
            tab={item}
            active={item.href === currentHref}
            onMove={() => pin({ href: item.href, label: item.label }, TOPBAR)}
            onRemove={() => remove(item.href)}
            onRename={value => rename(item.id, value)}
            onIcon={icon => setIcon(item.id, icon)}
            onTone={tone => setTone(item.id, tone)}
          />
        ))}
      </ul>
    </div>
  );
}

/** One saved row in the sidebar. Hold it to rename; hold its icon to change it. */
function SidebarSavedRow({ tab, active, onMove, onRemove, onRename, onIcon, onTone }: {
  tab: SavedTab; active: boolean;
  onMove: () => void; onRemove: () => void;
  onRename: (label: string) => void; onIcon: (icon: string | undefined) => void;
  onTone: (tone: string | undefined) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);
  // Editing is exclusive: while either popover is open the row is not a drag
  // handle and not a second hold target. Holding a row that is already showing
  // a rename box used to re-arm the same press underneath it.
  const editing = renaming || picking;
  const hold = useLongPress(() => setRenaming(true), !editing);
  const holdIcon = useLongPress(() => setPicking(true), !editing);
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const Chosen = chosenNavIcon(tab.icon);
  const item = tab;

  return (
    <li
              className="group relative"
              // Not draggable mid-edit: the rename box sits ON the row, and a
              // browser that starts a native drag from an input steals the
              // pointer before a single character is typed.
              draggable={!editing}
              style={navToneStyle(item.tone)}
              onDragStart={event => {
                // A press that became a drag is a drag. Without this the hold
                // timer keeps running through the whole gesture and a rename
                // box opens the moment the row is dropped.
                hold.onPointerUp();
                holdIcon.onPointerUp();
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-aqua-saved-tab", item.id);
                event.dataTransfer.setData("text/plain", item.label);
              }}
            >
              <Link
                href={item.href}
                prefetch={sharedChromeLinkPrefetch()}
                data-nav-tone="amber"
                aria-current={active ? "page" : undefined}
                title={item.spot?.text ? `${item.label} — lands on “${item.spot.text}”` : item.label}
                className={`mm-sidebar-link flex min-h-10 items-center gap-2 rounded-md px-2 py-2 ${active ? "is-active font-medium" : "text-black/80"}`}
              >
                {/* Hold the ICON for appearance. `stopPropagation` keeps this
                    press off the label's rename hold — they are siblings under
                    one link and would otherwise both arm on one pointerdown. */}
                <span
                  ref={iconRef}
                  className="mm-sidebar-link-icon relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                  {...holdIcon}
                  onPointerDown={event => { event.stopPropagation(); holdIcon.onPointerDown(event); }}
                >
                  {/* A chosen icon wins; then the saved-spot pin; then the star. */}
                  {Chosen
                    ? <Chosen size={16} strokeWidth={1.8} className="text-amber-500" aria-hidden />
                    : item.spot
                      ? <MapPin size={15} className="text-amber-500" aria-hidden />
                      : <Star size={16} className="fill-amber-400 text-amber-500" aria-hidden />}
                </span>
                {/* Hold the NAME to rename — Ed's own division of the row.
                    The hold lived on the whole <li> before, so holding the
                    padding, or the gap beside the unpin buttons, opened a
                    rename nobody asked for. */}
                <span {...hold} className="mm-sidebar-link-label flex-1 truncate pr-12">{item.label}</span>
              </Link>
              <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={onMove}
                  aria-label={`Move ${item.label} to topbar`}
                  title="Move to topbar"
                  className="grid size-5 shrink-0 place-items-center rounded text-black/30 transition hover:bg-black/10 hover:text-black/70"
                >
                  <PanelTop size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  aria-label={`Unpin ${item.label}`}
                  title="Unpin"
                  className="grid size-5 shrink-0 place-items-center rounded text-black/30 transition hover:bg-black/10 hover:text-black/70"
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
              {picking ? (
                <SavedTabIconPicker
                  current={tab.icon}
                  currentTone={tab.tone}
                  anchor={iconRef.current}
                  onPick={onIcon}
                  onPickTone={onTone}
                  onClose={() => setPicking(false)}
                />
              ) : null}
              {renaming ? (
                <div className="absolute inset-x-1 top-1/2 z-[70] -translate-y-1/2 rounded-md bg-white p-1 shadow">
                  <RenameBox initial={item.label} onDone={value => { onRename(value); setRenaming(false); }} onCancel={() => setRenaming(false)} />
                </div>
              ) : null}
    </li>
  );
}
