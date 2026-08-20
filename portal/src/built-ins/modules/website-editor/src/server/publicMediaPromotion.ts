// Public media promotion — the publish-time walker.
//
// On publish (see `publishPage`), approved website media that the editor
// stored inline as `data:` URIs is pushed to the public CDN bucket and the
// block tree is rewritten to reference the durable public URL instead. This
// is the "auto-public on publish" gate: draft blocks keep their inline data
// URLs (nothing public by default); only the published copy is promoted.
//
// Pure + injectable: the caller supplies a `promote(dataUrl) => publicUrl`
// function (backed by the `publicMedia` foundation port). Identical data URLs
// promote once (dedup), and a promotion failure is fail-open — the original
// data URL is kept so a storage hiccup never blocks a publish.

import type { Block } from "../types/block";

export type MediaPromoter = (dataUrl: string) => Promise<string>;

export interface PromotionResult {
  blocks: Block[];
  /** Count of distinct data URLs successfully promoted to public URLs. */
  promoted: number;
}

function isPromotableDataUrl(value: unknown): value is string {
  return typeof value === "string"
    && (value.startsWith("data:image/") || value.startsWith("data:video/"));
}

export async function promoteBlockTreeMedia(
  blocks: Block[],
  promote: MediaPromoter,
): Promise<PromotionResult> {
  const cache = new Map<string, string>();
  let promoted = 0;

  const resolve = async (dataUrl: string): Promise<string> => {
    const cached = cache.get(dataUrl);
    if (cached !== undefined) return cached;
    let url = dataUrl;
    try {
      url = await promote(dataUrl);
      promoted += 1;
    } catch {
      // Fail-open: keep the inline data URL so publish still succeeds.
      url = dataUrl;
    }
    cache.set(dataUrl, url);
    return url;
  };

  // Rewrites any string prop whose value is a promotable data URL. Returns the
  // same object reference when nothing changed (so callers can skip rebuilds).
  const promoteProps = async (
    props: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    let next = props;
    for (const [key, value] of Object.entries(props)) {
      if (isPromotableDataUrl(value)) {
        const url = await resolve(value);
        if (url !== value) {
          if (next === props) next = { ...props };
          next[key] = url;
        }
      }
    }
    return next;
  };

  const promoteBlock = async (block: Block): Promise<Block> => {
    const origProps = block.props ?? {};
    const props = await promoteProps(origProps);

    let variantsByGroup = block.variantsByGroup;
    if (block.variantsByGroup) {
      const nextGroups: NonNullable<Block["variantsByGroup"]> = {};
      let changed = false;
      for (const [group, variants] of Object.entries(block.variantsByGroup)) {
        const nextVariants = [];
        for (const variant of variants) {
          if (variant.props) {
            const vp = await promoteProps(variant.props);
            if (vp !== variant.props) {
              changed = true;
              nextVariants.push({ ...variant, props: vp });
              continue;
            }
          }
          nextVariants.push(variant);
        }
        nextGroups[group] = nextVariants;
      }
      if (changed) variantsByGroup = nextGroups;
    }

    let children = block.children;
    if (block.children && block.children.length > 0) {
      const nextChildren: Block[] = [];
      let changed = false;
      for (const child of block.children) {
        const promotedChild = await promoteBlock(child);
        if (promotedChild !== child) changed = true;
        nextChildren.push(promotedChild);
      }
      if (changed) children = nextChildren;
    }

    if (props === origProps
      && variantsByGroup === block.variantsByGroup
      && children === block.children) {
      return block;
    }
    return { ...block, props, variantsByGroup, children };
  };

  let changed = false;
  const out: Block[] = [];
  for (const block of blocks) {
    const next = await promoteBlock(block);
    if (next !== block) changed = true;
    out.push(next);
  }
  return { blocks: changed ? out : blocks, promoted };
}
