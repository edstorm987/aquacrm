"use client";

import { useId, useState } from "react";

import type { EvidenceSeries } from "@/lib/inbox/resolutionEvidence";

/**
 * A metric against its own baseline.
 *
 * One series, so no legend box — the caption names it. The median is a
 * reference line, not a second series: it is the thing being compared against,
 * and drawing it as an equal-weight line would imply two measures where there
 * is one.
 *
 * Status colour marks only the readings that are NOT passing, and never alone —
 * each carries a title and the reading is listed in the table beneath, so the
 * chart is not the only way to get the information.
 */
export function MetricSparkline({ series }: { series: EvidenceSeries }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const points = series.points;
  if (points.length < 2) return null;

  const values = points.map(point => point.value);
  const median = series.median;
  // Include the median in the extent so the reference line cannot fall off the
  // plot — a baseline you cannot see defeats the comparison.
  const candidates = median === undefined ? values : [...values, median];
  const rawMin = Math.min(...candidates);
  const rawMax = Math.max(...candidates);
  // A flat series would divide by zero and draw nothing; give it a band so the
  // line renders down the middle, which is the honest picture of "no change".
  const span = rawMax - rawMin || Math.max(Math.abs(rawMax) || 1, 1);
  const min = rawMin - span * 0.15;
  const max = rawMax + span * 0.15;

  const W = 600;
  const H = 120;
  const x = (index: number) => (index / (points.length - 1)) * W;
  const y = (value: number) => H - ((value - min) / (max - min)) * H;

  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const area = `${x(0)},${H} ${line} ${x(points.length - 1)},${H}`;
  const active = hover === null ? null : points[hover];

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[120px] w-full overflow-visible"
        role="img"
        aria-label={`${series.label} over the last ${points.length} readings${
          median !== undefined ? `, against a usual value of ${median}` : ""
        }`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".16" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* The baseline being compared against — recessive and dashed so it
            reads as context, not as a competing measure. */}
        {median !== undefined ? (
          <line
            x1="0" x2={W} y1={y(median)} y2={y(median)}
            stroke="currentColor" strokeOpacity=".28" strokeWidth="1"
            strokeDasharray="4 4" vectorEffect="non-scaling-stroke"
          />
        ) : null}

        <polygon points={area} fill={`url(#${gradientId})`} className="text-brand" />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          className="text-brand"
        />

        {points.map((point, index) => {
          const breach = point.status !== "pass";
          if (!breach && index !== points.length - 1) return null;
          return (
            <circle
              key={`${point.at}-${index}`}
              cx={x(index)}
              cy={y(point.value)}
              r={breach ? 5 : 3.5}
              className={breach ? "text-red-600" : "text-brand"}
              fill="currentColor"
            >
              <title>{`${new Date(point.at).toLocaleString("en-GB")} · ${point.value}${breach ? ` · ${point.status}` : ""}`}</title>
            </circle>
          );
        })}

        {/* Hit targets wider than the marks, so hovering is not a precision
            exercise on a 600-wide plot. */}
        {points.map((point, index) => (
          <rect
            key={`hit-${point.at}-${index}`}
            x={x(index) - W / points.length / 2}
            y={0}
            width={W / points.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}

        {hover !== null ? (
          <line
            x1={x(hover)} x2={x(hover)} y1="0" y2={H}
            stroke="currentColor" strokeOpacity=".25" strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      <figcaption className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-black/45">
        <span>
          {active
            ? `${new Date(active.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${active.value}`
            : `${points.length} readings${median !== undefined ? ` · usually ${median}` : ""}`}
        </span>
        {series.expectedDirection && series.expectedDirection !== "neutral" ? (
          <span>Better when {series.expectedDirection}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}
