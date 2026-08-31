import type { ReactNode } from "react";

import { readPrimaryAgencyWebsiteForPublicRender } from "@/server/agencyWebsite";

export default async function WebsiteLayout({ children }: { children: ReactNode }) {
  // A READ, not an ensure (issue #21). This is the PUBLIC website layout: a
  // stranger loading the marketing site used to create the tenant's website
  // record, which was the only read-time write an unauthenticated visitor could
  // trigger.
  //
  // And a read that may FAIL without taking the page with it: this layout wraps
  // every public page, so hydrating here made prerendering the marketing site
  // depend on a live database, and a brief outage killed the whole deploy
  // rather than one script tag. See readPrimaryAgencyWebsiteForPublicRender.
  const website = await readPrimaryAgencyWebsiteForPublicRender();
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
