import type { Block, BlockTreeJSON, BlockType } from "./block";

export const COUNTDOWN_DEADLINE_PROP = "_countdownDeadlineAt";
export const COUNTDOWN_RELATIVE_TARGET_PROP = "_countdownRelativeTarget";

const UNIT_MS = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
} as const;

export function relativeCountdownDuration(target: string): number | null {
  const match = /^\+(\d+)([dhm])$/.exec(target.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_MS;
  const duration = amount * UNIT_MS[unit];
  return Number.isSafeInteger(amount) && Number.isSafeInteger(duration) ? duration : null;
}

export function resolveCountdownDeadline(
  target: string,
  props: Record<string, unknown>,
  fallbackAnchor?: number,
): number | null {
  const cleanTarget = target.trim();
  const duration = relativeCountdownDuration(cleanTarget);
  if (duration !== null) {
    const storedTarget = props[COUNTDOWN_RELATIVE_TARGET_PROP];
    const storedDeadline = props[COUNTDOWN_DEADLINE_PROP];
    if (storedTarget === cleanTarget && finiteTimestamp(storedDeadline)) return storedDeadline;
    return finiteTimestamp(fallbackAnchor) ? fallbackAnchor + duration : null;
  }
  if (!cleanTarget) return null;
  const absolute = Date.parse(cleanTarget);
  return Number.isFinite(absolute) ? absolute : null;
}

export function initialiseCountdownBlock(type: BlockType, props: Record<string, unknown>, now = Date.now()): Record<string, unknown> {
  if (type !== "countdown-timer") return props;
  return stabiliseCountdownProps(props, now);
}

export function stabiliseCountdownDeadlines(tree: BlockTreeJSON, now = Date.now()): BlockTreeJSON {
  const visit = (blocks: readonly Block[]): Block[] => {
    let changed = false;
    const next = blocks.map(block => {
      const props = block.type === "countdown-timer" ? stabiliseCountdownProps(block.props, now) : block.props;
      const children = block.children?.length ? visit(block.children) : block.children;
      if (props === block.props && children === block.children) return block;
      changed = true;
      return { ...block, props, children };
    });
    return changed ? next : blocks as Block[];
  };
  return visit(tree);
}

export function countdownParts(deadline: number | null, now: number): { expired: boolean; days: number; hours: number; mins: number; secs: number } {
  const diff = deadline === null ? 0 : Math.max(0, deadline - now);
  return {
    expired: diff === 0,
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    mins: Math.floor((diff % 3_600_000) / 60_000),
    secs: Math.floor((diff % 60_000) / 1_000),
  };
}

function stabiliseCountdownProps(props: Record<string, unknown>, now: number): Record<string, unknown> {
  const target = typeof props.target === "string" ? props.target.trim() : "";
  const duration = relativeCountdownDuration(target);
  if (duration === null) {
    if (!Object.prototype.hasOwnProperty.call(props, COUNTDOWN_RELATIVE_TARGET_PROP)
      && !Object.prototype.hasOwnProperty.call(props, COUNTDOWN_DEADLINE_PROP)) return props;
    const {
      [COUNTDOWN_RELATIVE_TARGET_PROP]: _relativeTarget,
      [COUNTDOWN_DEADLINE_PROP]: _deadline,
      ...rest
    } = props;
    return rest;
  }
  if (props[COUNTDOWN_RELATIVE_TARGET_PROP] === target && finiteTimestamp(props[COUNTDOWN_DEADLINE_PROP])) return props;
  return {
    ...props,
    [COUNTDOWN_RELATIVE_TARGET_PROP]: target,
    [COUNTDOWN_DEADLINE_PROP]: now + duration,
  };
}

function finiteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
