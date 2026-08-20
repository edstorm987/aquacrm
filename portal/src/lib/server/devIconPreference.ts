import "server-only";

import { cookies } from "next/headers";

import { DEV_ICON_COOKIE } from "@/lib/chrome/devIconPreference";

// Server read of the dev-icon visibility preference. Default TRUE (shown): only
// an explicit `aqua_dev_icon=0` cookie hides the topbar Dev Console icon.
//
// This sits UNDER the founder + Dev-Mode gate the layout already applies — it
// can only hide an icon the viewer is otherwise entitled to, never summon one.

/** Pure parser — testable without a request context. Default true. */
export function parseDevIconCookie(value: string | undefined | null): boolean {
  return value !== "0";
}

/** Read the dev-icon preference for the current request. */
export async function devIconPreference(): Promise<boolean> {
  try {
    const store = await cookies();
    return parseDevIconCookie(store.get(DEV_ICON_COOKIE)?.value);
  } catch {
    return true;
  }
}
