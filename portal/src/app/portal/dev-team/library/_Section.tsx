import type { ReactNode } from "react";
// Dev Team → Library. Surfaces every plan / phase / feature / doc by reusing the
// dev-docs BACKEND wholesale (`listDevDocs`/`readDevDoc` +
// `devDocsAccessible`), rendered through Library-scoped view components so every
// link stays inside the Dev Team hub. Mirrors the dev-docs page.tsx server logic
// exactly: same layered gate (founder + Dev Mode) that the layout already
// asserts, re-asserted here, plus the `?doc=` viewer branch. Renders inside the
// existing dev-team layout.

import { notFound, redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { devDocsAccessible, listDevDocs, readDevDoc } from "@/lib/server/devDocs";
import { LibraryIndexView, LibraryRecentView } from "./_LibraryIndex";
import { LibraryDocViewer } from "./_LibraryDocViewer";

// Always read the live files — never serve a cached snapshot of the docs.

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export async function LibrarySection({ tabs, searchParams }: { tabs?: ReactNode; searchParams: SearchParams }) {
  await ensureHydrated();

  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  // Founder + Dev Mode, or this section does not exist.
  if (!devDocsAccessible(session)) notFound();

  const params = await searchParams;
  const docParam = typeof params.doc === "string" ? params.doc : undefined;

  // ?doc=<relPath> → the viewer. A bad, missing, or escaping path 404s.
  if (docParam) {
    try {
      const doc = await readDevDoc(session, docParam);
      return <LibraryDocViewer doc={doc} nowMs={Date.now()} />;
    } catch {
      notFound();
    }
  }

  // ?view=recent → the full recently-edited list on its own page, so the index
  // stays light (5 rows) and never renders ~1,800 at once. The folder tree on
  // the index covers exhaustive browsing.
  if (typeof params.view === "string" && params.view === "recent") {
    const recentIndex = await listDevDocs(session);
    return <LibraryRecentView index={recentIndex} />;
  }

  // Just the index. The blocker strip this page used to render was dropped (see
  // `_LibraryIndex`), and the `scanBlockers()` that fed it outlived it — every
  // Library load was reading + parsing state.md for a value that was thrown
  // away. Blockers live on the Dev Team Home now.
  const index = await listDevDocs(session);
  return <LibraryIndexView index={index} tabs={tabs} />;
}
