"use client";

// R017 — Team grid. Members rendered as cards with avatar / name /
// role / optional bio + social links.

import type { BlockRenderProps } from "../blockRegistry";

interface SocialLink { kind: "twitter" | "linkedin" | "instagram" | "email" | "website"; href: string }
interface Member { name: string; role?: string; bio?: string; avatarUrl?: string; socials?: SocialLink[] }

const SOCIAL_GLYPH: Record<SocialLink["kind"], string> = {
  twitter: "𝕏", linkedin: "in", instagram: "ig", email: "✉", website: "↗",
};

export default function TeamGridBlock({ block }: BlockRenderProps) {
  const heading = block.props.heading as string | undefined;
  const subheading = block.props.subheading as string | undefined;
  const columns = (block.props.columns as number | undefined) ?? 3;
  const members = (block.props.members as Member[] | undefined) ?? [];

  return (
    <section data-block-type="team-grid" style={{ padding: "48px 24px", color: "var(--brand-text, currentColor)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {(heading || subheading) && (
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            {heading && <h2 style={{ fontFamily: "var(--brand-font-heading, var(--font-playfair, Georgia, serif))", fontSize: 32, fontWeight: 700, marginBottom: 8 }}>{heading}</h2>}
            {subheading && <p style={{ color: "var(--brand-text-muted, rgba(255,255,255,0.55))", fontSize: 14 }}>{subheading}</p>}
          </div>
        )}
        {members.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--brand-text-muted, rgba(255,255,255,0.4))", fontSize: 13 }}>
            Add team members in the block&apos;s properties.
          </p>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(${columns >= 4 ? 200 : 240}px, 1fr))`,
            gap: 24,
          }}>
            {members.map((m, i) => (
              <article key={i} style={{
                textAlign: "center",
                background: "var(--brand-bg-elevated, rgba(255,255,255,0.02))",
                border: "1px solid var(--brand-border, rgba(255,255,255,0.08))",
                borderRadius: "var(--brand-radius-md, 12px)",
                padding: 20, display: "flex", flexDirection: "column", alignItems: "center",
              }}>
                {m.avatarUrl
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={m.avatarUrl} alt={m.name}
                      style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", marginBottom: 12 }} />
                  : <div style={{ width: 96, height: 96, borderRadius: "50%", background: "var(--brand-bg-elevated, rgba(255,255,255,0.08))", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, fontSize: 28, color: "var(--brand-text-muted, rgba(255,255,255,0.4))" }}>
                      {m.name.charAt(0).toUpperCase()}
                    </div>}
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, fontFamily: "var(--brand-font-heading, inherit)" }}>{m.name}</h3>
                {m.role && (
                  <p style={{ fontSize: 12, color: "var(--brand-primary, #0ea5e9)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>{m.role}</p>
                )}
                {m.bio && (
                  <p style={{ fontSize: 13, color: "var(--brand-text-muted, rgba(255,255,255,0.6))", lineHeight: 1.5, marginBottom: 12 }}>{m.bio}</p>
                )}
                {m.socials && m.socials.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                    {m.socials.map((s, j) => (
                      <a key={j} href={s.href} target="_blank" rel="noreferrer"
                        aria-label={s.kind}
                        style={{
                          width: 28, height: 28, borderRadius: "50%",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          background: "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
                          color: "var(--brand-text-muted, rgba(255,255,255,0.6))",
                          fontSize: 12, textDecoration: "none",
                        }}>{SOCIAL_GLYPH[s.kind]}</a>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
