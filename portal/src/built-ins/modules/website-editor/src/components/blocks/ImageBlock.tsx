"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

// Derive a sensible alt from a filename — `wedding-rings_2024.png` →
// `wedding rings 2024`. Used when the admin hasn't set an alt but has
// uploaded an image whose filename describes it. Bonus SEO + better
// fallback for screen readers than an empty alt.
function altFromUrl(src: string): string {
  if (!src) return "";
  // data URLs don't have a filename — bail out.
  if (src.startsWith("data:")) return "";
  try {
    const u = new URL(src, "https://placeholder.example");
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const noExt = last.replace(/\.[a-z0-9]+$/i, "");
    return noExt.replace(/[-_]+/g, " ").trim();
  } catch {
    return "";
  }
}

export default function ImageBlock({ block }: BlockRenderProps) {
  const src = (block.props.src as string | undefined) ?? "";
  const explicitAlt = (block.props.alt as string | undefined) ?? "";
  const filenameForSeo = block.props.filenameForSeo !== false;
  const title = (block.props.title as string | undefined) ?? "";
  const width = (block.props.width as string | undefined) ?? "100%";
  const href = (block.props.href as string | undefined) ?? "";

  const alt = explicitAlt || (filenameForSeo ? altFromUrl(src) : "");
  const style = { width, height: "auto", display: "block", borderRadius: 0, ...blockStylesToCss(block.styles) };

  if (!src) {
    return (
      <div data-block-type="image" style={{ width, aspectRatio: "16/9", background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, borderRadius: 8, ...blockStylesToCss(block.styles) }}>
        Image — set source URL
      </div>
    );
  }

  /* eslint-disable-next-line @next/next/no-img-element */
  const img = <img data-block-type="image" src={src} alt={alt} title={title || undefined} style={style} loading="lazy" />;
  if (href) {
    return <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" style={{ display: "block" }}>{img}</a>;
  }
  return img;
}
