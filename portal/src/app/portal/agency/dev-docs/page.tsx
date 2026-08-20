// /portal/agency/dev-docs — owner + Dev-Mode-only in-app docs browser.
//
// The gate is everything (and it is layered): the sidebar item only appears for
// a founder in Dev Mode, THIS route independently 404s otherwise, and the
// doc-index helper asserts the same gate again. Absent + unreachable in any
// production-like context — which is what makes reading `docs/` off disk safe.

import { notFound, redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { devDocsAccessible, listDevDocs, readDevDoc, scanBlockers } from "@/lib/server/dev/devDocs";
import { DevDocsIndexView } from "./_DevDocsIndex";
import { DevDocViewer } from "./_DevDocViewer";

// Always read the live files — never serve a cached snapshot of the docs.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function DevDocsPage({ searchParams }: { searchParams: SearchParams }) {
  await ensureHydrated();

  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  // Founder + Dev Mode, or this route does not exist.
  if (!devDocsAccessible(session)) notFound();

  const params = await searchParams;
  const docParam = typeof params.doc === "string" ? params.doc : undefined;

  // ?doc=<relPath> → the viewer. A bad, missing, or escaping path 404s.
  if (docParam) {
    try {
      const doc = await readDevDoc(session, docParam);
      return <DevDocViewer doc={doc} nowMs={Date.now()} />;
    } catch {
      notFound();
    }
  }

  const [index, blockers] = await Promise.all([listDevDocs(session), scanBlockers()]);
  return <DevDocsIndexView index={index} blockers={blockers} />;
}
