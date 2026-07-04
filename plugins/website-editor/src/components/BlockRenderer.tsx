"use client";

// Recursive renderer used by both the editor canvas and the host-side
// PortalPageRenderer. Looks up the block component in the registry and
// passes a renderChildren helper down so containers don't have to
// re-import the renderer.
//
// Faithful port of `02/src/components/editor/BlockRenderer.tsx`. The
// registry import resolves to the plugin's local `blockRegistry.ts`.

import { Fragment, useEffect } from "react";
import type { Block, SplitTestGroup } from "../types/block";
import { getBlockDefinition, getBlockRenderer } from "./blockRegistry";
import AnimateOnScroll from "./AnimateOnScroll";
import { overridesToCssText } from "./blockStyles";
import { applyVariant, recordExposure, resolveVariant } from "./variantResolver";

export interface BlockRendererProps {
  blocks: Block[] | undefined;
  editorMode?: boolean;
  themeId?: string;
  splitTestGroups?: SplitTestGroup[];
}

function BlockRenderer({ blocks, editorMode = false, themeId, splitTestGroups }: BlockRendererProps) {
  if (!blocks || blocks.length === 0) return null;
  return (
    <>
      {blocks.map(block => (
        <BlockNode
          key={block.id}
          block={block}
          editorMode={editorMode ?? false}
          themeId={themeId}
          splitTestGroups={splitTestGroups}
        />
      ))}
    </>
  );
}

function BlockNode({
  block: blockArg,
  editorMode,
  themeId,
  splitTestGroups,
}: {
  block: Block;
  editorMode: boolean;
  themeId?: string;
  splitTestGroups?: SplitTestGroup[];
}) {
  let block = blockArg;
  let variantId: string | null = null;
  let resolvedGroupId: string | null = null;
  if (!editorMode && block.variantsByGroup && splitTestGroups) {
    for (const groupId of Object.keys(block.variantsByGroup)) {
      const group = splitTestGroups.find(g => g.id === groupId && g.status === "running");
      if (!group) continue;
      const result = resolveVariant({
        block,
        groupId: group.id,
        trafficPercent: group.trafficPercent,
        stickyBy: group.stickyBy,
      });
      block = applyVariant(block, result.variant);
      variantId = result.variantId;
      resolvedGroupId = group.id;
      break;
    }
  }

  const themeOverlay = themeId ? block.themeStyles?.[themeId] : undefined;
  if (themeOverlay) {
    block = { ...block, styles: { ...(block.styles ?? {}), ...themeOverlay } };
  }
  // Resolve renderer: cross-plugin RENDERER_REGISTRATIONS map first
  // (covers external plugin blocks like ecommerce + memberships), then
  // fall back to BLOCK_REGISTRY (the native 58). Missing renderer →
  // visible warning in editor mode, silent fragment on live.
  const externalRenderer = getBlockRenderer(block.type);
  const def = getBlockDefinition(block.type);
  const Component = externalRenderer ?? def?.Component;
  if (!Component) {
    if (editorMode) {
      return (
        <div style={{ padding: 8, border: "1px dashed #ef4444", color: "#ef4444", fontSize: 12, borderRadius: 6 }}>
          Unknown block type: <code>{block.type}</code>
        </div>
      );
    }
    return null;
  }
  const componentNode = (
    <Component
      block={block}
      editorMode={editorMode}
      renderChildren={children => (
        <BlockRenderer
          blocks={children}
          editorMode={editorMode}
          themeId={themeId}
          splitTestGroups={splitTestGroups}
        />
      )}
    />
  );

  const a = block.a11y;
  const hasA11y = a && (a.ariaLabel || a.ariaLabelledBy || a.role || a.ariaHidden || a.htmlId || a.tabIndex !== undefined);
  const node = hasA11y ? (
    <div
      id={a!.htmlId || undefined}
      role={a!.role || undefined}
      aria-label={a!.ariaLabel || undefined}
      aria-labelledby={a!.ariaLabelledBy || undefined}
      aria-hidden={a!.ariaHidden ? true : undefined}
      tabIndex={a!.tabIndex}
      style={{ display: "contents" }}
    >
      {componentNode}
    </div>
  ) : componentNode;

  const tabletCss = !editorMode ? overridesToCssText(block.styles?.tablet) : "";
  const mobileCss = !editorMode ? overridesToCssText(block.styles?.mobile) : "";
  const needsScopedCss = tabletCss || mobileCss;

  let body: React.ReactNode = node;
  if (needsScopedCss) {
    const css = [
      tabletCss && `@media (max-width: 1024px) { [data-block-id="${block.id}"] { ${tabletCss} } }`,
      mobileCss && `@media (max-width: 640px) { [data-block-id="${block.id}"] { ${mobileCss} } }`,
    ].filter(Boolean).join("\n");
    body = (
      <div data-block-id={block.id} style={{ display: "contents" }}>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {node}
      </div>
    );
  }

  const animate = block.styles?.animate;
  if (animate && !editorMode) {
    body = (
      <AnimateOnScroll
        animate={animate}
        duration={block.styles?.animateDuration}
        delay={block.styles?.animateDelay}
        easing={block.styles?.animateEasing}
      >{body}</AnimateOnScroll>
    );
  }

  if (resolvedGroupId && variantId && !editorMode) {
    body = (
      <SplitTestExposure groupId={resolvedGroupId} variantId={variantId}>
        {body}
      </SplitTestExposure>
    );
  }

  return <Fragment>{body}</Fragment>;
}

function SplitTestExposure({ groupId, variantId, children }: { groupId: string; variantId: string; children: React.ReactNode }) {
  useEffect(() => {
    recordExposure(groupId, variantId);
  }, [groupId, variantId]);
  return <Fragment>{children}</Fragment>;
}

// Convenience tree wrapper preserving the Round-1 named-export contract
// the storefront PortalPageRenderer expects.
export function BlockTreeRenderer({ blocks, editorMode, themeId, splitTestGroups }: BlockRendererProps) {
  return (
    <BlockRenderer
      blocks={blocks}
      editorMode={editorMode}
      themeId={themeId}
      splitTestGroups={splitTestGroups}
    />
  );
}

export { BlockRenderer };
export default BlockRenderer;
