"use client";

// Video embed — Vimeo / YouTube / Loom / raw iframe. Differs from
// `video` (HTML5 <video> only) by handling 3rd-party-hosted streams.
// Provider auto-detect on URL paste so operators can paste any link
// without picking a provider.
//
// Sandbox: same-origin omitted by default (third-party iframes
// shouldn't read parent cookies). `allow-scripts allow-same-origin`
// only when caller opts via raw mode + a same-origin URL.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { detectVideoProvider, toEmbedUrl, type VideoProvider } from "../../lib/videoEmbed";

export default function VideoEmbedBlock({ block }: BlockRenderProps) {
  const url = (block.props.url as string | undefined) ?? "";
  const declaredProvider = block.props.provider as VideoProvider | undefined;
  const provider: VideoProvider = declaredProvider ?? detectVideoProvider(url);
  const aspectRatio = (block.props.aspectRatio as number | undefined) ?? 16 / 9;
  const autoplay = block.props.autoplay === true;
  const controls = block.props.controls !== false;
  const caption = block.props.caption as string | undefined;

  const wrapStyle: React.CSSProperties = {
    width: "100%",
    aspectRatio: String(aspectRatio),
    borderRadius: 8,
    overflow: "hidden",
    background: "#000",
    ...blockStylesToCss(block.styles),
  };

  if (!url) {
    return (
      <div data-block-type="video-embed" data-provider="empty" style={{ ...wrapStyle, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, border: "1px dashed rgba(255,255,255,0.15)" }}>
        Video — paste a Vimeo / YouTube / Loom URL
      </div>
    );
  }

  const embedUrl = toEmbedUrl(url, provider, { autoplay, controls });

  return (
    <figure data-block-type="video-embed" data-provider={provider} style={{ margin: 0 }}>
      <iframe
        src={embedUrl}
        title={caption ?? "Video"}
        style={{ ...wrapStyle, border: 0, display: "block" }}
        loading="lazy"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation"
      />
      {caption && (
        <figcaption style={{ fontSize: 12, opacity: 0.6, marginTop: 8, textAlign: "center" }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
