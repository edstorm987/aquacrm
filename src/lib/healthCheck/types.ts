// T4 R008 — HC type model. Mirrors the static `hc-questions.js`
// shape so `defaultPack.ts` can be a hand-port + future agency
// packs (Phase 12 R3) plug in unchanged.

export type HCStickyEmbed = {
  kind: "search" | "site";
  query?: string;
  editable?: boolean;
  placeholder?: string;
  queryFromUser?: boolean;
  timer?: number;
};

export type HCOption = {
  label: string;
  score: number;
  tag?: string;
};

type Base = {
  prompt?: string;
  title?: string;
  body?: string;
  optional?: boolean;
  scoring?: false;
  stickyEmbed?: HCStickyEmbed;
  embed?: HCStickyEmbed;
  // skipIf is serialised as a tiny DSL: { rawAt: number, neq?: number, eq?: number }
  skipIf?: { rawAt: number; neq?: number; eq?: number };
};

export type HCStep =
  | (Base & { type: "task"; done?: string })
  | (Base & { type: "reveal" })
  | (Base & { type: "choice"; options: HCOption[] })
  | (Base & { type: "multi"; options: HCOption[] })
  | (Base & { type: "slider"; min: number; max: number; value: number; suffix?: string })
  | (Base & { type: "text" })
  | (Base & { type: "url"; placeholder?: string })
  | (Base & { type: "lever-calc"; ltvDefault: number; enqDefault: number })
  | (Base & { type: "mental-note"; tag: string; label: string });

export type HCTier = {
  label: string;
  time: string;
  summary: string;
  exercise: HCStep[];
};

export type HCArea = {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  tiers: { beginner: HCTier; intermediate: HCTier; professional: HCTier };
};

export type HCPack = { areas: HCArea[] };

export type HCSlot = {
  tier: "beginner" | "intermediate" | "professional";
  raw: (number | number[] | string | null)[];
};
