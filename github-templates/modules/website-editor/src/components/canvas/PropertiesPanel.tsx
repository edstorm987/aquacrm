"use client";

// Right-hand properties panel — shows props + style controls for the
// currently-selected block. Updates flow back through onChange so the
// parent canvas can debounce-save the page.

import { useEffect, useState } from "react";
import type { Block, BlockA11y, BlockStyles, BlockVariant, SplitTestGroup } from "../../types/block";
import { getBlockDefinition, type PropField } from "../blockRegistry";
import { STYLE_FIELD_GROUPS } from "../blockStyles";
import AssetPicker from "../AssetPicker";
import { createGroup as createSplitTestGroup, listGroups as listSplitTestGroups, statusTone as splitTestStatusTone } from "../../lib/splitTests";
import { getActiveSiteId } from "../../lib/sites";

interface PropertiesPanelProps {
  block: Block | null;
  onPatch: (patch: Partial<Block>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

const INPUT = "w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-brand-orange/50";

export default function PropertiesPanel({ block, onPatch, onDuplicate, onRemove }: PropertiesPanelProps) {
  const [tab, setTab] = useState<"props" | "styles" | "a11y" | "split" | "code">("props");

  if (!block) {
    return (
      <aside className="w-72 shrink-0 border-l border-white/8 bg-brand-black-soft p-4 text-[12px] text-brand-cream/45 leading-relaxed hidden lg:block">
        Select a block on the canvas to edit its properties + styles.
      </aside>
    );
  }

  const def = getBlockDefinition(block.type);

  function setProp(key: string, value: unknown) {
    if (!block) return;
    onPatch({ props: { ...block.props, [key]: value } });
  }

  function setStyle<K extends keyof BlockStyles>(key: K, value: BlockStyles[K]) {
    if (!block) return;
    const styles = { ...(block.styles ?? {}) };
    if (value === "" || value === undefined) {
      delete styles[key];
    } else {
      styles[key] = value;
    }
    onPatch({ styles });
  }

  return (
    <aside className="lg:w-72 lg:shrink-0 lg:border-l lg:border-white/8 lg:relative lg:flex lg:flex-col fixed lg:static bottom-0 left-0 right-0 max-h-[55vh] lg:max-h-none border-t lg:border-t-0 border-white/8 bg-brand-black-soft flex flex-col z-30 overflow-y-auto">
      <div className="px-3 pt-3 pb-2 border-b border-white/8">
        <p className="text-[10px] tracking-[0.2em] uppercase text-brand-cream/45">{def?.icon} {def?.label ?? block.type}</p>
        <p className="text-[10px] font-mono text-brand-cream/35 mt-0.5">{block.id}</p>
      </div>
      <div className="flex border-b border-white/8">
        <button onClick={() => setTab("props")}  className={tabClass(tab === "props")}>Props</button>
        <button onClick={() => setTab("styles")} className={tabClass(tab === "styles")}>Styles</button>
        <button onClick={() => setTab("a11y")}   className={tabClass(tab === "a11y")}>A11y</button>
        <button onClick={() => setTab("split")}  className={tabClass(tab === "split")}>Split</button>
        <button onClick={() => setTab("code")}   className={tabClass(tab === "code")}>Code</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tab === "props" && block.type === "heading" && (
          <HeadingLevelPills value={Number(block.props.level ?? 2)} onChange={lvl => setProp("level", lvl)} />
        )}
        {tab === "props" && (def?.fields ?? []).map(field => <PropFieldRow key={field.key} field={field} value={block.props[field.key]} onChange={v => setProp(field.key, v)} />)}
        {tab === "props" && (def?.fields.length ?? 0) === 0 && (
          <p className="text-[11px] text-brand-cream/45 leading-relaxed">No editable props for this block. Use the Styles tab to tweak appearance.</p>
        )}
        {tab === "styles" && <StyleEditor styles={block.styles ?? {}} onChange={setStyle} />}
        {tab === "a11y" && <A11yEditor a11y={block.a11y ?? {}} onPatch={a => onPatch({ a11y: { ...(block.a11y ?? {}), ...a } })} />}
        {tab === "split" && <SplitTestEditor block={block} onPatch={onPatch} fields={def?.fields ?? []} />}
        {tab === "code" && <BlockCodeEditor block={block} onPatch={onPatch} />}
      </div>
      <div className="p-3 border-t border-white/8 flex gap-2">
        <button onClick={onDuplicate} className="flex-1 py-1.5 px-2 rounded-lg border border-white/10 hover:bg-white/5 text-[11px] text-brand-cream/70 hover:text-brand-cream">Duplicate</button>
        <button onClick={onRemove} className="flex-1 py-1.5 px-2 rounded-lg border border-red-500/20 text-red-400/80 hover:bg-red-500/10 hover:text-red-400 text-[11px]">Delete</button>
      </div>
    </aside>
  );
}

function tabClass(active: boolean) {
  return `flex-1 py-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase ${active ? "text-brand-orange border-b-2 border-brand-orange" : "text-brand-cream/55 hover:text-brand-cream"}`;
}

function SplitTestEditor({ block, onPatch, fields }: { block: Block; onPatch: (patch: Partial<Block>) => void; fields: PropField[] }) {
  const [groups, setGroups] = useState<SplitTestGroup[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const id = getActiveSiteId();
    if (!id) return;
    setGroups(await listSplitTestGroups(id));
  }
  useEffect(() => { void refresh(); }, []);

  const variantsByGroup = block.variantsByGroup ?? {};
  const memberGroups = groups.filter(g => variantsByGroup[g.id]);
  const eligibleGroups = groups.filter(g => !variantsByGroup[g.id]);

  function patchGroupVariants(groupId: string, next: BlockVariant[]) {
    const v = { ...variantsByGroup, [groupId]: next };
    if (next.length === 0) delete v[groupId];
    onPatch({ variantsByGroup: v });
  }

  function addToGroup(groupId: string) {
    // Seed with one alternative B.
    patchGroupVariants(groupId, [{ id: `var_${Math.random().toString(36).slice(2, 7)}`, name: "B — variant", weight: 1 }]);
  }

  function addVariant(groupId: string) {
    const list = variantsByGroup[groupId] ?? [];
    const letter = String.fromCharCode(65 + list.length + 1); // A is control, list starts at B
    patchGroupVariants(groupId, [...list, { id: `var_${Math.random().toString(36).slice(2, 7)}`, name: `${letter} — variant`, weight: 1 }]);
  }

  function patchVariant(groupId: string, variantId: string, patch: Partial<BlockVariant>) {
    const list = variantsByGroup[groupId] ?? [];
    const next = list.map(v => v.id === variantId ? { ...v, ...patch } : v);
    patchGroupVariants(groupId, next);
  }

  function removeVariant(groupId: string, variantId: string) {
    const list = variantsByGroup[groupId] ?? [];
    patchGroupVariants(groupId, list.filter(v => v.id !== variantId));
  }

  function removeFromGroup(groupId: string) {
    if (!confirm("Remove this block from the split-test group? Its variants will be deleted.")) return;
    patchGroupVariants(groupId, []);
  }

  async function createInlineGroup(e: React.FormEvent) {
    e.preventDefault();
    const id = getActiveSiteId();
    if (!id || !newName.trim()) return;
    const g = await createSplitTestGroup({ siteId: id, name: newName.trim(), trafficPercent: 100, stickyBy: "visitor" });
    if (!g) { setError("Could not create group"); return; }
    setNewName(""); setCreating(false);
    void refresh();
    // Auto-add the current block.
    patchGroupVariants(g.id, [{ id: `var_${Math.random().toString(36).slice(2, 7)}`, name: "B — variant", weight: 1 }]);
  }

  // Suggest the most-relevant prop fields to vary (text/url/select).
  const suggestedKeys = fields.filter(f => f.type === "text" || f.type === "url" || f.type === "richtext" || f.type === "select" || f.type === "color" || f.type === "image").map(f => f.key);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
        <p className="text-[11px] text-cyan-400/85 leading-relaxed">
          <strong className="text-cyan-300">Split testing</strong> · Add this block to one or more groups, then define variant values that get rolled out per the group&apos;s traffic %. Visitors see a sticky variant; exposures + conversions are tracked.
        </p>
      </div>

      {memberGroups.length === 0 && (
        <p className="text-[11px] text-brand-cream/55 leading-relaxed">Block is not in any split-test group yet.</p>
      )}

      {memberGroups.map(group => {
        const variants = variantsByGroup[group.id] ?? [];
        return (
          <div key={group.id} className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="px-3 py-2 border-b border-white/8 flex items-center gap-2">
              <p className="text-[11px] font-semibold text-brand-cream truncate flex-1">{group.name}</p>
              <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full ${splitTestStatusTone(group.status)}`}>{group.status}</span>
              <button onClick={() => removeFromGroup(group.id)} className="text-[10px] text-brand-cream/45 hover:text-red-400">Remove</button>
            </div>
            <div className="p-2 space-y-1.5">
              {/* Control row — read-only (just the base block) */}
              <div className="rounded border border-white/5 bg-black/30 p-2 text-[10px] text-brand-cream/55">
                <p className="font-mono">A — control (current props)</p>
              </div>
              {variants.map(v => (
                <div key={v.id} className="rounded border border-brand-orange/20 bg-brand-orange/5 p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input value={v.name} onChange={e => patchVariant(group.id, v.id, { name: e.target.value })} className={INPUT + " text-[11px]"} />
                    <input type="number" value={v.weight ?? 1} onChange={e => patchVariant(group.id, v.id, { weight: Number(e.target.value) || 1 })} className={INPUT + " w-16 text-[11px] font-mono"} title="Relative weight" />
                    <button onClick={() => removeVariant(group.id, v.id)} className="text-[10px] text-brand-cream/45 hover:text-red-400">×</button>
                  </div>
                  {/* Per-prop variant overrides — only the most-relevant fields */}
                  {suggestedKeys.length > 0 && (
                    <details className="text-[10px]">
                      <summary className="cursor-pointer text-brand-cream/55 hover:text-brand-cream">Override props ({Object.keys(v.props ?? {}).length})</summary>
                      <div className="mt-1.5 space-y-1.5">
                        {suggestedKeys.map(key => {
                          const cur = (v.props as Record<string, unknown> | undefined)?.[key];
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <span className="text-[10px] text-brand-cream/45 w-16 shrink-0 font-mono truncate">{key}</span>
                              <input
                                value={cur === undefined ? "" : String(cur)}
                                onChange={e => patchVariant(group.id, v.id, { props: { ...(v.props ?? {}), [key]: e.target.value || undefined } })}
                                placeholder={String(block.props[key] ?? "")}
                                className={INPUT + " text-[10px]"}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
              ))}
              <button onClick={() => addVariant(group.id)} className="w-full px-2 py-1 rounded border border-white/10 text-[10px] text-brand-cream/65 hover:text-brand-cream hover:bg-white/5">
                + Add variant
              </button>
            </div>
          </div>
        );
      })}

      {/* Add to existing group */}
      {eligibleGroups.length > 0 && (
        <details className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
          <summary className="cursor-pointer px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-brand-cream/55 hover:text-brand-cream">+ Add to existing group ({eligibleGroups.length})</summary>
          <div className="p-2 space-y-1">
            {eligibleGroups.map(g => (
              <button key={g.id} onClick={() => addToGroup(g.id)} className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-brand-cream/85 hover:bg-white/5">
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full ${splitTestStatusTone(g.status)}`}>{g.status}</span>
                <span className="flex-1 truncate">{g.name}</span>
                <span className="text-[10px] text-brand-cream/40">{g.trafficPercent ?? 100}%</span>
              </button>
            ))}
          </div>
        </details>
      )}

      {/* Inline new group */}
      {!creating ? (
        <button onClick={() => setCreating(true)} className="w-full px-2 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 text-[11px] font-semibold hover:bg-cyan-500/25">
          + Create new split-test group
        </button>
      ) : (
        <form onSubmit={createInlineGroup} className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2 space-y-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Group name (e.g. Pricing-page CTA test)" required className={INPUT + " text-[11px]"} />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 px-2 py-1 rounded bg-cyan-500 text-white text-[11px] font-semibold">Create + add</button>
            <button type="button" onClick={() => setCreating(false)} className="px-2 py-1 rounded text-[11px] text-brand-cream/55 hover:text-brand-cream">Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

function HeadingLevelPills({ value, onChange }: { value: number; onChange: (lvl: number) => void }) {
  return (
    <Field label="Heading level">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6].map(lvl => (
          <button
            key={lvl}
            type="button"
            onClick={() => onChange(lvl)}
            className={`flex-1 py-1.5 rounded text-[12px] font-semibold ${value === lvl ? "bg-brand-orange text-white" : "bg-white/5 text-brand-cream/65 hover:bg-white/10"}`}
            title={`Convert to H${lvl}`}
          >
            H{lvl}
          </button>
        ))}
      </div>
    </Field>
  );
}

