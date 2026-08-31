// The portal's shared countdown-deadline model, reachable from inside this
// plugin — the same one-file indirection `menuKeys.ts` documents, for the same
// loader reason.
//
// This plugin is its own ESM package (`"type": "module"` in its package.json)
// while `portal/src/engines/**` is CommonJS to the smoke runner's loader. A
// NAMED import across that boundary links fine under the bundler and not at
// all under `tsx`: it throws "does not provide an export named
// 'stabiliseCountdownDeadlines'" at instantiation, before a single assertion
// runs — which is why `server/pages.ts` dragged the whole static-export smoke
// gate down with it.
//
// Reading through the namespace works in both worlds, and there is still
// exactly one implementation, in `src/engines/editor/elements/countdownDeadline.ts`.

import * as sharedCountdown from "@/engines/editor/elements/countdownDeadline";

type Namespace = typeof sharedCountdown & { default?: typeof sharedCountdown };
const shared = sharedCountdown as Namespace;

export const stabiliseCountdownDeadlines =
  shared.stabiliseCountdownDeadlines ?? shared.default!.stabiliseCountdownDeadlines;
