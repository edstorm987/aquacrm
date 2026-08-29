"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, MoreHorizontal, Pencil, X } from "lucide-react";

import {
  MAX_TOPBAR_CONTROLS,
  normaliseTopbarControls,
  type TopbarControlId,
} from "@/lib/chrome/topbarControls";

// The topbar's secondary controls, collapsed on a phone.
//
// Ed, 2026-08-27: *"mobile topbar too many icons maybe we make the icons in
// mobile like a carousel or something so we swipe to get access to more or
// something or maybe a topbar extension button."*
//
// ── Why a "more" button and not a carousel ───────────────────────────────
//
// A swipeable strip was the other option and it loses on two counts. A
// horizontally scrolling toolbar gives no indication that anything is off the
// edge — the controls that scroll away are simply gone as far as most people
// are concerned — and it cannot be reached from a keyboard in any sensible
// order. An overflow button is the boring, understood pattern: everything is
// one predictable tap away, in a list, in the same order every time.
//
// ── Why the badge count is aggregated ────────────────────────────────────
//
// The failure mode of any overflow is hiding something that needed attention.
// Nineteen unread dev findings behind a "…" is worse than a crowded topbar,
// because a crowded topbar at least tells the truth. So the collapsed group is
// watched for `.mm-attention-badge` — the shared class the notification and dev
// console buttons already use — and their numbers are summed onto the toggle.
// Nothing with a badge can hide silently. A control somebody has promoted onto
// the bar is showing its own badge in plain sight, so it is deliberately no
// longer summed here: it is not hidden, and counting it twice would be a lie in
// the other direction.
//
// ── Why ONE copy of each control ─────────────────────────────────────────
//
// The obvious implementation renders the controls twice (inline for desktop,
// again inside the panel for mobile) and hides one with CSS. That duplicates
// every id, every popover, and every piece of state those controls own — two
// notification bells, two open panels. So each control is rendered exactly
// once, in whichever place it belongs. That rule survived the pinning work
// below: a promoted control is not a copy, it is the same control somewhere
// else.
//
// ── Why the panel closes itself ──────────────────────────────────────────
//
// Ed, 2026-08-29, with a phone screenshot: the Dev Console open on
// `/portal/agency/operations` with the privacy eye, Radar and the notification
// bell floating across its header. Two surfaces were on screen at once, and
// the panel's icons won the paint order because several of them carry a
// higher z-index than the surface (the privacy eye is `z-[70]`, workspace
// search is `z-50`).
//
// The panel is what has to give way: a menu closes when you choose from it.
// It cannot close by leaving the layout, though — every one of those surfaces
// is a DOM descendant of this container — so `data-open="no"` hides it with
// `visibility` and the surface re-declares itself visible. See the
// `.mm-topbar-overflow-items` block in globals.css.
//
// Closing is driven from two places because the controls come in two shapes.
// A control that OPENS something is caught by the observer below, which is the
// case that matters and the only one that can be detected after the fact. A
// control that just DOES something — the colour-mode toggle, the privacy eye —
// never mounts a surface, so the click handler covers it; that is also plain
// menu behaviour, and it is scoped to clicks that did not come from inside an
// already-open surface so tapping about inside one cannot reopen the panel.
//
// ── Keeping a control on the bar ─────────────────────────────────────────
//
// Ed, 2026-08-29: *"it would be useful if I can bring some of them to the
// topbar and out of the drawer so if I really need something it can be one
// click away and I think the space would allow for two slots on mobile."*
//
// Arranging is initiated by a PENCIL, and imitates what the sidebar already
// does — Ed, on being asked: *"the pencil icon ... initiates"* that. See the
// arrange block further down for why it borrows `SidebarReorder`'s model but
// not its mechanism.
//
// Two things make it work, and the second is the one that is easy to skip:
//
//   1. A pinned control renders in the row instead of in the panel. The pin is
//      an id on the ACCOUNT (`UserChromeLayout.topbarControls`), read on the
//      server by `Topbar`, so the first paint is already the arranged bar
//      rather than a default that rearranges itself after hydration.
//
//   2. The bar CHECKS whether it fits. Measured on 2026-08-29 at 320/360/390/
//      430 CSS px: the row's own demand is 180px on the left (menu, back, the
//      page-pin pair) and 92px on the right, plus 30px of padding and gaps,
//      against a slot costing 48px. So two slots need about 398px and one
//      needs about 350px — and a session that also carries the "Back to
//      website" exit link needs 48px more than that again. A fixed breakpoint
//      would be wrong for half the sessions, so the bar watches whether the
//      left cluster is being squeezed and holds a slot back when it is. A pin
//      that cannot be shown here is still STORED: the same account opens on a
//      bigger screen, where it can.
//
// `order` restores the authored sequence, but only above the breakpoint. The
// pin is stored per person rather than per device, so without it a phone pin
// would silently resequence the same person's desktop topbar — above `sm`
// every collapsible control is a flex item of the same row whichever container
// it renders in. Below `sm` it is deliberately NOT applied: promoted controls
// render before the drawer in the DOM, which is already the reading order, and
// an `order` there sorted them past the exit link and the account menu.

