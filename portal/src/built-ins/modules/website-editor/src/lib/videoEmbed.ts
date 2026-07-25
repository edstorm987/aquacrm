// Pure helpers for the videoEmbed block — auto-detect provider from a
// pasted URL and rewrite to the canonical embed URL. Framework-free so
// the smoke harness can drive every branch without React.

export type VideoProvider = "vimeo" | "youtube" | "loom" | "raw";

const VIMEO_RE   = /(?:vimeo\.com)\/(?:video\/)?(\d+)/i;
const YOUTUBE_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/i;
const LOOM_RE    = /loom\.com\/(?:share|embed)\/([a-f0-9]{16,})/i;

export function detectVideoProvider(url: string): VideoProvider {
  if (!url) return "raw";
  if (VIMEO_RE.test(url)) return "vimeo";
  if (YOUTUBE_RE.test(url)) return "youtube";
  if (LOOM_RE.test(url)) return "loom";
  return "raw";
}

export interface ToEmbedOpts {
  autoplay?: boolean;
  controls?: boolean;
}

export function toEmbedUrl(url: string, provider: VideoProvider, opts: ToEmbedOpts = {}): string {
  const params = new URLSearchParams();
  if (opts.autoplay) {
    params.set("autoplay", "1");
    // Browsers require muted autoplay
    if (provider === "youtube" || provider === "vimeo") params.set("muted", "1");
  }
  if (opts.controls === false) {
    if (provider === "youtube") params.set("controls", "0");
    if (provider === "vimeo")   params.set("controls", "0");
  }
  const qs = params.toString();
  const tail = qs ? `?${qs}` : "";

  switch (provider) {
    case "vimeo": {
      const m = url.match(VIMEO_RE);
      if (!m?.[1]) return url;
      return `https://player.vimeo.com/video/${m[1]}${tail}`;
    }
    case "youtube": {
      const m = url.match(YOUTUBE_RE);
      if (!m?.[1]) return url;
      return `https://www.youtube.com/embed/${m[1]}${tail}`;
    }
    case "loom": {
      const m = url.match(LOOM_RE);
      if (!m?.[1]) return url;
      return `https://www.loom.com/embed/${m[1]}${tail}`;
    }
    case "raw":
    default:
      return url;
  }
}