function A11yEditor({ a11y, onPatch }: { a11y: BlockA11y; onPatch: (patch: Partial<BlockA11y>) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-brand-cream/45 leading-relaxed">
        Accessibility attributes applied to the block&apos;s outer DOM element. Empty fields are ignored.
      </p>
      <Field label="aria-label" help="Used for icon-only buttons + decorative regions a screen reader couldn't otherwise describe">
        <input type="text" value={a11y.ariaLabel ?? ""} onChange={e => onPatch({ ariaLabel: e.target.value || undefined })} className={INPUT} />
      </Field>
      <Field label="aria-labelledby" help="ID of a heading or label that names this region">
        <input type="text" value={a11y.ariaLabelledBy ?? ""} onChange={e => onPatch({ ariaLabelledBy: e.target.value || undefined })} className={INPUT + " font-mono"} placeholder="some-heading-id" />
      </Field>
      <Field label="role" help="ARIA role override (rare — most blocks have a sensible default)">
        <input type="text" value={a11y.role ?? ""} onChange={e => onPatch({ role: e.target.value || undefined })} className={INPUT + " font-mono"} placeholder="complementary, banner, main, …" />
      </Field>
      <Field label="HTML id (anchor target)" help="Lets you link to this block via #id">
        <input type="text" value={a11y.htmlId ?? ""} onChange={e => onPatch({ htmlId: e.target.value || undefined })} className={INPUT + " font-mono"} placeholder="pricing" />
      </Field>
      <Field label="tabindex" help="Custom focus order (advanced)">
        <input type="number" value={a11y.tabIndex ?? ""} onChange={e => onPatch({ tabIndex: e.target.value === "" ? undefined : Number(e.target.value) })} className={INPUT} />
      </Field>
      <Field label="aria-hidden">
        <button type="button" onClick={() => onPatch({ ariaHidden: !(a11y.ariaHidden === true) })} className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${a11y.ariaHidden ? "bg-brand-orange justify-end" : "bg-white/15 justify-start"}`}>
          <span className="w-4 h-4 rounded-full bg-white" />
        </button>
      </Field>
    </div>
  );
}

// Direct JSON editor for the selected block. Useful when the visual
// controls don't expose a knob you need (custom CSS, exotic props, etc.).
// Saves on blur if the JSON parses; surfaces the parse error otherwise.
function BlockCodeEditor({ block, onPatch }: { block: Block; onPatch: (patch: Partial<Block>) => void }) {
  const initial = JSON.stringify({ props: block.props, styles: block.styles ?? {} }, null, 2);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function commit() {
    try {
      const parsed = JSON.parse(text) as { props?: Record<string, unknown>; styles?: BlockStyles };
      onPatch({
        props: parsed.props ?? block.props,
        styles: parsed.styles ?? block.styles,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-brand-cream/45 leading-relaxed">
        Edit this block&apos;s props + styles as JSON. Saves on blur. Children + id + type are read-only.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        spellCheck={false}
        className="w-full h-80 bg-black/40 border border-white/10 rounded-lg p-2 text-[11px] text-brand-cream font-mono leading-relaxed focus:outline-none focus:border-brand-orange/50"
      />
      {error && <p className="text-[11px] text-red-400">JSON: {error}</p>}
      <div className="flex items-center justify-between text-[10px] text-brand-cream/45">
        <span className="font-mono">id: {block.id}</span>
        <span>type: {block.type}</span>
      </div>
    </div>
  );
}

function PropFieldRow({ field, value, onChange }: { field: PropField; value: unknown; onChange: (v: unknown) => void }) {
  const v = value === undefined ? field.default : value;
  switch (field.type) {
    case "text":
    case "url":
      return (
        <Field label={field.label} help={field.help}>
          <input type={field.type === "url" ? "url" : "text"} value={String(v ?? "")} placeholder={field.placeholder} onChange={e => onChange(e.target.value)} className={INPUT} />
        </Field>
      );
    case "image":
      return (
        <Field label={field.label} help={field.help}>
          <AssetPicker value={String(v ?? "")} onChange={onChange} placeholder={field.placeholder} />
        </Field>
      );
    case "textarea":
    case "richtext":
      return (
        <Field label={field.label} help={field.help}>
          <textarea value={String(v ?? "")} onChange={e => onChange(e.target.value)} rows={field.type === "richtext" ? 3 : 4} className={`${INPUT} font-mono`} />
        </Field>
      );
    case "color":
      return (
        <Field label={field.label} help={field.help}>
          <div className="flex gap-2">
            <input type="color" value={typeof v === "string" && v.startsWith("#") ? v : "#000000"} onChange={e => onChange(e.target.value)} className="w-10 h-8 rounded cursor-pointer bg-transparent border border-white/10" />
            <input type="text" value={String(v ?? "")} onChange={e => onChange(e.target.value)} className={`${INPUT} font-mono`} />
          </div>
        </Field>
      );
    case "number":
      return (
        <Field label={field.label} help={field.help}>
          <input type="number" value={v === undefined || v === null ? "" : String(v)} onChange={e => onChange(e.target.value === "" ? undefined : Number(e.target.value))} className={INPUT} />
        </Field>
      );
    case "boolean":
      return (
        <Field label={field.label} help={field.help}>
          <button type="button" onClick={() => onChange(!(v === true))} className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${v ? "bg-brand-orange justify-end" : "bg-white/15 justify-start"}`}>
            <span className="w-4 h-4 rounded-full bg-white" />
          </button>
        </Field>
      );
    case "select":
      return (
        <Field label={field.label} help={field.help}>
          <select value={String(v ?? "")} onChange={e => onChange(e.target.value)} className={INPUT}>
            {field.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </Field>
      );
  }
}

