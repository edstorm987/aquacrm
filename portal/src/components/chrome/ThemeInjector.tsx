// ThemeInjector — emits a <style>:root{--brand-…}</style> at the top of
// the per-tenant layout. Server component (no client JS shipped).
//
// Also runs a dev-time WCAG contrast check on the tenant's brand kit.
// When a pair fails AA we log a warning to the server console — visible
// to the operator running `npm run dev` and to Vercel build/runtime
// logs in production. Does not block render — bad contrast is a
// quality issue, not a hard error.

import { brandToStyleString } from "@/lib/chrome/brandKit";
import { validatePalette } from "@/lib/a11y/contrastValidator";
import type { BrandKit } from "@/server/types";

interface Props {
  brand: BrandKit;
  scope: "agency" | "client" | "customer";
}

export function ThemeInjector({ brand, scope }: Props) {
  const css = brandToStyleString(brand);

  if (process.env.NODE_ENV !== "production") {
    const result = validatePalette({
      primary: brand.primaryColor,
      secondary: brand.secondaryColor,
      accent: brand.accentColor,
    });
    if (!result.ok && typeof console !== "undefined") {
      const summary = result.warnings
        .map(w => `${w.pair}: ${w.ratio} (need ≥${w.required}) — ${w.hint}`)
        .join("; ");
      console.warn(`[ThemeInjector · ${scope} brand kit] WCAG AA contrast warnings: ${summary}`);
    }
  }

  // Use `data-brand-scope` so devtools can identify which tenant is paint-active.
  return (
    <style
      data-brand-scope={scope}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}
