import Link from "next/link";
import { notFound } from "next/navigation";

import {
  WEBSITE_DEMO_TERMS_VERSION,
  websiteDemoEnabled,
} from "@/server/websiteDemo";
import { LegalDraftNotice } from "../LegalDraftNotice";
import { WebsiteShell } from "../WebsiteShell";

export const metadata = {
  title: "AquaCRM demo terms (draft)",
  description: "Draft terms for the AquaCRM demo, pending legal review.",
  robots: { index: false, follow: false },
};

/**
 * The demo terms SHELL.
 *
 * What this page deliberately does NOT say: how long anything is kept.
 * ED-QUESTIONS Q4 is explicit — no "we delete after X" wording until the
 * retention period is chosen AND the reaper that enforces it is live. Neither
 * is true yet, so the page says what is true instead: the period is not set,
 * and a deletion request is honoured on request.
 */
export default function DemoTermsPage() {
  if (!websiteDemoEnabled()) notFound();

  return (
    <WebsiteShell brand="aquacrm" compact>
      <section className="px-5 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[760px]">
          <h1 className="text-4xl font-semibold text-[#0C1A22]">AquaCRM demo terms</h1>
          <p className="mt-3 text-sm text-[#5C6F79]">Version {WEBSITE_DEMO_TERMS_VERSION}</p>

          <div className="mt-7">
            <LegalDraftNotice version={WEBSITE_DEMO_TERMS_VERSION} />
          </div>

          <div className="mt-10 grid gap-8 text-base leading-7 text-[#283A43]">
            <section>
              <h2 className="text-xl font-semibold text-[#0C1A22]">1. What the demo is</h2>
              <p className="mt-2">
                AquaCRM is software built and operated by Zimante Group. The
                demo is an opportunity to look at it. It is not a purchase, a
                subscription, or a promise that any particular feature will be
                available to you.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#0C1A22]">2. What asking for the demo does</h2>
              <p className="mt-2">
                Asking for the demo records your name, the contact details you
                give us, anything you type in the message box, and the fact and
                version of your agreement to these terms. It does not create an
                account, and it does not open a workspace — no self-serve demo
                environment exists yet.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#0C1A22]">3. How long your details are kept</h2>
              <p className="mt-2">
                A retention period has not been set, so this page does not state
                one. We will not pretend to a schedule we do not yet operate.
                What is true today: your details are kept until you ask us to
                delete them, and we delete them when you do. Ask by emailing{" "}
                <a className="font-semibold underline" href="mailto:hello@milesymedia.co">
                  hello@milesymedia.co
                </a>
                . This section will be replaced when the period is agreed and
                the process that enforces it is running.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#0C1A22]">4. What we do not do</h2>
              <p className="mt-2">
                We do not sell your details, and we do not pass them to another
                company for their own marketing. Demo requests are held apart
                from the live client data of any agency that uses AquaCRM.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#0C1A22]">5. Changes to these terms</h2>
              <p className="mt-2">
                When the wording changes, the version above changes with it. The
                version you agreed to is stored with your request, so it is
                always clear which text you actually saw.
              </p>
            </section>
          </div>

          <p className="mt-10 text-sm leading-6 text-[#5C6F79]">
            See also the{" "}
            <Link href="/demo-privacy" className="font-semibold underline">
              privacy notice
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
