"use client";

// Countdown timer — tick down to a target date. Useful for sales,
// launches, "ends in" urgency banners. ISO target prop or relative
// "+N days" syntax. Relative targets are anchored in the stored block when
// created/published, so ticks and reloads cannot move the finish line.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import {
  COUNTDOWN_DEADLINE_PROP,
  COUNTDOWN_RELATIVE_TARGET_PROP,
  countdownParts,
  resolveCountdownDeadline,
} from "@/engines/editor/elements/countdownDeadline";

function pad(n: number): string { return n.toString().padStart(2, "0"); }

export default function CountdownTimerBlock({ block }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Sale ends in";
  const target = (block.props.target as string | undefined) ?? "+7d";
  const expiredText = (block.props.expiredText as string | undefined) ?? "Sale has ended.";
  const showSeconds = (block.props.showSeconds as boolean | undefined) ?? true;

  const clockKey = `${target}\u0000${String(block.props[COUNTDOWN_RELATIVE_TARGET_PROP] ?? "")}\u0000${String(block.props[COUNTDOWN_DEADLINE_PROP] ?? "")}`;
  const [clock, setClock] = useState<{ key: string; now: number; fallbackAnchor: number } | null>(null);

  useEffect(() => {
    const startedAt = Date.now();
    setClock({ key: clockKey, now: startedAt, fallbackAnchor: startedAt });
    const id = setInterval(() => setClock(current => current?.key === clockKey
      ? { ...current, now: Date.now() }
      : current), 1000);
    return () => clearInterval(id);
  }, [clockKey]);

  const ready = clock?.key === clockKey;
  const deadline = ready ? resolveCountdownDeadline(target, block.props, clock.fallbackAnchor) : null;
  const remaining = ready ? countdownParts(deadline, clock.now) : null;

  return (
    <section data-block-type="countdown-timer" style={{ padding: "32px 24px", textAlign: "center", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {heading && <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2, opacity: 0.65, marginBottom: 12 }}>{heading}</p>}
        {!remaining ? (
          <div data-countdown-state="initialising" aria-label="Countdown loading" style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <Cell label="Days" value="--" />
            <Cell label="Hours" value="--" />
            <Cell label="Mins" value="--" />
            {showSeconds && <Cell label="Secs" value="--" />}
          </div>
        ) : remaining.expired ? (
          <p data-countdown-state="expired" aria-live="polite" style={{ fontSize: 18 }}>{expiredText}</p>
        ) : (
          <div data-countdown-state="active" style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <Cell label="Days"   value={pad(remaining.days)} />
            <Cell label="Hours"  value={pad(remaining.hours)} />
            <Cell label="Mins"   value={pad(remaining.mins)} />
            {showSeconds && <Cell label="Secs" value={pad(remaining.secs)} />}
          </div>
        )}
      </div>
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      minWidth: 80,
      padding: "12px 16px",
      borderRadius: 12,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <p style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 32, fontWeight: 700, lineHeight: 1, marginBottom: 4 }}>{value}</p>
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.55 }}>{label}</p>
    </div>
  );
}
