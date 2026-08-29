import type { ReactNode } from "react";

import { readPrimaryAgencyWebsite } from "@/server/agencyWebsite";
import { ensureHydrated } from "@/server/storage";

export default async function WebsiteLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  // A READ, not an ensure (issue #21). This is the PUBLIC website layout: a
  // stranger loading the marketing site used to create the tenant's website
  // record, which was the only read-time write an unauthenticated visitor could
  // trigger.
  const website = readPrimaryAgencyWebsite();
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
