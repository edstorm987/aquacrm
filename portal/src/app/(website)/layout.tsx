import type { ReactNode } from "react";

import { ensurePrimaryAgencyWebsite } from "@/server/agencyWebsite";
import { ensureHydrated } from "@/server/storage";

export default async function WebsiteLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  const website = ensurePrimaryAgencyWebsite();
  return (
    <>
      {children}
      {website ? (
        <script
          src="/aqua-tag.js"
          data-site-key={website.telemetrySiteKey}
          data-property="milesymedia-website"
          defer
        />
      ) : null}
    </>
  );
}
