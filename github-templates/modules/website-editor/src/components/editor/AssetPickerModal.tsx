"use client";

// R024 — Asset picker modal.
//
// Pulls from the per-install asset library; shows a grid + tag chip
// filter + search. Operator clicks "Use" → fires `onPick(url, asset)`
// so the host wires the URL into the block prop being edited (image
// src, hero coverImg, etc.). "+ Upload new" inline reads a File via
// `<input type="file">`, base64-encodes via FileReader, POSTs the
// upload endpoint, then re-loads.

import { useEffect, useMemo, useRef, useState } from "react";

interface Asset {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  dataUrl: string;
  alt?: string;
  tags?: string[];
  uploadedAt: number;
}

interface ListResp {
  ok: boolean;
  assets?: Asset[];
  tagCounts?: Record<string, number>;
  usedBytes?: number;
  capBytes?: number;
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (url: string, asset: Asset) => void;
  fetchImpl?: typeof fetch;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AssetPickerModal({ open, onClose, onPick, fetchImpl }: Props) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [usedBytes, setUsedBytes] = useState(0);
  const [capBytes, setCapBytes] = useState(0);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const f = fetchImpl ?? fetch;

  function load(): void {
    setError(null);
    f("/api/portal/website-editor/assets")
      .then(r => r.json() as Promise<ListResp>)
      .then(data => {
        if (!data.ok) { setError(data.error ?? "request failed"); return; }
        setAssets(data.assets ?? []);
        setTagCounts(data.tagCounts ?? {});
        setUsedBytes(data.usedBytes ?? 0);
        setCapBytes(data.capBytes ?? 0);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(() => {
    if (!open) return;
    load();
    setActiveTag(null);
    setQuery("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const tags = useMemo(() => Object.entries(tagCounts).sort((a, b) => b[1] - a[1]), [tagCounts]);

  const filtered = useMemo(() => {
    if (!assets) return [];
    let out = assets;
    if (activeTag) out = out.filter(a => (a.tags ?? []).includes(activeTag));
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      out = out.filter(a =>
        `${a.filename} ${(a.tags ?? []).join(" ")} ${a.alt ?? ""}`.toLowerCase().includes(needle),
      );
    }
    return out;
  }, [assets, activeTag, query]);

  async function uploadFile(file: File): Promise<void> {
    setUploading(true); setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(file);
      });
      const res = await f("/api/portal/website-editor/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          dataUrl,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; asset?: Asset };
      if (!data.ok) { setError(data.error ?? "upload failed"); return; }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  if (!open) return null;

  return (
    <div role="dialog" aria-label="Asset library"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div style={{
        width: 980, maxWidth: "96vw", height: "82vh",
        background: "var(--brand-bg-elevated, #0b1220)",
        border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
        borderRadius: "var(--brand-radius-md, 12px)",
        display: "flex", flexDirection: "column",
        color: "var(--brand-text, #f5f3ec)", overflow: "hidden",
      }}>
        <header style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.06))",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Asset library</h2>
            <p style={{ fontSize: 11, color: "var(--brand-text-muted, rgba(255,255,255,0.55))", margin: 0 }}>
              {capBytes > 0
                ? `${fmtBytes(usedBytes)} of ${fmtBytes(capBytes)} used · ${assets?.length ?? 0} asset${(assets?.length ?? 0) === 1 ? "" : "s"}`
                : `${assets?.length ?? 0} asset${(assets?.length ?? 0) === 1 ? "" : "s"}`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close picker"
            style={{ background: "transparent", border: "none", color: "var(--brand-text-muted, rgba(255,255,255,0.55))", fontSize: 22, cursor: "pointer" }}
          >×</button>
        </header>

        <div style={{ padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.04))" }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, tag, alt…"
            style={{
              flex: 1, padding: "6px 10px", fontSize: 12,
              background: "var(--brand-bg, rgba(0,0,0,0.4))",
              border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
              borderRadius: "var(--brand-radius-sm, 4px)",
              color: "var(--brand-text, currentColor)",
            }}
          />
          <input ref={inputRef} type="file" onChange={onFile} style={{ display: "none" }} />
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            style={{
              padding: "6px 12px", fontSize: 12,
              background: "var(--brand-primary, rgba(56,189,248,0.2))",
              color: "var(--brand-text, #fff)",
              border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
              borderRadius: "var(--brand-radius-sm, 6px)",
              cursor: "pointer",
              opacity: uploading ? 0.6 : 1,
            }}>
            {uploading ? "Uploading…" : "+ Upload new"}
          </button>
        </div>

        <div style={{ padding: "8px 16px", display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.04))" }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--brand-text-muted, rgba(255,255,255,0.45))", marginRight: 4 }}>Tag:</span>
          <button onClick={() => setActiveTag(null)}
            style={chipStyle(activeTag === null)}>All</button>
          {tags.map(([t, count]) => (
            <button key={t} onClick={() => setActiveTag(t === activeTag ? null : t)}
              style={chipStyle(activeTag === t)}>
              {t} <span style={{ opacity: 0.6, marginLeft: 4 }}>{count}</span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {error && <p style={{ color: "#fca5a5", fontSize: 12 }}>{error}</p>}
          {assets === null && !error && <p style={{ color: "var(--brand-text-muted, rgba(255,255,255,0.55))", fontSize: 12 }}>Loading…</p>}
          {assets !== null && filtered.length === 0 && !error && (
            <p style={{ color: "var(--brand-text-muted, rgba(255,255,255,0.55))", fontSize: 12 }}>
              {(assets.length === 0) ? "No assets uploaded yet." : "No assets match."}
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {filtered.map(a => (
              <button key={a.id} onClick={() => onPick(a.dataUrl, a)}
                style={{
                  textAlign: "left", padding: 0, overflow: "hidden",
                  background: "var(--brand-bg, rgba(255,255,255,0.02))",
                  border: "1px solid var(--brand-border, rgba(255,255,255,0.08))",
                  borderRadius: "var(--brand-radius-sm, 6px)",
                  cursor: "pointer",
                  color: "var(--brand-text, currentColor)",
                }}>
                <div style={{ aspectRatio: "1 / 1", background: "rgba(0,0,0,0.4)" }}>
                  {a.contentType.startsWith("image/")
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={a.dataUrl} alt={a.alt ?? a.filename}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{
                        width: "100%", height: "100%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, color: "var(--brand-text-muted, rgba(255,255,255,0.5))",
                      }}>{a.contentType.split("/")[1] ?? "file"}</div>}
                </div>
                <div style={{ padding: 8 }}>
                  <p style={{ fontSize: 11, margin: 0, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.filename}
                  </p>
                  <p style={{ fontSize: 10, color: "var(--brand-text-muted, rgba(255,255,255,0.55))", margin: "2px 0 0 0" }}>
                    {fmtBytes(a.size)}
                  </p>
                  {(a.tags && a.tags.length > 0) && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                      {a.tags.slice(0, 3).map(t => (
                        <span key={t} style={{
                          fontSize: 9, padding: "1px 5px",
                          background: "rgba(255,255,255,0.06)",
                          borderRadius: 999,
                        }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "3px 8px", fontSize: 11,
    background: active ? "var(--brand-primary, rgba(56,189,248,0.18))" : "var(--brand-bg, rgba(255,255,255,0.05))",
    color: active ? "var(--brand-text, #fff)" : "var(--brand-text-muted, rgba(255,255,255,0.65))",
    border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
    borderRadius: "var(--brand-radius-sm, 4px)",
    cursor: "pointer",
  };
}
