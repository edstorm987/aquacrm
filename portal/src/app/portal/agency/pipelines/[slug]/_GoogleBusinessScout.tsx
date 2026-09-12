"use client";

import { GoogleMapsAttribution } from "@/components/attribution/GoogleMapsAttribution";
import { ExternalLink, MapPinned, Network, Plus, ShieldCheck } from "lucide-react";

interface GoogleBusinessScoutProps {
  embedApiKey: string;
  onCapture: (source: "google-maps" | "networking") => void;
}

const DEFAULT_MAP_QUERY = "businesses near Stafford, UK";

function mapsSearchHref(query = DEFAULT_MAP_QUERY): string {
  const params = new URLSearchParams({ api: "1", query });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function mapsEmbedUrl(key: string): string {
  if (!key) return "";
  const params = new URLSearchParams({
    key,
    q: DEFAULT_MAP_QUERY,
    language: "en",
    region: "GB",
  });
  return `https://www.google.com/maps/embed/v1/search?${params.toString()}`;
}

/**
 * Google's own map and controls are the primary Scouting workspace. Aqua does
 * not fake a second search-results UI or scrape the map. A selected listing
 * cannot be read out of a cross-origin iframe, so the operator copies its Share
 * link into the private dossier they explicitly open.
 */
export function GoogleBusinessScout({ embedApiKey, onCapture }: GoogleBusinessScoutProps) {
  const mapSrc = mapsEmbedUrl(embedApiKey);
  const mapsHref = mapsSearchHref();

  return (
    <section className="overflow-hidden rounded-lg border border-black/10 bg-white" aria-labelledby="google-business-scout-heading">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e9f5f2] text-[#166a64]">
            <MapPinned size={19} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#166a64]">Live discovery map</p>
            <h2 id="google-business-scout-heading" className="mt-1 text-lg font-semibold text-black/90">Scout businesses with Google Maps</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-black/65">
              Use Google&apos;s map, listings, and controls below. When a business is worth keeping, copy its Maps share link and capture a private Aqua dossier.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <button type="button" onClick={() => onCapture("google-maps")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 sm:flex-none">
            <Plus size={14} aria-hidden="true" /> Capture from map
          </button>
          <button type="button" onClick={() => onCapture("networking")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 sm:flex-none">
            <Network size={14} aria-hidden="true" /> Networking or referral
          </button>
        </div>
      </header>

      <div className="relative min-h-[30rem] bg-[#f3f1ec]">
        {mapSrc ? (
          <iframe
            title="Google Maps business discovery near Stafford"
            src={mapSrc}
            loading="eager"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-[clamp(30rem,68vh,56rem)] w-full border-0"
          />
        ) : (
          <div className="flex min-h-[30rem] flex-col items-center justify-center px-6 text-center">
            <MapPinned size={32} className="text-black/25" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-black/70">Connect the restricted Google Maps Embed key to show the live map here.</p>
            <p className="mt-1 max-w-lg text-xs leading-5 text-black/65">
              Scouting is still usable now: open the same live Maps search, copy a listing&apos;s Share link, then capture it in Aqua. The app never substitutes fake local results.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <a href={mapsHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                Open Google Maps <ExternalLink size={13} aria-hidden="true" />
              </a>
              <button type="button" onClick={() => onCapture("google-maps")} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                <Plus size={13} aria-hidden="true" /> Capture a business
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-4 py-3 text-xs text-black/65 sm:px-5">
        <span className="flex min-w-0 items-start gap-2 leading-5">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#16877f]" aria-hidden="true" />
          Aqua stores only the business details, source link, classification, and notes you deliberately save.
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <GoogleMapsAttribution />
          <a href={mapsHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-sm font-semibold text-[#166a64] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Full Maps <ExternalLink size={11} aria-hidden="true" /></a>
        </span>
      </footer>
    </section>
  );
}
