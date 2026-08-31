// The portal's shared menu keyboard model, reachable from inside this plugin.
//
// This plugin is its own ESM package (`"type": "module"` in its package.json)
// while the portal's `src/lib/**` is CommonJS to the smoke runner's loader. A
// NAMED import across that boundary links fine under the bundler and not at
// all under `tsx --test`: the CommonJS namespace arrives as `{ default: … }`,
// so `import { useMenuKeys } from "@/lib/a11y/useMenuKeys"` throws
// "does not provide an export named" the moment a test renders the component.
// R021's SSR render of HistoryToolbar found it immediately.
//
// Reading through the namespace works in both worlds, and it is deliberately
// ONE file rather than four: the alternative — a plugin-local copy of the
// keyboard model — is the duplication this codebase keeps paying for
// elsewhere. There is still exactly one implementation, in `src/lib/a11y`.

import * as sharedMenuKeys from "@/lib/a11y/useMenuKeys";

type Namespace = typeof sharedMenuKeys & { default?: typeof sharedMenuKeys };
const shared = sharedMenuKeys as Namespace;

export const useMenuKeys = shared.useMenuKeys ?? shared.default!.useMenuKeys;
