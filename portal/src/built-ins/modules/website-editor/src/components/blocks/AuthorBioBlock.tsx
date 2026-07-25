"use client";

// Author bio block — typically on a blog post or About page.
// Avatar + name + role + short bio + optional social links.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface SocialLink { type: string; href: string }

export default function AuthorBioBlock({ block }: BlockRenderProps) {
  const name = (block.props.name as string | undefined) ?? "Felicia";
  const role = (block.props.role as string | undefined) ?? "Founder";
  const bio = (block.props.bio as string | undefined) ?? "Crafted Odo by Felicia from her Ghanaian heritage and three generations of skincare wisdom.";
  const avatarUrl = block.props.avatarUrl as string | undefined;
  const social = (block.props.social as SocialLink[] | undefined) ?? [];

  return (
    <aside data-block-type="author-bio" style={{ padding: "32px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{
        maxWidth: 760,
        margin: "0 auto",
        display: "flex",
        gap: 20,
        alignItems: "center",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: 20,
      }}>
        {avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={avatarUrl} alt={name} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--brand-accent, #ff6b35)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: "#fff" }}>
            {name.charAt(0)}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{name}</p>
          {role && <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{role}</p>}
          <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.85 }}>{bio}</p>
          {social.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", gap: 12 }}>
              {social.map((s, i) => (
                <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, opacity: 0.7, textDecoration: "underline" }}>
                  {s.type}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
