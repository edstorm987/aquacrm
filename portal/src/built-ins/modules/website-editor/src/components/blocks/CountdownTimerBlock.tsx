"use client";

// Countdown timer — tick down to a target date. Useful for sales,
// launches, "ends in" urgency banners. ISO target prop or relative
// "+N days" syntax. Days/hours/minutes/seconds shown by default;
// renders nothing once expired (operator can hide / show fallback).

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

function parseTarget(input: string): number {
  const trimmed = input.trim();
  // Relative: "+7d" / "+24h" / "+30m"
  const rel = /^\+(\d+)([dhm])$/.exec(trimmed);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const ms = unit === "d" ? n * 86_400_000 : unit === "h" ? n * 3_600_000 : n * 60_000;
    return Date.now() + ms;
  }
  const t = Date.parse(trimmed);
  return Number.isFinite(t) ? t : Date.now() + 86_400_000;
}

function pad(n: number): string { return n.toString().padStart(2, "0"); }

export default function CountdownTimerBlock({ block }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Sale ends in";
  const target = (block.props.target as string | undefined) ?? "+7d";
  const expiredText = (block.props.expiredText as string | undefined) ?? "Sale has ended.";
  const showSeconds = (block.props.showSeconds as boolean | undefined) ?? true;

  const targetMs = parseTarget(target);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, targetMs - now);
  const expired = diff === 0;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);

  return (
    <section data-block-type="countdown-timer" style={{ padding: "32px 24px", textAlign: "center", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {heading && <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2, opacity: 0.65, marginBottom: 12 }}>{heading}</p>}
        {expired ? (
          <p style={{ fontSize: 18 }}>{expiredText}</p>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <Cell label="Days"   value={pad(days)} />
            <Cell label="Hours"  value={pad(hours)} />
            <Cell label="Mins"   value={pad(mins)} />
            {showSeconds && <Cell label="Secs" value={pad(secs)} />}
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
