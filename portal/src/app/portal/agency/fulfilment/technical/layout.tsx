import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { AuthError } from "@/lib/server/auth/auth";
import { requireCurrentFulfilmentTechnicalAccess } from "@/lib/server/access/fulfilmentTechnicalAccess";

export default async function FulfilmentTechnicalLayout({ children }: { children: ReactNode }) {
  try {
    await requireCurrentFulfilmentTechnicalAccess("view");
  } catch (error) {
    if (error instanceof AuthError
      && error.status === 403
      && error.message === "workspace_element_view_required") {
      notFound();
    }
    throw error;
  }
  return children;
}