function StyleEditor<K extends keyof BlockStyles>({ styles, onChange }: { styles: BlockStyles; onChange: (key: K, value: BlockStyles[K]) => void }) {
  const [device, setDevice] = useState<"base" | "mobile" | "tablet">("base");
  const activeStyles: BlockStyles | Partial<BlockStyles> = device === "base" ? styles : (styles[device] ?? {}) as Partial<BlockStyles>;

  function setActive<K2 extends keyof BlockStyles>(key: K2, value: BlockStyles[K2]) {
    if (device === "base") { onChange(key as unknown as K, value as unknown as BlockStyles[K]); return; }
    const nextOverride = { ...((styles[device] as Partial<BlockStyles>) ?? {}), [key]: value };
    if (value === undefined) delete (nextOverride as Record<string, unknown>)[key as string];
    onChange(device as unknown as K, nextOverride as unknown as BlockStyles[K]);
  }

  return (
    <div className="space-y-3">
      {/* Device tabs for responsive overrides */}
      <div className="flex border border-white/10 rounded-lg p-0.5 text-[10px]">
        {(["base", "tablet", "mobile"] as const).map(d => (
          <button
            key={d}
            type="button"
            onClick={() => setDevice(d)}
            className={`flex-1 py-1 rounded ${device === d ? "bg-brand-orange text-white" : "text-brand-cream/55 hover:text-brand-cream"}`}
          >
            {d === "base" ? "Desktop" : d === "tablet" ? "Tablet" : "Mobile"}
          </button>
        ))}
      </div>
      {device !== "base" && (
        <p className="text-[10px] text-brand-cream/45 leading-relaxed">
          Override values for {device}. Empty fields fall back to the desktop value.
        </p>
      )}

      {STYLE_FIELD_GROUPS.map(group => (
        <details key={group.label} className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden" open>
          <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] uppercase tracking-[0.18em] text-brand-cream/55 hover:text-brand-cream">{group.label}</summary>
          <div className="p-2.5 pt-0 space-y-2">
            {group.fields.map(key => {
              const valueRaw = (activeStyles as Record<string, unknown>)[key as string];
              const valueStr = (valueRaw ?? "") as string;
              return (
                <Field key={String(key)} label={String(key)}>
                  {String(key) === "background" || String(key) === "textColor" ? (
                    <div className="flex gap-2">
                      <input type="color" value={typeof valueRaw === "string" && (valueRaw as string).startsWith("#") ? (valueRaw as string) : "#000000"} onChange={e => setActive(key, e.target.value as BlockStyles[typeof key])} className="w-10 h-8 rounded cursor-pointer bg-transparent border border-white/10" />
                      <input type="text" value={valueStr} onChange={e => setActive(key, (e.target.value || undefined) as BlockStyles[typeof key])} className={`${INPUT} font-mono`} />
                    </div>
                  ) : (
                    <input type="text" value={valueStr} onChange={e => setActive(key, (e.target.value || undefined) as BlockStyles[typeof key])} placeholder="—" className={`${INPUT} font-mono`} />
                  )}
                </Field>
              );
            })}
          </div>
        </details>
      ))}

      {/* Animation picker — only on the base device tab */}
      {device === "base" && (
        <details className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden" open>
          <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] uppercase tracking-[0.18em] text-brand-cream/55 hover:text-brand-cream">Animation</summary>
          <div className="p-2.5 pt-0 space-y-2">
            <Field label="On scroll into view">
              <select value={(styles.animate as string | undefined) ?? ""} onChange={e => onChange("animate" as K, (e.target.value || undefined) as BlockStyles[K])} className={INPUT}>
                <option value="">None</option>
                <option value="fade-in">Fade in</option>
                <option value="slide-up">Slide up</option>
                <option value="slide-left">Slide from left</option>
                <option value="slide-right">Slide from right</option>
                <option value="zoom-in">Zoom in</option>
                <option value="rotate-in">Rotate in</option>
                <option value="blur-in">Blur in</option>
              </select>
            </Field>
            <Field label="Duration">
              <input type="text" value={(styles.animateDuration as string | undefined) ?? ""} onChange={e => onChange("animateDuration" as K, (e.target.value || undefined) as BlockStyles[K])} placeholder="600ms" className={INPUT + " font-mono"} />
            </Field>
            <Field label="Delay">
              <input type="text" value={(styles.animateDelay as string | undefined) ?? ""} onChange={e => onChange("animateDelay" as K, (e.target.value || undefined) as BlockStyles[K])} placeholder="0ms" className={INPUT + " font-mono"} />
            </Field>
            <Field label="Easing">
              <select value={(styles.animateEasing as string | undefined) ?? ""} onChange={e => onChange("animateEasing" as K, (e.target.value || undefined) as BlockStyles[K])} className={INPUT + " font-mono"}>
                <option value="">ease-out (default)</option>
                <option value="ease">ease</option>
                <option value="ease-in">ease-in</option>
                <option value="ease-in-out">ease-in-out</option>
                <option value="linear">linear</option>
                <option value="cubic-bezier(0.16, 1, 0.3, 1)">cubic-bezier (snappy)</option>
                <option value="cubic-bezier(0.34, 1.56, 0.64, 1)">cubic-bezier (overshoot)</option>
              </select>
            </Field>
            <p className="text-[10px] text-brand-cream/40 leading-relaxed">Plays once when the block enters the viewport on the live site. The editor canvas shows the resting state.</p>
          </div>
        </details>
      )}
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] tracking-[0.18em] uppercase text-brand-cream/45 mb-1">{label}</span>
      {children}
      {help && <span className="block text-[10px] text-brand-cream/35 mt-1">{help}</span>}
    </label>
  );
}
