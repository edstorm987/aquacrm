"use client";

// PageDetailPage — per-page settings + block editor for a single
// CustomPage (the localStorage block system distinct from EditorPage).
// Faithful port of `02/src/app/admin/pages/[id]/page.tsx`.
//
// Round-4 lift. The customPages backend was lifted to
// `lib/customPages.ts` in Goal B of this round; this page consumes
// it directly. RichEditor is currently a textarea shim
// (`components/RichEditor.tsx`) — swap when T1 or a text-editing
// plugin ships a real WYSIWYG.

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getCustomPage,
  updateCustomPage,
  addCustomBlock,
  updateCustomBlock,
  deleteCustomBlock,
  moveCustomBlock,
  publishCustomPage,
  unpublishCustomPage,
  deleteCustomPage,
  toggleCustomPageHidden,
  duplicateCustomPage,
  onCustomPagesChange,
  type CustomPage,
  type CustomPageBlock,
  type CustomPageBlockType,
} from "../lib/customPages";
import RichEditor from "../components/RichEditor";
import { confirm } from "../lib/confirm";
import { notify } from "../lib/notify";
import AdminTabs from "../components/AdminTabs";
import { CONTENT_TABS } from "../lib/tabSets";
import PluginRequired from "../lib/pluginRequired";

const BLOCK_TYPES: { type: CustomPageBlockType; label: string }[] = [
  { type: "hero",     label: "Hero" },
  { type: "richText", label: "Rich text" },
  { type: "image",    label: "Image" },
  { type: "gallery",  label: "Gallery" },
  { type: "quote",    label: "Quote" },
  { type: "embed",    label: "Embed" },
  { type: "cta",      label: "CTA" },
  { type: "divider",  label: "Divider" },
  { type: "html",     label: "Raw HTML" },
];

export default function PageDetailPage(_props: unknown) {
  return (
    <PluginRequired plugin="website-editor">
      <PageDetailInner />
    </PluginRequired>
  );
}

