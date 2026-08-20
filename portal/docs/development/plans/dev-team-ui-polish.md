# Dev Team workspace — full UI pass (light/dark, contrast, hover, effects, responsive)

**Status:** planned — runs after the profile-toggles and enquiry-read-scoping lanes commit.
**Raised:** 2026-08-20 by Ed: "give dev mode a proper dark mode and light mode, checking
contrast... the hover stuff... the effects colours... checking the responsiveness. full ui mode."

## Diagnosis (measured)
- The app themes via `html[data-color-mode="dark"]` CSS overrides (245 in globals.css for
  `.mm-client-*`); `ColorModeToggle` sets `document.documentElement.dataset.colorMode`.
- The Dev Team workspace has only 2 dark rules and **337 hardcoded inline hex values across
  41 files** (`bg-[#0b6f6d]`, `text-[#2A2520]`, …). Inline arbitrary hex cannot respond to
  the theme switch, so dark mode is effectively broken there.
- Recurring families (light-baked): teal `#0b6f6d/#0a5f5d`, success `#2f7d4f/#3f7d52`,
  danger `#a5443a/#b4443a`, warning `#8a7228`, info `#2f6f8f`, surfaces `#e6f1f0/#f6efdd`,
  ink `#14231f`, indigo `#3f51a8/#6d4aa8`.

## Art direction (Ed, 2026-08-20) — "The Shipyard"

Dev Team is its OWN world, distinct from the app's standard dark AND from Command
Centre's cyan war-room — but in the same naval family. Concept: **Command Centre
is the bridge that commands the fleet; the Dev Team is the yard where the ship is
forged and built.**

**Dark mode = the forge / night shipyard (blacksmith + shipbuilder).**
- ground: cold wrought-iron / soot `--dev-bg #15110d`, raised `#1e1813`, line `#3a2e22`
- signature accent: EMBER / hot-iron glow `--dev-accent #ff7a2f` (this is the "effects"
  Ed wants — warm ember box-shadow glow on hover/focus, spark flecks)
- secondary: brass `#c8964e`; cold naval steel `#6f97ad`
- ink: forge-light cream `#f3e7d6`, muted `#a8937c`
- semantic: success (tempered) `#4fae6b` · danger (hot metal) `#e5482f` · warning (brass)
  `#e0a63a` · info (steel) `#6f97ad`
- effects/icons: ember glow, rivet dividers, hammer/anvil/hull/chain iconography,
  hammered-iron texture feel; `prefers-reduced-motion` kills the glow animation.

**Light mode = the timber mill / boat yard (building a hull, sawn wood).**
- ground: planed pine `--dev-bg #efe3cd`, raised `#f7efdd`, line `#d9c7a5`
- ink: walnut `#3a2c1e`, muted `#7c6a52`
- signature accent: boat-paint teal `--dev-accent #1f7a6e`; secondary resin-amber `#b5701f`
- semantic: success (moss) `#3f8f57` · danger (red-lead/rust) `#b8442f` · warning (ochre)
  `#b5701f` · info (maritime) `#2f6f8f`
- effects/icons: soft wood-grain, routed/carved edges, gentle daylight shadows, same
  hammer/hull motif in a woodwork register.

Same token NAMES in both themes; only values flip under `html[data-color-mode="dark"]`.
Effect intensity and a couple of icons may be theme-aware (ember vs woodwork).

## The fix
1. Semantic token set scoped to the dev-team shell, defined for light and overridden under
   `html[data-color-mode="dark"]` (mirror the `.mm-client-*` approach):
   `--dev-bg --dev-surface --dev-surface-raised --dev-ink --dev-ink-muted --dev-line
   --dev-accent(+hover/soft) --dev-success --dev-danger --dev-warning --dev-info
   --dev-glow` (effect). Keep the teal/terminal character; raise contrast to WCAG AA.
2. Replace all 337 inline hex with tokens (var() or `.mm-dev-*` classes) across the 41 files.
3. Hover states on every interactive element; effect colours (accent glow, transitions,
   focus rings) tokenised so they work in both themes; `prefers-reduced-motion` respected.
4. Responsive: verify mobile/tablet/desktop for the sidebar, section headers, boards,
   tables and popovers (overflow-x containers, no body side-scroll).

## Verification (commander, browser)
Toggle light↔dark on the Turbopack dev server; check contrast on every token pair, hover on
each control, and all three breakpoints. Refine by eye. No `dangerouslySetInnerHTML`.

## Files
`src/app/portal/dev-team/**` (41 tsx) + the dev-team block in `src/app/globals.css`
(or a scoped stylesheet). Disjoint from the profile-toggles lane (chrome components) and the
enquiry-read-scoping lane (enquiry/server code).

## Dev Team cutscene / loader (Ed, 2026-08-20)
> "give the dev team a proper cutscene to fit with the theme, a proper loader that just puts
> this all together."

Command Centre already has its naval bridge cutscene — `CommandCenterTransition` renders
"AQUA COMMAND NETWORK · BRIDGE HANDSHAKE → Entering command deck · Synchronising Radar,
evidence, watch control, and bridge stations" (radar sweep animation, cyan HUD). The Dev Team
gets its OWN, same family, forge/shipyard register:
- **Concept:** "Entering the shipyard" / "Firing the forge" — the yard where the vessel is built.
- **Dark (forge):** ember glow ignition, sparks, anvil/hammer/hull motifs, a "forge coming to
  temperature" progress feel; naval yard framing ("AQUA SHIPYARD · SLIPWAY 01" etc.).
- **Light (mill):** timber-yard / boat-shop framing, sawdust motes, routed-edge reveal.
- Built as a sibling transition component to `CommandCenterTransition` (reuse its structure),
  gated by Cinematic mode (respects the new cinematic toggle + prefers-reduced-motion), fired
  when entering the Dev Team workspace. Uses the shipyard token set from this plan so it
  themes correctly in both modes.
