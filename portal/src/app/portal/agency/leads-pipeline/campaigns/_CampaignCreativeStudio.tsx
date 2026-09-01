"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  ImagePlus,
  LayoutTemplate,
  MessageCircle,
  Monitor,
  Move,
  Play,
  Send,
  Smartphone,
  Upload,
} from "lucide-react";

export type CampaignPlacement =
  | "instagram-feed"
  | "instagram-story"
  | "instagram-reel"
  | "facebook-feed"
  | "facebook-story"
  | "linkedin-feed"
  | "google-display";

export interface CampaignCreativeAsset {
  id?: string;
  fileName: string;
  contentType: string;
  size: number;
  storageProvider: "supabase" | "vercel-blob" | "local";
  storageKey: string;
}

export interface CampaignCreative {
  asset?: CampaignCreativeAsset;
  brandName?: string;
  accountHandle?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  callToAction?: string;
  destinationUrl?: string;
  placements: CampaignPlacement[];
  mediaFit?: "cover" | "contain";
  focalX?: number;
  focalY?: number;
  overlayTone?: "light" | "dark";
  showSafeAreas?: boolean;
}

interface PlacementDefinition {
  label: string;
  shortLabel: string;
  platform: string;
  dimensions: string;
  width: number;
  height: number;
  kind: "feed" | "story" | "display";
}

const PLACEMENTS: Record<CampaignPlacement, PlacementDefinition> = {
  "instagram-feed": { label: "Instagram feed", shortLabel: "IG feed", platform: "Instagram", dimensions: "1080 × 1350", width: 4, height: 5, kind: "feed" },
  "instagram-story": { label: "Instagram story", shortLabel: "IG story", platform: "Instagram", dimensions: "1080 × 1920", width: 9, height: 16, kind: "story" },
  "instagram-reel": { label: "Instagram reel", shortLabel: "IG reel", platform: "Instagram", dimensions: "1080 × 1920", width: 9, height: 16, kind: "story" },
  "facebook-feed": { label: "Facebook feed", shortLabel: "FB feed", platform: "Facebook", dimensions: "1080 × 1350", width: 4, height: 5, kind: "feed" },
  "facebook-story": { label: "Facebook story", shortLabel: "FB story", platform: "Facebook", dimensions: "1080 × 1920", width: 9, height: 16, kind: "story" },
  "linkedin-feed": { label: "LinkedIn feed", shortLabel: "LinkedIn", platform: "LinkedIn", dimensions: "1200 × 1200", width: 1, height: 1, kind: "feed" },
  "google-display": { label: "Google display", shortLabel: "Display", platform: "Google display", dimensions: "1200 × 628", width: 1200, height: 628, kind: "display" },
};

const ALL_PLACEMENTS = Object.keys(PLACEMENTS) as CampaignPlacement[];

export function createEmptyCampaignCreative(channel = "meta-ads"): CampaignCreative {
  return {
    brandName: "AquaOasis-Web",
    accountHandle: "@aquaoasisweb",
    primaryText: "Make the first impression count.",
    headline: "Built to get noticed",
    description: "Clear creative, made for the people you want to reach.",
    callToAction: "Learn more",
    destinationUrl: "",
    placements: placementDefaultsForChannel(channel),
    mediaFit: "cover",
    focalX: 50,
    focalY: 50,
    overlayTone: "light",
    showSafeAreas: true,
  };
}

export function placementDefaultsForChannel(channel: string): CampaignPlacement[] {
  if (channel === "google-ads") return ["google-display"];
  if (channel === "linkedin-ads") return ["linkedin-feed"];
  if (channel === "meta-ads") return ["instagram-feed", "instagram-story", "facebook-feed"];
  if (channel === "organic") return ["instagram-feed", "instagram-story", "linkedin-feed"];
  return ["instagram-feed", "instagram-story", "facebook-feed"];
}

export function campaignAssetUrl(asset?: CampaignCreativeAsset): string | undefined {
  if (!asset) return undefined;
  const params = new URLSearchParams({
    provider: asset.storageProvider,
    key: asset.storageKey,
    type: asset.contentType,
    name: asset.fileName,
  });
  return `/api/portal/marketing/campaign-assets/content?${params.toString()}`;
}

