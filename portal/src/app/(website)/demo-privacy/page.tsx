import Link from "next/link";
import { notFound } from "next/navigation";

import {
  WEBSITE_DEMO_TERMS_VERSION,
  websiteDemoEnabled,
} from "@/server/websiteDemo";
import { LegalDraftNotice } from "../LegalDraftNotice";
import { WebsiteShell } from "../WebsiteShell";

export const metadata = {
  title: "AquaCRM demo privacy notice (draft)",
  description: "Draft privacy notice for the AquaCRM demo, pending legal review.",
  robots: { index: false, follow: false },
};

/**
 * The demo privacy notice SHELL — the companion to `/terms`.
 *
 * Same rule as the terms page: no retention period is stated, because none has
 * been chosen and no reaper enforces one (ED-QUESTIONS Q4). What IS stated is
 * what the code actually does — which data is collected, where it is kept, and
 * that a deletion request removes it.
 */
export default function DemoPrivacyPage() {
  if (!websiteDemoEnabled()) notFound();

  return (
    <WebsiteShell brand="aquacrm" compact>
      <section className="px-5 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[760px]">
          <h1 className="text-4xl font-semibold text-[#0C1A22]">AquaCRM demo privacy notice</h1>
          <p className="mt-3 text-sm text-[#5C6F79]">Version {WEBSITE_DEMO_TERMS_VERSION}</p>

          <div className="mt-7">
            <LegalDraftNotice version={WEBSITE_DEMO_TERMS_VERSION} />
          </div>

          <div className="mt-10 grid gap-8 text-base leading-7 text-[#283A43]">
            <section>
              <h2 className="text-xl font-semibold text-[#0C1A22]">Who holds your details</h2>
              <p className="mt-2">
                Zimante Group, the company that builds and operates AquaCRM.
                Contact:{" "}
                <a className="font-semibold underline" href="mailto:hello@milesymedia.co">
                  hello@milesymedia.co
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#0C1A22]">What is collected</h2>
              <ul className="mt-2 grid list-disc gap-1 pl-5">
                <li>Your name.</li>
                <li>An email address, a phone number, or both — whichever you give.</li>
                <li>Anything you write in the message box.</li>
                <li>
                  The time you agreed to the demo terms and the version you
                  agreed to.
                </li>
              </ul>
              <p className="mt-3">
                Nothing else. There is no account, no password and no payment
                detail, because a demo request creates none of those.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#0C1A22]">Why, and on what basis</h2>
              <p className="mt-2">
                To contact you about the AquaCRM demo you asked for. The basis
                is your consent, given by ticking the box on the request form
                and recorded with the version of the terms shown to you.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#0C1A22]">Where it is kept</h2>
              <p className="mt-2">
                Demo requests are stored separately from the live working data
                of any agency using AquaCRM. A demo request never appears in
                another business&apos;s customer records.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#0C1A22]">How long it is kept</h2>
              <p className="mt-2">
                A retention period has not been decided, and this notice will
                not claim one before it is. Your details are kept until you ask
                for them to be deleted, and asking is enough — we do not require
                a reason.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#0C1A22]">Your rights</h2>
              <p className="mt-2">
                You can ask what is held about you, ask for it to be corrected,
                and ask for it to be deleted. Email{" "}
                <a className="font-semibold underline" href="mailto:hello@milesymedia.co">
                  hello@milesymedia.co
                </a>{" "}
                and the request is handled through the same governance process
                AquaCRM uses for every other subject request.
              </p>
            </section>
          </div>

          <p className="mt-10 text-sm leading-6 text-[#5C6F79]">
            See also the{" "}
            <Link href="/terms" className="font-semibold underline">
              demo terms
            </Link>
            , or go back to{" "}
            <Link href="/for-agencies" className="font-semibold underline">
              AquaCRM for agencies
            </Link>
            .
          </p>
        </div>
      </section>
    </WebsiteShell>
  );
}
