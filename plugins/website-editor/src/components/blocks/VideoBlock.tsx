"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

function youtubeEmbedUrl(url: string): string | null {
  // Accepts youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/embed/<id>.
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
  } catch {}
  return null;
}

export default function VideoBlock({ block }: BlockRenderProps) {
  const src = (block.props.src as string | undefined) ?? "";
  const autoplay = block.props.autoplay === true;
  const controls = block.props.controls !== false;
  const style = { width: "100%", aspectRatio: "16/9", borderRadius: 8, ...blockStylesToCss(block.styles) };
  if (!src) {
    return (
      <div data-block-type="video" style={{ ...style, background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
        Video — set source URL
      </div>
    );
  }
  const yt = youtubeEmbedUrl(src);
  if (yt) {
    return (
      <iframe
        data-block-type="video"
        src={`${yt}${autoplay ? "?autoplay=1&mute=1" : ""}`}
        title="Video"
        style={style}
        frameBorder={0}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return <video data-block-type="video" src={src} autoPlay={autoplay} controls={controls} style={style} muted={autoplay} playsInline />;
}
