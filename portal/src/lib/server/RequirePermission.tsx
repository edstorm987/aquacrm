import "server-only";

// Server-component permission wrapper (T1 R7).
//
// Usage in an admin page body:
//
//   import { RequirePermission } from "@/lib/server/RequirePermission";
//   const session = await requireRole([...AGENCY_ROLES]);
//   return (
//     <RequirePermission session={session} requires={["finance.edit"]}>
//       <FinanceAdmin … />
//     </RequirePermission>
//   );
//
// Founder bypass via `effectiveRole().isFounder`. Empty `requires` is
// treated as no gate (renders children verbatim). Otherwise renders a
// 403 panel inline — same shape as the per-client SOPs tab denial.

import type { ReactNode } from "react";
import type { SessionPayload } from "@/server/types";
import { effectiveRole, hasAllPermissions, type PermissionKey } from "./effectiveRole";

export function RequirePermission({
  session,
  requires,
  children,
  fallback,
}: {
  session: SessionPayload | null | undefined;
  requires: readonly PermissionKey[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const eff = effectiveRole(session);
  if (hasAllPermissions(eff, requires)) {
    return <>{children}</>;
  }
  if (fallback) return <>{fallback}</>;
  return (
    <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
      <h2 className="text-base font-semibold">403 — Permission denied</h2>
      <p className="mt-1 text-xs">
        Requires: <code className="rounded bg-red-100 px-1 py-0.5">{requires.join(", ")}</code>.
        Your effective role is <strong>{eff.roleLabel}</strong>.
      </p>
    </section>
  );
}