function PageDetailInner() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const id = ((params?.id as string | undefined) ?? search?.get("pageId") ?? "");
  const [page, setPage] = useState<CustomPage | null>(null);

  useEffect(() => {
    const refresh = () => setPage(getCustomPage(id));
    refresh();
    return onCustomPagesChange(refresh);
  }, [id]);

  if (!page) {
    return (
      <div className="p-6 sm:p-8 lg:p-10 max-w-3xl">
        <AdminTabs tabs={CONTENT_TABS} ariaLabel="Content" />
        <Link href="../pages" className="text-[11px] text-brand-cream/40 hover:text-brand-cream">← Pages</Link>
        <p className="mt-6 text-brand-cream/60">Page not found.</p>
      </div>
    );
  }

  function patch(p: Partial<CustomPage>) { if (page) updateCustomPage(page.id, p); }

  async function remove() {
    if (!page) return;
    const ok = await confirm({
      title: `Delete "${page.title}"?`,
      message: "This is a custom page (rendered at /p/[slug]). Deletion is permanent.",
      danger: true,
      confirmLabel: "Delete page",
    });
    if (!ok) return;
    deleteCustomPage(page.id);
    notify({ tone: "ok", title: "Page deleted" });
    router.push("../pages");
  }

  function dupe() {
    if (!page) return;
    const copy = duplicateCustomPage(page.id);
    if (copy) {
      notify({ tone: "ok", title: "Duplicated", message: `"${copy.title}"` });
      router.push(`?pageId=${encodeURIComponent(copy.id)}`);
    }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-4xl space-y-5">
      <AdminTabs tabs={CONTENT_TABS} ariaLabel="Content" />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link href="../pages" className="text-[11px] text-brand-cream/40 hover:text-brand-cream">← Pages</Link>
        <div className="flex items-center gap-2">
          {page.hidden && <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-white/10 text-brand-cream/40">hidden</span>}
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${page.status === "published" ? "bg-green-400/20 text-green-300" : "bg-white/10 text-brand-cream/55"}`}>{page.status}</span>
          <button
            onClick={() => toggleCustomPageHidden(page.id)}
            className="text-[11px] px-2.5 py-0.5 rounded-full border border-white/15 text-brand-cream/50 hover:text-brand-cream"
          >
            {page.hidden ? "👁 Show" : "🫥 Hide"}
          </button>
          <button onClick={dupe} className="text-[11px] px-2.5 py-0.5 rounded-full border border-white/15 text-brand-cream/65 hover:text-brand-cream">
            Duplicate
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <input
          value={page.title}
          onChange={e => setPage({ ...page, title: e.target.value })}
          onBlur={() => patch({ title: page.title })}
          className="w-full bg-transparent border-0 text-3xl sm:text-4xl font-display font-bold text-brand-cream focus:outline-none"
        />
        <input
          value={page.slug}
          onChange={e => setPage({ ...page, slug: e.target.value })}
          onBlur={() => patch({ slug: page.slug })}
          className="w-full bg-transparent border-0 text-xs text-brand-cream/40 font-mono focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3 text-xs text-brand-cream/55">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={page.showInNav} onChange={e => patch({ showInNav: e.target.checked })} className="accent-brand-orange" />
            Show in navigation
          </label>
          {page.showInNav && (
            <input
              value={page.navLabel ?? page.title}
              onChange={e => setPage({ ...page, navLabel: e.target.value })}
              onBlur={() => patch({ navLabel: page.navLabel })}
              placeholder="Nav label"
              className="bg-brand-black border border-white/10 rounded px-2 py-1 text-xs"
            />
          )}
        </div>
      </div>

      {/* Blocks */}
      <div className="space-y-3">
        {page.blocks.map((block, i) => (
          <BlockEditor
            key={block.id}
            pageId={page.id}
            block={block}
            canUp={i > 0}
            canDown={i < page.blocks.length - 1}
          />
        ))}
      </div>

      {/* Add block */}
      <div className="rounded-xl border border-dashed border-white/15 p-3">
        <p className="text-[11px] tracking-widest uppercase text-brand-cream/45 mb-2">Add block</p>
        <div className="flex flex-wrap gap-1.5">
          {BLOCK_TYPES.map(b => (
            <button
              key={b.type}
              onClick={() => addCustomBlock(page.id, b.type)}
              className="text-[11px] px-3 py-1.5 rounded-md border border-white/10 text-brand-cream/70 hover:border-brand-orange/40 hover:text-brand-orange"
            >
              + {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* SEO */}
      <details className="rounded-2xl border border-white/8 bg-brand-black-card overflow-hidden">
        <summary className="cursor-pointer px-5 py-3 border-b border-white/5 bg-brand-black-soft/40 text-xs tracking-[0.22em] uppercase text-brand-cream/60 list-none">SEO &amp; sharing</summary>
        <div className="p-5 space-y-3 text-sm">
          <Field label="Title">
            <input
              value={page.seo.title ?? ""}
              onChange={e => setPage({ ...page, seo: { ...page.seo, title: e.target.value } })}
              onBlur={() => patch({ seo: page.seo })}
              className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={page.seo.description ?? ""}
              onChange={e => setPage({ ...page, seo: { ...page.seo, description: e.target.value } })}
              onBlur={() => patch({ seo: page.seo })}
              rows={2}
              className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream"
            />
          </Field>
          <Field label="OG image">
            <input
              value={page.seo.ogImage ?? ""}
              onChange={e => setPage({ ...page, seo: { ...page.seo, ogImage: e.target.value } })}
              onBlur={() => patch({ seo: page.seo })}
              placeholder="https://… or media:…"
              className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-brand-cream"
            />
          </Field>
          <Field label="Canonical URL">
            <input
              value={page.seo.canonical ?? ""}
              onChange={e => setPage({ ...page, seo: { ...page.seo, canonical: e.target.value } })}
              onBlur={() => patch({ seo: page.seo })}
              className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-brand-cream"
            />
          </Field>
          <Field label="Robots">
            <input
              value={page.seo.robots ?? ""}
              onChange={e => setPage({ ...page, seo: { ...page.seo, robots: e.target.value } })}
              onBlur={() => patch({ seo: page.seo })}
              placeholder="index, follow"
              className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-brand-cream"
            />
          </Field>
          <Field label="JSON-LD">
            <textarea
              value={page.seo.jsonld ?? ""}
              onChange={e => setPage({ ...page, seo: { ...page.seo, jsonld: e.target.value } })}
              onBlur={() => patch({ seo: page.seo })}
              rows={4}
              spellCheck={false}
              className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-brand-cream"
            />
          </Field>
        </div>
      </details>

      {/* Footer */}
      <div className="sticky bottom-0 -mx-6 sm:-mx-8 lg:-mx-10 px-6 sm:px-8 lg:px-10 py-4 bg-brand-black-soft/95 backdrop-blur border-t border-white/8 flex items-center justify-between gap-3">
        <button onClick={remove} className="text-xs text-brand-cream/40 hover:text-brand-orange">Delete page</button>
        <div className="flex items-center gap-2">
          <Link href={`/p/${page.slug}`} target="_blank" className="text-xs px-3 py-2 rounded-lg border border-white/10 text-brand-cream/65 hover:text-brand-cream">
            Preview →
          </Link>
          {page.status === "published"
            ? <button onClick={() => unpublishCustomPage(page.id)} className="text-xs px-4 py-2 rounded-lg border border-white/15 text-brand-cream/75 hover:text-brand-cream">Unpublish</button>
            : <button onClick={() => publishCustomPage(page.id)} className="text-xs px-5 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-light text-white font-semibold">Publish</button>
          }
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] tracking-widest uppercase text-brand-cream/45">{label}</label>
      {children}
    </div>
  );
}

function BlockEditor({
  pageId, block, canUp, canDown,
}: {
  pageId: string;
  block: CustomPageBlock;
  canUp: boolean;
  canDown: boolean;
}) {
  const update = (patch: Partial<CustomPageBlock>) => updateCustomBlock(pageId, block.id, patch);
  return (
    <div className="rounded-xl border border-white/8 bg-brand-black-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-brand-black-soft/40">
        <span className="text-[11px] tracking-[0.22em] uppercase text-brand-cream/60">{block.type}</span>
        <div className="flex items-center gap-1 text-[11px]">
          <button disabled={!canUp} onClick={() => moveCustomBlock(pageId, block.id, -1)} className="px-1.5 text-brand-cream/40 hover:text-brand-cream disabled:opacity-25">↑</button>
          <button disabled={!canDown} onClick={() => moveCustomBlock(pageId, block.id, 1)} className="px-1.5 text-brand-cream/40 hover:text-brand-cream disabled:opacity-25">↓</button>
          <button onClick={() => deleteCustomBlock(pageId, block.id)} className="px-1.5 text-brand-cream/40 hover:text-brand-orange">×</button>
        </div>
      </div>
      <div className="p-4 space-y-2 text-sm">
        {block.type === "hero" && (
          <>
            <input value={block.eyebrow ?? ""} onChange={e => update({ eyebrow: e.target.value } as Partial<CustomPageBlock>)} placeholder="Eyebrow" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-xs" />
            <input value={block.title} onChange={e => update({ title: e.target.value } as Partial<CustomPageBlock>)} placeholder="Headline" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-base font-display" />
            <textarea value={block.intro ?? ""} onChange={e => update({ intro: e.target.value } as Partial<CustomPageBlock>)} rows={3} placeholder="Intro" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-xs" />
            <input value={block.image ?? ""} onChange={e => update({ image: e.target.value } as Partial<CustomPageBlock>)} placeholder="Image (path / media:id / url)" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-xs font-mono" />
          </>
        )}
        {block.type === "richText" && (
          <RichEditor value={block.html} onChange={html => update({ html } as Partial<CustomPageBlock>)} placeholder="Write here…" minHeight={220} />
        )}
        {block.type === "image" && (
          <>
            <input value={block.src} onChange={e => update({ src: e.target.value } as Partial<CustomPageBlock>)} placeholder="Image src" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-xs font-mono" />
            <input value={block.alt ?? ""} onChange={e => update({ alt: e.target.value } as Partial<CustomPageBlock>)} placeholder="Alt text" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-xs" />
            <input value={block.caption ?? ""} onChange={e => update({ caption: e.target.value } as Partial<CustomPageBlock>)} placeholder="Caption" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-xs" />
          </>
        )}
        {block.type === "gallery" && (
          <GalleryFields images={block.images} onChange={images => update({ images } as Partial<CustomPageBlock>)} />
        )}
        {block.type === "quote" && (
          <>
            <textarea value={block.quote} onChange={e => update({ quote: e.target.value } as Partial<CustomPageBlock>)} rows={3} placeholder="Quote" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-sm italic" />
            <input value={block.attribution ?? ""} onChange={e => update({ attribution: e.target.value } as Partial<CustomPageBlock>)} placeholder="Attribution" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-xs" />
          </>
        )}
        {block.type === "embed" && (
          <>
            <input value={block.url} onChange={e => update({ url: e.target.value } as Partial<CustomPageBlock>)} placeholder="YouTube / Vimeo / iframe URL" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-xs font-mono" />
            <input value={block.caption ?? ""} onChange={e => update({ caption: e.target.value } as Partial<CustomPageBlock>)} placeholder="Caption" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-xs" />
          </>
        )}
        {block.type === "cta" && (
          <>
            <input value={block.headline} onChange={e => update({ headline: e.target.value } as Partial<CustomPageBlock>)} placeholder="Headline" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-base font-display" />
            <input value={block.subhead ?? ""} onChange={e => update({ subhead: e.target.value } as Partial<CustomPageBlock>)} placeholder="Subhead" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-xs" />
            <div className="grid grid-cols-2 gap-2">
              <input value={block.buttonLabel} onChange={e => update({ buttonLabel: e.target.value } as Partial<CustomPageBlock>)} placeholder="Button label" className="bg-brand-black border border-white/10 rounded px-3 py-2 text-xs" />
              <input value={block.buttonHref} onChange={e => update({ buttonHref: e.target.value } as Partial<CustomPageBlock>)} placeholder="Button URL" className="bg-brand-black border border-white/10 rounded px-3 py-2 text-xs font-mono" />
            </div>
          </>
        )}
        {block.type === "divider" && <p className="text-[11px] text-brand-cream/40">Renders a horizontal rule.</p>}
        {block.type === "html" && (
          <textarea value={block.html} onChange={e => update({ html: e.target.value } as Partial<CustomPageBlock>)} rows={6} spellCheck={false} placeholder="<div>…</div>" className="w-full bg-brand-black border border-white/10 rounded px-3 py-2 text-xs font-mono" />
        )}
      </div>
    </div>
  );
}

function GalleryFields({
  images, onChange,
}: {
  images: { src: string; alt?: string }[];
  onChange: (next: { src: string; alt?: string }[]) => void;
}) {
  function update(i: number, patch: Partial<{ src: string; alt?: string }>) {
    const next = [...images];
    const cur = next[i];
    if (!cur) return;
    next[i] = { ...cur, ...patch };
    onChange(next);
  }
  return (
    <div className="space-y-2">
      {images.map((img, i) => (
        <div key={i} className="flex gap-2">
          <input value={img.src} onChange={e => update(i, { src: e.target.value })} placeholder="src" className="flex-1 bg-brand-black border border-white/10 rounded px-3 py-2 text-xs font-mono" />
          <input value={img.alt ?? ""} onChange={e => update(i, { alt: e.target.value })} placeholder="alt" className="w-32 bg-brand-black border border-white/10 rounded px-3 py-2 text-xs" />
          <button onClick={() => onChange(images.filter((_, j) => j !== i))} className="text-brand-cream/40 hover:text-brand-orange">×</button>
        </div>
      ))}
      <button onClick={() => onChange([...images, { src: "", alt: "" }])} className="text-[11px] px-3 py-1.5 rounded-md border border-brand-amber/30 text-brand-amber hover:bg-brand-amber/10">+ Image</button>
    </div>
  );
}
