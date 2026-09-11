"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { GoogleMapsAttribution } from "@/components/attribution/GoogleMapsAttribution";
import {
  Building2,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";

export interface GoogleBusinessPlace {
  placeId: string;
  displayName: string;
  formattedAddress?: string;
  googleMapsUri?: string;
  primaryType?: string;
  phone?: string;
  website?: string;
  businessStatus?: string;
  attributions?: Array<{ provider: string; providerUri?: string }>;
}

interface GoogleBusinessScoutProps {
  embedApiKey: string;
  placesConfigured: boolean;
  onScoutManually: () => void;
  onStartScouting: (place: GoogleBusinessPlace) => void;
}

function mapsSearchHref(query: string): string {
  const params = new URLSearchParams({ api: "1", query: query || "businesses near me" });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function embedUrl(key: string, query: string, selected?: GoogleBusinessPlace): string {
  if (!key) return "";
  const mode = selected ? "place" : "search";
  const params = new URLSearchParams({
    key,
    q: selected ? `place_id:${selected.placeId}` : query || "businesses near me",
    language: "en",
    region: "GB",
  });
  return `https://www.google.com/maps/embed/v1/${mode}?${params.toString()}`;
}

function businessTypeLabel(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function searchErrorMessage(code?: string): string {
  switch (code) {
    case "rate_limited":
    case "google_places_provider_rate_limited":
      return "Google business search is busy. Wait a moment, then try again.";
    case "google_places_daily_quota_exhausted":
      return "This workspace has reached today’s Google business-search limit. Try again tomorrow or add the business manually.";
    case "google_places_quota_unavailable":
      return "Google business search is paused because its usage guard is unavailable.";
    case "google_places_not_configured":
      return "Secure Google business search has not been configured yet.";
    case "google_places_blocked_in_sandbox":
      return "Live Google business search is disabled in this safe test environment.";
    case "invalid_search_request":
      return "Use a business type, name, or location without unusual control characters.";
    default:
      return "Google business search is unavailable right now. You can still add the business manually.";
  }
}

export function GoogleBusinessScout({
  embedApiKey,
  placesConfigured,
  onScoutManually,
  onStartScouting,
}: GoogleBusinessScoutProps) {
  const [query, setQuery] = useState("");
  const [mapQuery, setMapQuery] = useState("businesses near me");
  const [places, setPlaces] = useState<GoogleBusinessPlace[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSequence = useRef(0);
  const selected = places.find(place => place.placeId === selectedId);
  const mapSrc = useMemo(
    () => embedUrl(embedApiKey, mapQuery, selected),
    [embedApiKey, mapQuery, selected],
  );

  async function searchBusinesses(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const text = query.trim();
    if (text.length < 3) {
      setError("Enter a business type, name, or location using at least 3 characters.");
      return;
    }
    setSearched(true);
    setMapQuery(text);
    setSelectedId("");
    setPlaces([]);
    setError(null);
    if (!placesConfigured) return;

    const sequence = searchSequence.current + 1;
    searchSequence.current = sequence;
    setBusy(true);
    try {
      const response = await fetch("/api/portal/leads-pipeline/google-places/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        places?: GoogleBusinessPlace[];
      } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(searchErrorMessage(payload?.error));
      }
      const nextPlaces = Array.isArray(payload.places) ? payload.places : [];
      if (searchSequence.current === sequence) {
        setPlaces(nextPlaces);
        setSelectedId(nextPlaces[0]?.placeId ?? "");
      }
    } catch (cause) {
      if (searchSequence.current === sequence) {
        setPlaces([]);
        setError(cause instanceof Error ? cause.message : "Google business search failed.");
      }
    } finally {
      if (searchSequence.current === sequence) setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-black/10 bg-white" aria-labelledby="google-business-scout-heading">
      <div className="grid min-w-0 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#e9f5f2] text-[#166a64]">
              <MapPin size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#166a64]">Discover</p>
              <h2 id="google-business-scout-heading" className="mt-1 text-lg font-semibold text-black/90">Find businesses on Google Maps</h2>
              <p className="mt-1 text-sm leading-6 text-black/55">
                Search a niche and location, inspect the live profile, then start a private scouting dossier for the businesses worth researching.
              </p>
            </div>
          </div>

          <form onSubmit={searchBusinesses} className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Business type, name, or location</span>
              <span className="flex min-h-11 items-center gap-2 rounded-md border border-black/15 bg-white px-3 focus-within:border-[#16877f] focus-within:ring-2 focus-within:ring-[#16877f]/15">
                <Search size={16} className="shrink-0 text-black/35" aria-hidden="true" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value.slice(0, 160))}
                  placeholder="e.g. plumbers in Stafford"
                  autoComplete="off"
                  className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-black/80 outline-none placeholder:text-black/55"
                />
              </span>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85 disabled:cursor-wait disabled:opacity-55"
            >
              {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
              {busy ? "Searching…" : "Search area"}
            </button>
          </form>

          {!placesConfigured ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
              Secure Google business search has not been enabled for this workspace. Manual scouting remains available.
            </div>
          ) : null}
          {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}

          <div className="mt-4" aria-live="polite" aria-busy={busy}>
            {places.length ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-black/65">{places.length} candidate{places.length === 1 ? "" : "s"}</p>
                  <GoogleMapsAttribution />
                </div>
                <ul className="mt-2 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                  {places.map(place => {
                    const active = place.placeId === selected?.placeId;
                    return (
                      <li key={place.placeId} className={`rounded-md border p-3 ${active ? "border-[#16877f]/45 bg-[#e9f5f2]/55" : "border-black/10 bg-white"}`}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelectedId(place.placeId)}
                          className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f]/45"
                        >
                          <span className="flex min-w-0 items-start gap-2">
                            <Building2 size={16} className="mt-0.5 shrink-0 text-black/35" aria-hidden="true" />
                            <span className="min-w-0">
                              <strong className="block break-words text-sm font-semibold text-black/80">{place.displayName}</strong>
                              {place.formattedAddress ? <span className="mt-0.5 block break-words text-xs leading-5 text-black/65">{place.formattedAddress}</span> : null}
                              {place.primaryType ? <span className="mt-1 block text-xs font-medium text-black/60">{businessTypeLabel(place.primaryType)}</span> : null}
                            </span>
                          </span>
                        </button>
                        {place.attributions?.length ? (
                          <p className="mt-2 flex flex-wrap gap-x-1 text-xs font-normal tracking-normal text-[#5e5e5e]">
                            <span>Data:</span>
                            {place.attributions.map((attribution, index) => (
                              <span key={`${attribution.provider}:${index}`}>
                                {index ? " · " : ""}
                                {attribution.providerUri ? (
                                  <a href={attribution.providerUri} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                                    {attribution.provider}
                                  </a>
                                ) : attribution.provider}
                              </span>
                            ))}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setSelectedId(place.placeId); onStartScouting(place); }}
                            className="inline-flex min-h-9 items-center rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85"
                          >
                            Start scouting record
                          </button>
                          {place.googleMapsUri ? (
                            <a href={place.googleMapsUri} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/10 px-3 text-xs font-medium text-black/60 hover:bg-black/[0.03]">
                              Open profile <ExternalLink size={12} aria-hidden="true" />
                            </a>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : !busy && !error ? (
              <div className="rounded-md border border-dashed border-black/15 px-4 py-5 text-center">
                <p className="text-sm font-medium text-black/65">
                  {searched && placesConfigured ? "No matching businesses were returned." : "Search by niche and place to build your radar."}
                </p>
                <p className="mt-1 text-xs leading-5 text-black/60">
                  {searched && placesConfigured ? "Try a broader niche, nearby town, or the business name." : "Try “dentists in Lichfield” or a specific business name."}
                </p>
                <button type="button" onClick={onScoutManually} className="mt-3 text-xs font-semibold text-[#166a64] underline underline-offset-4">Add one manually instead</button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-start gap-2 border-t border-black/10 pt-4 text-xs leading-5 text-black/60">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#16877f]" aria-hidden="true" />
            <p>Google profile details stay live here. Aqua stores the Place ID and only the CRM facts and research you explicitly enter and verify.</p>
          </div>
        </div>

        <div className="min-h-[22rem] border-t border-black/10 bg-[#f3f1ec] xl:min-h-[38rem] xl:border-l xl:border-t-0">
          {mapSrc ? (
            <iframe
              title={selected ? `Google Map preview for ${selected.displayName}` : `Google Maps business search for ${mapQuery}`}
              src={mapSrc}
              loading="lazy"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="h-full min-h-[22rem] w-full border-0 xl:min-h-[38rem]"
            />
          ) : (
            <div className="flex h-full min-h-[22rem] flex-col items-center justify-center px-6 text-center xl:min-h-[38rem]">
              <MapPin size={28} className="text-black/25" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-black/65">Google Maps preview needs its restricted embed key.</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-black/60">Until it is configured, open the same search in Google Maps and keep your scouting work in Aqua.</p>
              <a href={mapsSearchHref(mapQuery)} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65">
                Open Google Maps <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