/** Marks a surface a topbar control has opened. Kept in one place because the
 *  CSS above and the observer below have to agree on it. */
export const CHROME_SURFACE_ATTRIBUTE = "data-chrome-surface";

export interface TopbarControl {
  /** Stored contract. Never changes — see `lib/chrome/topbarControls.ts`. */
  id: TopbarControlId;
  /** How the pin sheet names it. Free to change with the copy. */
  label: string;
  node: React.ReactNode;
}

const ENDPOINT = "/api/portal/chrome/layout";

/** What one promoted control costs the row, including its gap. */
const SLOT_WIDTH = 48;

export function TopbarOverflow({
  controls,
  pinned: storedPins = [],
}: {
  controls: TopbarControl[];
  pinned?: TopbarControlId[];
}) {
  const [open, setOpen] = useState(false);
  const [attention, setAttention] = useState(0);
  /** Arrange mode — see the block below the measurement for what it is and why. */
  const [arranging, setArranging] = useState(false);
  const [dragging, setDragging] = useState<TopbarControlId | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dragOrigin = useRef<{ x: number; y: number; id: TopbarControlId; moved: boolean } | null>(null);
  const [pinned, setPinned] = useState<TopbarControlId[]>(() => normaliseTopbarControls(storedPins));
  /** How many pinned controls the row can actually carry right now. */
  const [slots, setSlots] = useState(() => normaliseTopbarControls(storedPins).length);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<HTMLDivElement | null>(null);

  // The server answered this for the first paint; a later navigation can bring
  // a fresher answer (pinned in another tab), and adopting it keeps the bar
  // honest without a reload.
  const storedKey = storedPins.join(",");
  useEffect(() => {
    setPinned(normaliseTopbarControls(storedKey ? (storedKey.split(",") as TopbarControlId[]) : []));
  }, [storedKey]);

  const available = useMemo(() => new Set(controls.map(control => control.id)), [controls]);
  // A pin for a control this session does not have — Radar for a showcase
  // visitor, the Dev Console for a non-founder — holds no slot open.
  const wanted = useMemo(() => pinned.filter(id => available.has(id)), [pinned, available]);
  const promotedIds = useMemo(() => new Set(wanted.slice(0, slots)), [wanted, slots]);

  const promoted = controls.filter(control => promotedIds.has(control.id));
  const collapsed = controls.filter(control => !promotedIds.has(control.id));

  // Does the row still fit?
  //
  // The left cluster is what flex squeezes when the bar runs out of room, so
  // the slack it has is the signal. That slack is measured as the difference
  // between the width the cluster was GRANTED and the width its children
  // actually need — not as `scrollWidth - clientWidth`, which was the first
  // attempt and is one-sided: a flex container's scrollWidth never drops below
  // its clientWidth, so it can report a squeeze but never spare room. Slots
  // could then only ever shrink, and a phone turned to landscape kept showing
  // the one control it had settled on in portrait.
  //
  // The children do not shrink (they are `shrink-0`), so their combined width
  // is stable whether or not the row is over-subscribed, which is what makes
  // this readable in both directions.
  //
  // The answer is COMPUTED, never stepped towards. An earlier version nudged
  // the count by one per measurement, and two measurements firing before the
  // browser had reflowed both read the same stale squeeze and demoted twice.
  // Adding back what the promoted controls already occupy gives the room the
  // row would have with none of them — a fixed quantity that does not depend
  // on the current answer, so it converges in one pass and cannot oscillate.
  const wantedCount = wanted.length;
  const promotedCount = promoted.length;
  useEffect(() => {
    const lead = document.querySelector<HTMLElement>("[data-topbar-lead]");
    if (!lead) return;
    const measure = () => {
      // Frozen while arranging. The promoted controls have moved into the sheet,
      // so the row is temporarily empty and would report room for everything —
      // and the sheet would then offer a capacity the closed bar cannot keep.
      if (arranging) return;
      // Above the breakpoint every control is inline anyway: nothing to hold back.
      if (!window.matchMedia("(max-width: 639px)").matches) {
        setSlots(MAX_TOPBAR_CONTROLS);
        return;
      }
      const gap = Number.parseFloat(window.getComputedStyle(lead).columnGap) || 0;
      const kids = [...lead.children].filter(child => (child as HTMLElement).offsetWidth > 0);
      const needed = kids.reduce((total, child) => total + (child as HTMLElement).offsetWidth, 0)
        + gap * Math.max(0, kids.length - 1);
      const room = promotedCount * SLOT_WIDTH + (lead.clientWidth - needed);
      const fits = Math.max(0, Math.floor(room / SLOT_WIDTH));
      setSlots(Math.min(MAX_TOPBAR_CONTROLS, wantedCount, fits));
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(lead);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [wantedCount, promotedCount, arranging]);

  // Sum whatever the hidden controls are trying to say, and step aside the
  // moment one of them opens a surface. Both are re-checked on any DOM change
  // beneath the panel: badges arrive from live data long after first paint,
  // and a surface mounts on a tap.
  useEffect(() => {
    const items = itemsRef.current;
    if (!items) return;
    const sync = () => {
      let total = 0;
      let marks = 0;
      for (const badge of items.querySelectorAll(".mm-attention-badge")) {
        marks += 1;
        const parsed = Number.parseInt((badge.textContent ?? "").trim(), 10);
        if (Number.isFinite(parsed)) total += parsed;
      }
      // A badge with no number (a plain dot) still counts as something worth
      // surfacing, so fall back to the number of marks rather than showing 0.
      setAttention(total || marks);

      if (items.querySelector(`[${CHROME_SURFACE_ATTRIBUTE}]`)) setOpen(false);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(items, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setArranging(false);
  }, []);

  // The controls that open nothing. Capture phase so the panel is already on
  // its way out by the time the control's own handler runs.
  //
  // Three things inside the panel are NOT a menu choice and must not close it:
  // a click inside a surface the panel is deliberately outliving, anything in
  // the edit row (the row that arranges the menu is part of the menu — closing
  // on it made "Keep on the bar" shut the drawer before a single pin could be
  // pressed), and a pin toggle, which is a tap ABOUT a control rather than a
  // tap on it.
  const onItemsClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (arranging) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(`[${CHROME_SURFACE_ATTRIBUTE}]`)) return;
    if (target?.closest(".mm-topbar-overflow-edit, .mm-topbar-pin-toggle")) return;
    setOpen(false);
  }, [arranging]);

  const persist = useCallback((next: TopbarControlId[]) => {
    // Optimistic, and only this field is sent. The layout route treats an
    // absent field as "leave it alone", so this cannot clear the sidebar
    // arrangement or somebody's saved tabs — see the note on its PUT handler.
    void fetch(ENDPOINT, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topbarControls: next }),
    }).catch(() => { /* best-effort: a reload shows what the server still holds */ });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const atCap = wanted.length >= MAX_TOPBAR_CONTROLS;

  // ── Arranging ───────────────────────────────────────────────────────────
  //
  // Ed, 2026-08-29: *"why don't we just have a pencil icon when pressed allows
  // us to move things around instead"*, and then: the pencil *initiates* what
  // the sidebar already does. So this imitates `SidebarReorder`'s model — enter
  // a mode, drag things into the order you want, with a keyboard path and a
  // live region — and deliberately not its mechanism.
  //
  // `SidebarReorder` uses HTML5 drag and drop, whose own note records that it
  // is mouse-only. That is survivable for a sidebar somebody mostly arranges at
  // a desk; it is fatal here, because arranging the phone bar IS the feature.
  // `dragstart` never fires from a finger. So the drag below is built on
  // pointer events, which are the same for a mouse, a finger and a pen.
  //
  // While arranging, BOTH zones live inside the sheet — promoted controls move
  // into the "On the bar" strip rather than staying up in the real bar. Two
  // reasons: a control is rendered exactly once, so it cannot be in both; and
  // making the row grow and shrink under your finger while you drag into it
  // fights the width measurement above. You arrange in the sheet, and it
  // applies when you close it.

  /** Put a control on the bar, or back in the menu, and say so. */
  const moveControl = useCallback((id: TopbarControlId, toBar: boolean) => {
    const control = controls.find(entry => entry.id === id);
    const current = pinned;
    if (toBar && current.includes(id)) return;
    if (!toBar && !current.includes(id)) return;
    const next = toBar ? normaliseTopbarControls([...current, id]) : current.filter(entry => entry !== id);
    // At the cap, taking another is refused rather than silently evicting the
    // one already there — which one would it drop?
    if (toBar && !next.includes(id)) {
      setAnnouncement(`The bar is full. Take one off before adding ${control?.label ?? id}.`);
      return;
    }
    setPinned(next);
    // Only outside arrange mode. There, a tap should show the control at once;
    // in the sheet the capacity is deliberately frozen at what the CLOSED bar
    // can carry, and bumping it here would make the "no room" note disappear
    // exactly when it is true.
    if (!arranging) setSlots(count => Math.min(MAX_TOPBAR_CONTROLS, Math.max(count, next.length)));
    persist(next);
    // Said out loud: the control moving between two zones is invisible to a
    // screen reader, exactly as a sidebar row moving is.
    setAnnouncement(
      toBar
        ? `${control?.label ?? id} moved to the bar, ${next.length} of ${MAX_TOPBAR_CONTROLS}.`
        : `${control?.label ?? id} moved back to the More menu.`,
    );
  }, [arranging, controls, pinned, persist]);

  /** Swap the two bar positions. With a cap of two, a drop onto the other is a swap. */
  const swapOnBar = useCallback((id: TopbarControlId) => {
    const current = pinned;
    if (current.length < 2 || !current.includes(id)) return;
    const next = [...current].reverse();
    setPinned(next);
    persist(next);
    const control = controls.find(entry => entry.id === id);
    setAnnouncement(`${control?.label ?? id}, position ${next.indexOf(id) + 1} of ${next.length} on the bar.`);
  }, [controls, pinned, persist, setPinned]);

  const endDrag = useCallback((event: React.PointerEvent) => {
    const start = dragOrigin.current;
    dragOrigin.current = null;
    setDragging(null);
    setGhost(null);
    if (!start) return;
    // A press that never moved is a TAP, and a tap moves the control to the
    // other zone. That is the fast path, and it is what keyboard activation
    // does too — so arranging is never drag-only.
    if (!start.moved) {
      moveControl(start.id, !pinned.includes(start.id));
      return;
    }
    // The ghost is `pointer-events: none`, so this hit-tests what is underneath.
    const under = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const zone = under?.closest<HTMLElement>("[data-arrange-zone]")?.dataset.arrangeZone;
    if (!zone) return;
    const onto = under?.closest<HTMLElement>("[data-topbar-control]")?.dataset.topbarControl;
    if (zone === "bar") {
      if (pinned.includes(start.id)) {
        if (onto && onto !== start.id) swapOnBar(start.id);
      } else {
        moveControl(start.id, true);
      }
    } else if (zone === "menu") {
      moveControl(start.id, false);
    }
  }, [moveControl, pinned, swapOnBar]);

  const startDrag = useCallback((event: React.PointerEvent, id: TopbarControlId) => {
    dragOrigin.current = { x: event.clientX, y: event.clientY, id, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }, []);

  const moveDrag = useCallback((event: React.PointerEvent) => {
    const start = dragOrigin.current;
    if (!start) return;
    // A few pixels of slop, so a tap with a slightly unsteady finger is still a
    // tap rather than a one-pixel drag that lands nowhere.
    if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;
    start.moved = true;
    setDragging(start.id);
    setGhost({ x: event.clientX, y: event.clientY });
  }, []);

  /**
   * Alt+Arrow moves the focused control, the same shortcut and for the same
   * reason as the sidebar: bare arrows are how somebody scrolls a menu and how
   * assistive technology walks it, and stealing them would break reading the
   * menu in order to allow rearranging it.
   */
  const onArrangeKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!arranging || !event.altKey) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const id = (event.target as HTMLElement | null)
      ?.closest<HTMLElement>("[data-topbar-control]")?.dataset.topbarControl as TopbarControlId | undefined;
    if (!id) return;
    event.preventDefault();
    moveControl(id, event.key === "ArrowUp");
  }, [arranging, moveControl]);

  // The authored position, handed to CSS rather than applied here. `order` is
  // wanted only above the breakpoint, where it restores the desktop sequence;
  // applied on a phone it sorts the promoted controls past the exit link and
  // the account menu, which is where the Dev Console first landed. See
  // `.mm-topbar-control` in globals.css.
  const orderStyle = (id: TopbarControlId) =>
    ({ "--mm-control-order": controls.findIndex(entry => entry.id === id) } as React.CSSProperties);

  /**
   * The drag handle, which covers its control.
   *
   * Covering it rather than sitting beside it is not a style choice: these are
   * 44px touch targets with no room for a second one inside, and Playwright
   * caught the first attempt — a corner chip — losing its taps to the Dev
   * Console's own hammer underneath. Covering also means arranging can never
   * fire the control it is arranging.
   */
  const grip = (control: TopbarControl, onBar: boolean) => (
    <button
      type="button"
      className="mm-topbar-arrange-grip"
      data-on-bar={onBar ? "yes" : "no"}
      onPointerDown={event => startDrag(event, control.id)}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={() => { dragOrigin.current = null; setDragging(null); setGhost(null); }}
      onClick={event => event.preventDefault()}
      aria-label={
        onBar
          ? `${control.label}, on the bar. Drag to move, or press to put it back in the More menu.`
          : atCap
            ? `${control.label}, in the More menu. The bar is full — take one off first.`
            : `${control.label}, in the More menu. Drag to move, or press to keep it on the bar.`
      }
    >
      <GripVertical size={11} aria-hidden="true" />
    </button>
  );

  return (
    <>
      {/* Promoted controls sit before the drawer in the DOM. Above the
          breakpoint `order` puts every control back in its authored place, so
          a pin made on a phone cannot reorder the same person's desktop bar. */}
      {(arranging ? [] : promoted).map(control => (
        <span
          key={control.id}
          className="mm-topbar-control mm-topbar-control-promoted"
          data-topbar-control={control.id}
          style={orderStyle(control.id)}
        >
          {control.node}
        </span>
      ))}

      <div
        ref={wrapRef}
        className="mm-topbar-overflow"
        data-open={open ? "yes" : "no"}
        data-arranging={arranging ? "yes" : "no"}
      >
        <button
          type="button"
          onClick={() => { setOpen(value => !value); setArranging(false); }}
          aria-expanded={open}
          aria-label={
            attention > 0
              ? `More controls, ${attention} needing attention`
              : "More controls"
          }
          className="mm-topbar-overflow-toggle relative inline-flex size-9 items-center justify-center rounded-md border border-black/10 bg-white/60 text-black/60 transition hover:bg-white hover:text-black"
        >
          {open ? <X size={16} /> : <MoreHorizontal size={16} />}
          {!open && attention > 0 ? (
            <span
              className="mm-attention-badge absolute -right-1.5 -top-1.5 z-10 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-white"
              aria-hidden="true"
            >
              {attention > 99 ? "99+" : attention}
            </span>
          ) : null}
        </button>

        <div
          ref={itemsRef}
          className="mm-topbar-overflow-items"
          onClickCapture={onItemsClickCapture}
          onKeyDown={onArrangeKeyDown}
        >
          {/* While arranging, the sheet shows both zones: what is on the bar,
              and what is in the menu. Controls are dragged between them, and a
              drop onto the other bar position swaps the two. */}
          {arranging ? (
            <div className="mm-topbar-arrange" data-arrange-zone="bar">
              <p className="mm-topbar-arrange-label">On the bar</p>
              {/* Everything CHOSEN, not everything that fits. A pin the row has
                  no space for still belongs on the bar as far as the account is
                  concerned — it comes back on a wider screen — so hiding it here
                  would look like the tap had failed. It is marked instead. */}
              <div className="mm-topbar-arrange-slots">
                {wanted.map((id, index) => {
                  const control = controls.find(entry => entry.id === id);
                  if (!control) return null;
                  return (
                    <span
                      key={control.id}
                      className="mm-topbar-control"
                      data-topbar-control={control.id}
                      data-dragging={dragging === control.id ? "yes" : undefined}
                      data-waiting={index >= slots ? "yes" : undefined}
                    >
                      {control.node}
                      {grip(control, true)}
                    </span>
                  );
                })}
                {wanted.length < MAX_TOPBAR_CONTROLS ? (
                  <span className="mm-topbar-arrange-empty" aria-hidden="true">
                    {wanted.length ? "" : "Drag one here"}
                  </span>
                ) : null}
              </div>
              {wanted.length > slots ? (
                <p className="mm-topbar-arrange-note">
                  {wanted.length - slots === 1 ? "The faded one has" : `${wanted.length - slots} have`} no room at this
                  width — kept for a wider screen.
                </p>
              ) : null}
              <p className="mm-topbar-arrange-label">In the More menu</p>
            </div>
          ) : null}

          <div
            className={arranging ? "mm-topbar-arrange-menu" : "contents"}
            data-arrange-zone={arranging ? "menu" : undefined}
          >
            {(arranging ? controls.filter(control => !wanted.includes(control.id)) : collapsed).map(control => (
              <span
                key={control.id}
                className="mm-topbar-control"
                data-topbar-control={control.id}
                data-dragging={dragging === control.id ? "yes" : undefined}
                style={arranging ? undefined : orderStyle(control.id)}
              >
                {control.node}
                {arranging ? grip(control, false) : null}
              </span>
            ))}
          </div>
          {/* The edit row, inside the panel so it is part of the same surface,
              and last in DOM order so it never takes the first tab stop from
              the controls people actually opened the menu for. */}
          <div className="mm-topbar-overflow-edit">
            <button
              type="button"
              onClick={() => setArranging(value => !value)}
              aria-pressed={arranging}
              className="mm-topbar-overflow-edit-toggle"
              aria-label={arranging ? "Finish arranging" : "Arrange which controls sit on the bar"}
            >
              {arranging ? <><X size={11} aria-hidden="true" />Done</> : <Pencil size={12} aria-hidden="true" />}
            </button>
            <span className="mm-topbar-overflow-edit-count">
              {arranging ? "Drag a control between the two, or press one to move it" : `${wanted.length}/${MAX_TOPBAR_CONTROLS} on the bar`}
            </span>
          </div>
        </div>

        {/* The thing under the finger. `pointer-events: none` so the drop
            hit-test reads what is beneath it rather than the ghost itself. */}
        {ghost && dragging ? (
          <span className="mm-topbar-arrange-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true" />
        ) : null}
        <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
      </div>
    </>
  );
}
