import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import {
  MILESYMEDIA_CONTACT_PATH,
  MILESYMEDIA_HOME_PATH,
  MILESYMEDIA_SERVICES_PATH,
} from "@/lib/public/milesymediaRoutes";

/**
 * The public-website chrome.
 *
 * `brand` exists so the AquaCRM demo surfaces (`/for-agencies`, `/terms`,
 * `/privacy`) reuse THIS shell rather than growing a second one. The two brands
 * share the same structure, skip target and footer contract; only the wordmark,
 * palette and nav differ. See `docs/workspace/hazards-and-duplication.md` — a
 * parallel shell is exactly the kind of second copy that starts drifting.
 */
export type WebsiteShellBrand = "milesymedia" | "aquacrm";

export const AQUA_FOR_AGENCIES_PATH = "/for-agencies";
export const AQUA_TERMS_PATH = "/terms";
/**
 * The demo privacy notice is `/demo-privacy`, NOT `/privacy`.
 *
 * `/privacy` is already taken: `next.config.ts` rewrites it — in `beforeFiles`,
 * which is evaluated ahead of the filesystem — to the published AquaCRM notice
 * at `public/aquacrm-site/privacy/index.html` (the one pinned by
 * `smoke-privacy-notice-truth`). A page at `src/app/(website)/privacy` would
 * never be served, so linking consent to `/privacy` would send the visitor to a
 * different document from the one whose version is stamped on their record.
 * `smoke-website-demo-gate` fails if any demo route is shadowed like that.
 */
export const AQUA_PRIVACY_PATH = "/demo-privacy";

export function WebsiteShell({
  children,
  compact = false,
  brand = "milesymedia",
}: {
  children: ReactNode;
  compact?: boolean;
  brand?: WebsiteShellBrand;
}) {
  if (brand === "aquacrm") {
    return (
      <main id="main-content" className="min-h-screen bg-[#F3F6F8] text-[#0C1A22]">
        <header className="sticky top-0 z-50 border-b border-white/12 bg-[#07141C]/96 text-white backdrop-blur">
          <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
            <Link href={AQUA_FOR_AGENCIES_PATH} className="flex min-w-0 items-center gap-3" aria-label="AquaCRM for agencies">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#3FC5D8] text-sm font-black text-[#06222B]">
                A
              </span>
              <span className="truncate font-semibold">AquaCRM</span>
            </Link>
            <nav aria-label="AquaCRM navigation" className="hidden items-center gap-7 text-sm text-white/70 md:flex">
              <Link href={AQUA_FOR_AGENCIES_PATH} className="transition hover:text-white">
                For agencies
              </Link>
              <Link href={AQUA_TERMS_PATH} className="transition hover:text-white">
                Demo terms
              </Link>
              <Link href={AQUA_PRIVACY_PATH} className="transition hover:text-white">
                Privacy
              </Link>
            </nav>
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="inline-flex h-10 items-center px-3 text-sm font-medium text-white/70 transition hover:text-white"
              >
                Sign in
              </Link>
            </div>
          </div>
        </header>

        {children}

        {!compact ? (
          <footer className="bg-[#07141C] px-5 py-10 text-white sm:px-8 lg:px-12">
            <div className="mx-auto flex max-w-[1344px] flex-col justify-between gap-8 border-b border-white/14 pb-8 sm:flex-row">
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-[#3FC5D8] text-sm font-black text-[#06222B]">
                    A
                  </span>
                  <span className="font-semibold">AquaCRM</span>
                </div>
                <p className="mt-4 max-w-md text-sm leading-6 text-white/60">
                  The operating system behind Zimante Group&apos;s agencies —
                  journey, fulfilment, finance and the day itself in one place.
                </p>
              </div>
              <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm text-white/66">
                <Link href={AQUA_FOR_AGENCIES_PATH}>For agencies</Link>
                <Link href={AQUA_TERMS_PATH}>Demo terms</Link>
                <Link href={AQUA_PRIVACY_PATH}>Privacy</Link>
                <Link href="/login">Sign in</Link>
              </nav>
            </div>
            <div className="mx-auto flex max-w-[1344px] flex-col gap-2 pt-5 text-xs text-white/42 sm:flex-row sm:justify-between">
              <span>© 2026 Zimante Group. All rights reserved.</span>
              <a href="mailto:hello@milesymedia.co">hello@milesymedia.co</a>
            </div>
          </footer>
        ) : null}
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#F6F4EE] text-[#171714]">
      <header className="sticky top-0 z-50 border-b border-white/12 bg-[#111411]/96 text-white backdrop-blur">
        <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href={MILESYMEDIA_HOME_PATH} className="flex min-w-0 items-center gap-3" aria-label="Milesymedia home">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#D7A85D] text-sm font-black text-[#201608]">
              M
            </span>
            <span className="truncate font-semibold">Milesymedia</span>
          </Link>
          <nav aria-label="Website navigation" className="hidden items-center gap-7 text-sm text-white/70 md:flex">
            <Link href={MILESYMEDIA_SERVICES_PATH} className="transition hover:text-white">
              What we do
            </Link>
            <Link href="/tools" className="transition hover:text-white">
              Free tools
            </Link>
            <Link href="/portfolio" className="transition hover:text-white">
              Portfolio
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden h-10 items-center px-3 text-sm font-medium text-white/70 transition hover:text-white sm:inline-flex"
            >
              Client login
            </Link>
            <Link
              href={MILESYMEDIA_CONTACT_PATH}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#D7A85D] px-4 text-sm font-semibold text-[#201608] transition hover:bg-[#E5BE7D]"
            >
              Let&apos;s talk
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {children}

      {!compact ? (
        <footer className="bg-[#111411] px-5 py-10 text-white sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-[1344px] flex-col justify-between gap-8 border-b border-white/14 pb-8 sm:flex-row">
            <div>
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-md bg-[#D7A85D] text-sm font-black text-[#201608]">
                  M
                </span>
                <span className="font-semibold">Milesymedia</span>
              </div>
              <p className="mt-4 max-w-md text-sm leading-6 text-white/60">
                Websites, visibility, photography and systems that help good
                service businesses move forward.
              </p>
            </div>
            <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm text-white/66">
              <Link href={MILESYMEDIA_HOME_PATH}>Home</Link>
              <Link href="/tools">Free tools</Link>
              <Link href="/health-check">Health Check</Link>
              <Link href="/business-os">Business OS</Link>
              <Link href="/portfolio">Portfolio</Link>
              <Link href="/login">Client login</Link>
              <Link href={MILESYMEDIA_CONTACT_PATH}>Contact</Link>
            </nav>
          </div>
          <div className="mx-auto flex max-w-[1344px] flex-col gap-2 pt-5 text-xs text-white/42 sm:flex-row sm:justify-between">
            <span>© 2026 Milesymedia. All rights reserved.</span>
            <a href="mailto:hello@milesymedia.co">hello@milesymedia.co</a>
          </div>
        </footer>
      ) : null}
    </main>
  );
}
