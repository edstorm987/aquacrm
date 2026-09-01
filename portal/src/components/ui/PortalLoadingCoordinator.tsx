"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const LOADER_REVEAL_DELAY_MS = 110;
const CURTAIN_DURATION_MS = 460;

type PortalLoadingCoordinatorProps = {
  children: ReactNode;
  scope?: "route" | "workspace";
};

/**
 * Adds the loader's exit handover without delaying fast navigations.
 *
 * Next removes loading.tsx as soon as its content is ready, so CSS on the
 * fallback cannot animate that unmount. This tiny persistent observer remembers
 * whether its *own* loader was visible, then briefly draws two palette-matched
 * curtains that split apart over the newly committed page. Nested coordinators
 * are ignored so route loads never trigger the workspace-level curtain too.
 */
export function PortalLoadingCoordinator({
  children,
  scope = "route",
}: PortalLoadingCoordinatorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const loaderStartedAtRef = useRef<number | null>(null);
  const loaderWatchTimerRef = useRef<number | null>(null);
  const curtainTimerRef = useRef<number | null>(null);
  const unveilingRef = useRef(false);
  const [unveiling, setUnveiling] = useState(false);
  const [handoverComplete, setHandoverComplete] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cancelCurtain = () => {
      if (curtainTimerRef.current !== null) window.clearTimeout(curtainTimerRef.current);
      curtainTimerRef.current = null;
      unveilingRef.current = false;
      setUnveiling(false);
    };

    const cancelLoaderWatch = () => {
      if (loaderWatchTimerRef.current !== null) window.clearTimeout(loaderWatchTimerRef.current);
      loaderWatchTimerRef.current = null;
    };

    const ownLoader = () => Array.from(root.querySelectorAll<HTMLElement>("[data-aqua-viewport-loader]"))
      .find(loader => loader.closest<HTMLElement>("[data-aqua-loading-coordinator]") === root) ?? null;

    const inspect = () => {
      const loader = ownLoader();
      if (loader) {
        setHandoverComplete(false);
        if (loaderStartedAtRef.current === null) {
          const alreadyVisible = Number.parseFloat(window.getComputedStyle(loader).opacity) > 0;
          loaderStartedAtRef.current = performance.now() - (alreadyVisible ? LOADER_REVEAL_DELAY_MS : 0);
        }
        if (curtainTimerRef.current !== null || unveilingRef.current) cancelCurtain();
        // A warm client boot can replace its fallback in the same React commit
        // that hydrates this coordinator. MutationObserver normally catches
        // that removal, but a short, bounded watch while a loader exists makes
        // the handoff deterministic even across that hydration race.
        if (loaderWatchTimerRef.current === null) {
          loaderWatchTimerRef.current = window.setTimeout(() => {
            loaderWatchTimerRef.current = null;
            inspect();
          }, 40);
        }
        return;
      }

      cancelLoaderWatch();

      const startedAt = loaderStartedAtRef.current;
      if (startedAt === null) return;
      loaderStartedAtRef.current = null;
      if (performance.now() - startedAt < LOADER_REVEAL_DELAY_MS) return;

      unveilingRef.current = true;
      setUnveiling(true);
      curtainTimerRef.current = window.setTimeout(() => {
        curtainTimerRef.current = null;
        unveilingRef.current = false;
        setUnveiling(false);
        setHandoverComplete(true);
      }, CURTAIN_DURATION_MS);
    };

    inspect();
    const mutationContainsLoader = (node: Node) => node instanceof Element
      && (node.matches("[data-aqua-viewport-loader]") || Boolean(node.querySelector("[data-aqua-viewport-loader]")));
    const observer = new MutationObserver(records => {
      const loaderChanged = records.some(record =>
        [...record.addedNodes, ...record.removedNodes].some(mutationContainsLoader));
      if (loaderChanged) inspect();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelLoaderWatch();
      if (curtainTimerRef.current !== null) window.clearTimeout(curtainTimerRef.current);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="contents"
      data-aqua-loading-coordinator
      data-aqua-loading-handover={handoverComplete ? "complete" : undefined}
      data-loading-scope={scope}
    >
      {children}
      {unveiling ? (
        <div className="aqua-loading-curtain" data-loading-scope={scope} data-testid="aqua-loading-curtain" aria-hidden="true">
          <span className="aqua-loading-curtain__half aqua-loading-curtain__half--left" />
          <span className="aqua-loading-curtain__half aqua-loading-curtain__half--right" />
        </div>
      ) : null}
    </div>
  );
}