export function CampaignCreativeStudio({
  value,
  onChange,
  channel,
  compact = false,
}: {
  value: CampaignCreative;
  onChange: (creative: CampaignCreative) => void;
  channel: string;
  compact?: boolean;
}) {
  const availablePlacements = useMemo(() => placementsForChannel(channel), [channel]);
  const selectedPlacements = value.placements.length ? value.placements : placementDefaultsForChannel(channel);
  const [activePlacement, setActivePlacement] = useState<CampaignPlacement>(selectedPlacements[0] ?? availablePlacements[0]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedPlacements.includes(activePlacement)) {
      setActivePlacement(selectedPlacements[0] ?? availablePlacements[0]);
    }
  }, [activePlacement, availablePlacements, selectedPlacements]);

  const active = PLACEMENTS[activePlacement];
  const imageUrl = campaignAssetUrl(value.asset);

  function patch(patchValue: Partial<CampaignCreative>) {
    onChange({ ...value, ...patchValue });
  }

  function togglePlacement(placement: CampaignPlacement) {
    const selected = selectedPlacements.includes(placement);
    const next = selected
      ? selectedPlacements.filter(item => item !== placement)
      : [...selectedPlacements, placement];
    if (next.length === 0) return;
    patch({ placements: next });
    if (!selected) setActivePlacement(placement);
  }

  function movePreview(direction: -1 | 1) {
    const currentIndex = selectedPlacements.indexOf(activePlacement);
    const nextIndex = (currentIndex + direction + selectedPlacements.length) % selectedPlacements.length;
    setActivePlacement(selectedPlacements[nextIndex]);
  }

  async function uploadAsset(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/portal/marketing/campaign-assets/upload", { method: "POST", body });
      const data = await response.json() as { ok?: boolean; error?: string; asset?: CampaignCreativeAsset };
      if (!response.ok || !data.ok || !data.asset) throw new Error(data.error ?? "Could not upload this image.");
      patch({ asset: data.asset });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className={`mt-5 border-t border-black/10 pt-5 ${compact ? "" : "campaign-creative-studio"}`} data-testid="campaign-creative-studio">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Creative studio</p>
          <h2 className="mt-1 text-lg font-semibold text-black/90">Build it, then see every placement.</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">One asset and message, previewed at real platform proportions. Safe-area guides show where controls can cover your creative.</p>
        </div>
        <div className="inline-flex rounded-md border border-black/10 bg-white p-1">
          <button type="button" onClick={() => movePreview(-1)} className="grid size-9 place-items-center rounded-md text-black/60 hover:bg-black/[0.04]" aria-label="Previous placement"><ChevronLeft size={17} /></button>
          <button type="button" onClick={() => movePreview(1)} className="grid size-9 place-items-center rounded-md text-black/60 hover:bg-black/[0.04]" aria-label="Next placement"><ChevronRight size={17} /></button>
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2" aria-label="Campaign placements">
        {availablePlacements.map(placement => {
          const selected = selectedPlacements.includes(placement);
          const previewing = placement === activePlacement;
          return (
            <button
              key={placement}
              type="button"
              onClick={() => selected ? setActivePlacement(placement) : togglePlacement(placement)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${previewing ? "border-black bg-black text-white" : selected ? "border-brand/30 bg-brand/[0.06] text-black/70" : "border-black/10 bg-white text-black/45 hover:border-black/25"}`}
            >
              {PLACEMENTS[placement].kind === "story" ? <Smartphone size={15} /> : <Monitor size={15} />}
              {PLACEMENTS[placement].shortLabel}
              {selected && !previewing ? <Check size={13} /> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid items-start gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
        <div className="grid gap-4">
          <div className="rounded-md border border-black/10 bg-black/[0.018] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-black/75">Creative asset</div>
                <div className="mt-0.5 text-[11px] text-black/45">JPG, PNG, WebP or GIF · 20 MB max</div>
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/70 hover:bg-black/[0.03] disabled:opacity-50">
                {uploading ? <span className="size-3 animate-spin rounded-full border-2 border-black/20 border-t-black/70" /> : <Upload size={14} />}
                {value.asset ? "Replace" : "Upload"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadAsset(file); }} />
            </div>
            {value.asset ? <div className="mt-3 flex items-center gap-3 rounded-md border border-black/8 bg-white p-2">
              <div className="size-14 overflow-hidden rounded-md bg-black/[0.04]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="Campaign asset thumbnail" className="size-full object-cover" />
              </div>
              <div className="min-w-0"><div className="truncate text-xs font-semibold text-black/75">{value.asset.fileName}</div><div className="mt-1 text-[11px] text-black/45">{formatFileSize(value.asset.size)}</div></div>
            </div> : <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-3 grid min-h-28 w-full place-items-center rounded-md border border-dashed border-black/15 bg-white text-black/40 hover:border-black/30 hover:text-black/60"><span className="flex flex-col items-center gap-2 text-xs"><ImagePlus size={21} />Add campaign artwork, a menu or a photo</span></button>}
            {uploadError ? <p className="mt-2 text-xs text-red-700">{uploadError}</p> : null}
          </div>

          <div className="grid gap-3 rounded-md border border-black/10 bg-white p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-black/75"><LayoutTemplate size={15} />Content</div>
            <Input label="Display name" value={value.brandName ?? ""} onChange={brandName => patch({ brandName })} placeholder="AquaOasis-Web" />
            <Input label="Account handle" value={value.accountHandle ?? ""} onChange={accountHandle => patch({ accountHandle })} placeholder="@yourbusiness" />
            <TextArea label="Primary text" value={value.primaryText ?? ""} onChange={primaryText => patch({ primaryText })} rows={3} placeholder="The main message people will read." />
            <Input label="Headline" value={value.headline ?? ""} onChange={headline => patch({ headline })} placeholder="A clear reason to stop" />
            <Input label="Description" value={value.description ?? ""} onChange={description => patch({ description })} placeholder="Supporting detail" />
            <label className="text-[11px] font-medium text-black/55">Call to action<select value={value.callToAction ?? "Learn more"} onChange={event => patch({ callToAction: event.target.value })} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black/80"><option>Learn more</option><option>Book now</option><option>Contact us</option><option>Get quote</option><option>Shop now</option><option>Sign up</option><option>Apply now</option></select></label>
            <Input label="Destination" value={value.destinationUrl ?? ""} onChange={destinationUrl => patch({ destinationUrl })} placeholder="https://..." />
          </div>

          <div className="grid gap-3 rounded-md border border-black/10 bg-white p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-black/75"><Move size={15} />Media position</div>
            <div className="grid grid-cols-2 gap-2">
              {(["cover", "contain"] as const).map(fit => <button key={fit} type="button" onClick={() => patch({ mediaFit: fit })} className={`min-h-9 rounded-md border text-xs font-semibold capitalize ${value.mediaFit === fit ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/55"}`}>{fit}</button>)}
            </div>
            <Range label="Horizontal focal point" value={value.focalX ?? 50} onChange={focalX => patch({ focalX })} />
            <Range label="Vertical focal point" value={value.focalY ?? 50} onChange={focalY => patch({ focalY })} />
            <button type="button" onClick={() => patch({ showSafeAreas: !value.showSafeAreas })} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold ${value.showSafeAreas ? "border-brand/30 bg-brand/[0.07] text-brand" : "border-black/10 text-black/55"}`}><Eye size={14} />Safe-area guides {value.showSafeAreas ? "on" : "off"}</button>
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-black/10 bg-[#f1f2f4] p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><div className="text-xs font-semibold text-black/75">{active.label}</div><div className="text-[11px] text-black/45">{active.dimensions} recommended</div></div>
            <span className="rounded-md border border-black/10 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-black/45">Live preview</span>
          </div>
          <PlacementPreview creative={value} placement={activePlacement} imageUrl={imageUrl} />
          <p className="mt-3 text-center text-[11px] leading-5 text-black/45">Platform interfaces change over time. This uses the correct creative proportions and practical safe zones so you can approve composition before publishing.</p>
        </div>
      </div>
    </section>
  );
}

function PlacementPreview({ creative, placement, imageUrl }: { creative: CampaignCreative; placement: CampaignPlacement; imageUrl?: string }) {
  const definition = PLACEMENTS[placement];
  if (definition.kind === "story") return <StoryPreview creative={creative} definition={definition} imageUrl={imageUrl} placement={placement} />;
  if (definition.kind === "display") return <DisplayPreview creative={creative} definition={definition} imageUrl={imageUrl} />;
  return <FeedPreview creative={creative} definition={definition} imageUrl={imageUrl} />;
}

function FeedPreview({ creative, definition, imageUrl }: { creative: CampaignCreative; definition: PlacementDefinition; imageUrl?: string }) {
  return <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-md border border-black/10 bg-white shadow-sm">
    <div className="flex items-center gap-2 px-3 py-2.5"><span className="grid size-8 place-items-center rounded-full bg-black text-[11px] font-bold text-white">{initials(creative.brandName)}</span><div className="min-w-0"><div className="truncate text-xs font-semibold text-black/85">{creative.brandName || "Your business"}</div><div className="truncate text-[10px] text-black/45">{creative.accountHandle || definition.platform}</div></div><span className="ml-auto text-sm text-black/50">•••</span></div>
    <div className="px-3 pb-2 text-xs leading-5 text-black/75">{creative.primaryText || "Your primary message appears here."}</div>
    <Media creative={creative} imageUrl={imageUrl} aspect={`${definition.width} / ${definition.height}`} />
    <div className="flex items-center gap-4 px-3 py-2.5 text-black/75"><Heart size={19} /><MessageCircle size={18} /><Send size={18} /><Bookmark size={18} className="ml-auto" /></div>
    <div className="border-t border-black/8 px-3 py-3"><div className="text-sm font-semibold text-black/85">{creative.headline || "Your headline"}</div><div className="mt-1 text-xs text-black/50">{creative.description || "Supporting information for the advert."}</div><button type="button" className="mt-3 min-h-9 w-full rounded-md bg-[#eef0f3] px-3 text-xs font-semibold text-black/75">{creative.callToAction || "Learn more"}</button></div>
  </div>;
}

function StoryPreview({ creative, definition, imageUrl, placement }: { creative: CampaignCreative; definition: PlacementDefinition; imageUrl?: string; placement: CampaignPlacement }) {
  const light = creative.overlayTone !== "dark";
  return <div className="mx-auto w-full max-w-[350px] overflow-hidden rounded-md bg-black shadow-lg" style={{ aspectRatio: `${definition.width} / ${definition.height}` }}>
    <div className="relative size-full">
      <Media creative={creative} imageUrl={imageUrl} fill />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/65" />
      {creative.showSafeAreas ? <><div className="pointer-events-none absolute inset-x-3 top-[12%] border-t border-dashed border-white/65"><span className="absolute -top-5 right-0 text-[9px] font-semibold uppercase tracking-wide text-white/75">Safe area</span></div><div className="pointer-events-none absolute inset-x-3 bottom-[18%] border-t border-dashed border-white/65"><span className="absolute right-0 top-1 text-[9px] font-semibold uppercase tracking-wide text-white/75">Controls below</span></div></> : null}
      <div className="absolute inset-x-0 top-0 p-3 text-white"><div className="mb-3 h-0.5 overflow-hidden rounded-full bg-white/35"><div className="h-full w-2/5 bg-white" /></div><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full border border-white/60 bg-black/50 text-[10px] font-bold">{initials(creative.brandName)}</span><div><div className="text-xs font-semibold">{creative.brandName || "Your business"}</div><div className="text-[9px] text-white/75">Sponsored</div></div><span className="ml-auto text-sm">•••</span></div></div>
      <div className={`absolute inset-x-5 bottom-[20%] ${light ? "text-white" : "text-black"}`}><div className="text-xl font-bold leading-tight sm:text-2xl">{creative.headline || "Your headline"}</div><div className="mt-2 text-xs leading-5 opacity-90">{creative.primaryText || creative.description || "Your message appears here."}</div></div>
      {placement === "instagram-reel" ? <div className="absolute right-3 top-1/2 grid -translate-y-1/2 gap-4 text-white"><Heart size={20} /><MessageCircle size={19} /><Send size={19} /><Play size={19} /></div> : null}
      <div className="absolute inset-x-4 bottom-4 rounded-md bg-white px-4 py-3 text-center text-xs font-semibold text-black/85">{creative.callToAction || "Learn more"}</div>
    </div>
  </div>;
}

function DisplayPreview({ creative, definition, imageUrl }: { creative: CampaignCreative; definition: PlacementDefinition; imageUrl?: string }) {
  return <div className="mx-auto w-full max-w-[760px] overflow-hidden rounded-md border border-black/10 bg-white shadow-sm">
    <div className="relative" style={{ aspectRatio: `${definition.width} / ${definition.height}` }}><Media creative={creative} imageUrl={imageUrl} fill /><div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/30 to-transparent" /><div className="absolute inset-y-0 left-0 flex max-w-[65%] flex-col justify-center p-5 text-white sm:p-8"><div className="text-[10px] font-semibold uppercase tracking-wide text-white/70">{creative.brandName || "Your business"}</div><div className="mt-2 text-xl font-bold leading-tight sm:text-3xl">{creative.headline || "Your headline"}</div><div className="mt-2 line-clamp-2 text-xs leading-5 text-white/80 sm:text-sm">{creative.description || creative.primaryText || "Supporting information for the advert."}</div><span className="mt-4 w-fit rounded-md bg-white px-4 py-2 text-xs font-semibold text-black">{creative.callToAction || "Learn more"}</span></div></div>
    <div className="flex items-center justify-between gap-3 border-t border-black/8 px-3 py-2 text-[10px] text-black/45"><span>Ad · {creative.destinationUrl ? safeHost(creative.destinationUrl) : "yourwebsite.com"}</span><span>Google display preview</span></div>
  </div>;
}

function Media({ creative, imageUrl, aspect, fill = false }: { creative: CampaignCreative; imageUrl?: string; aspect?: string; fill?: boolean }) {
  const className = fill ? "absolute inset-0 size-full" : "relative w-full";
  return <div className={`${className} overflow-hidden bg-[#dfe2e6]`} style={aspect ? { aspectRatio: aspect } : undefined}>{imageUrl ? <>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={imageUrl} alt="Campaign preview" className="size-full" style={{ objectFit: creative.mediaFit ?? "cover", objectPosition: `${creative.focalX ?? 50}% ${creative.focalY ?? 50}%` }} />
  </> : <div className="grid size-full place-items-center text-black/35"><span className="flex flex-col items-center gap-2 text-xs"><ImagePlus size={28} />Upload artwork to preview it here</span></div>}</div>;
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="text-[11px] font-medium text-black/55">{label}<input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm text-black/80" /></label>;
}

function TextArea({ label, value, onChange, placeholder, rows }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows: number }) {
  return <label className="text-[11px] font-medium text-black/55">{label}<textarea value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} rows={rows} className="mt-1 w-full resize-y rounded-md border border-black/10 px-3 py-2 text-sm leading-5 text-black/80" /></label>;
}

function Range({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-[11px] font-medium text-black/55"><span className="flex items-center justify-between gap-2"><span>{label}</span><span className="tabular-nums text-black/40">{value}%</span></span><input type="range" min="0" max="100" value={value} onChange={event => onChange(Number(event.target.value))} className="mt-2 w-full accent-black" /></label>;
}

function placementsForChannel(channel: string): CampaignPlacement[] {
  if (channel === "google-ads") return ["google-display"];
  if (channel === "linkedin-ads") return ["linkedin-feed"];
  if (channel === "meta-ads") return ["instagram-feed", "instagram-story", "instagram-reel", "facebook-feed", "facebook-story"];
  return ALL_PLACEMENTS;
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(value?: string): string {
  const words = (value || "Business").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => word[0]?.toUpperCase()).join("") || "B";
}

function safeHost(value: string): string {
  try { return new URL(value).hostname; } catch { return value.replace(/^https?:\/\//, "").split("/")[0] || "yourwebsite.com"; }
}
