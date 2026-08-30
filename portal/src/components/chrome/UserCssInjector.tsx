"use client";

import { useEffect, useState } from "react";

/**
 * The person's own stylesheet, finally actually applied.
 *
 * Found by Ed (2026-08-30): the Appearance panel saved custom CSS and NOTHING
 * ever injected it — the box was a diary. And the `?nocss=1` escape hatch the
 * panel's copy promised was only explanatory text.
 *
 * A client component rather than a server <style> for exactly one reason: the
 * escape hatch. A layout cannot read the query string, and the whole point of
 * `?nocss=1` is recovering from a stylesheet that broke the page — so the
 * check must live somewhere that CAN see the URL. CSS cannot break JS, so
 * this component still runs however bad the stylesheet is, and loading any
 * route with `?nocss=1` renders nothing and hands the page back.
 *
 * The css prop arrives ALREADY re-validated by `customCssForInjection` on the
 * server read — this component never widens what the store allows.
 */
export function UserCssInjector({ css }: { css: string }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Checked on mount, not per-navigation: someone rescuing a broken page
    // reloads with the param; an SPA hop keeping old state is fine because the
    // rescue path is a fresh load by construction.
    setEnabled(!new URLSearchParams(window.location.search).has("nocss"));
  }, []);

  if (!enabled || !css) return null;
  return <style data-user-css dangerouslySetInnerHTML={{ __html: css }} />;
}
