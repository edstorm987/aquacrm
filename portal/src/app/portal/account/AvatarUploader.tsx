"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Crop,
  ImageUp,
  Minus,
  Move,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

const TARGET_PX = 256;
const PREVIEW_PX = 512;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_DATA_URL_BYTES = 50_000;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

interface Props {
  initialAvatarUrl?: string;
  displayInitials: string;
}

interface EditorSource {
  src: string;
  temporary: boolean;
}

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  panX: number;
  panY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function paintCrop(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  zoom: number,
  panX: number,
  panY: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  const target = canvas.width;
  const baseScale = Math.max(target / image.naturalWidth, target / image.naturalHeight);
  const scale = baseScale * zoom;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const overflowX = Math.max(0, (width - target) / 2);
  const overflowY = Math.max(0, (height - target) / 2);
  const x = (target - width) / 2 + panX * overflowX;
  const y = (target - height) / 2 + panY * overflowY;
  ctx.clearRect(0, 0, target, target);
  ctx.drawImage(image, x, y, width, height);
}

function encodeAvatar(canvas: HTMLCanvasElement): string {
  for (const quality of [0.86, 0.78, 0.7, 0.62]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_DATA_URL_BYTES) return dataUrl;
  }
  throw new Error("avatar_too_large");
}

export function AvatarUploader({ initialAvatarUrl, displayInitials }: Props) {
  const [avatar, setAvatar] = useState<string | undefined>(initialAvatarUrl);
  const [editorSource, setEditorSource] = useState<EditorSource | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (!editorSource) {
      imageRef.current = null;
      setImageReady(false);
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      imageRef.current = image;
      setImageReady(true);
    };
    image.onerror = () => {
      setErr("This photo could not be opened.");
      setEditorSource(null);
    };
    image.src = editorSource.src;
    return () => {
      imageRef.current = null;
      if (editorSource.temporary) URL.revokeObjectURL(editorSource.src);
    };
  }, [editorSource]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageReady) return;
    paintCrop(canvas, image, zoom, panX, panY);
  }, [imageReady, panX, panY, zoom]);

  function resetFrame() {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }

  function openEditor(source: EditorSource) {
    setErr(null);
    resetFrame();
    setImageReady(false);
    setEditorSource(source);
  }

  function handleFile(file: File) {
    setErr(null);
    if (!ALLOWED.includes(file.type)) {
      setErr("Use a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setErr("Choose an image smaller than 15 MB.");
      return;
    }
    openEditor({ src: URL.createObjectURL(file), temporary: true });
  }

  async function saveCrop() {
    const image = imageRef.current;
    if (!image || !imageReady) return;
    setBusy(true);
    setErr(null);
    try {
      const output = document.createElement("canvas");
      output.width = TARGET_PX;
      output.height = TARGET_PX;
      paintCrop(output, image, zoom, panX, panY);
      const dataUrl = encodeAvatar(output);
      const response = await fetch("/api/auth/profile/avatar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; avatarUrl?: string; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.avatarUrl) {
        setErr(payload?.error === "too_large" ? "The finished crop is still too large." : "The photo could not be saved.");
        return;
      }
      setAvatar(payload.avatarUrl);
      setEditorSource(null);
    } catch (cause) {
      setErr(cause instanceof Error && cause.message === "avatar_too_large"
        ? "The finished crop is still too large."
        : "The photo could not be processed.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setBusy(true);
    setErr(null);
    try {
      const response = await fetch("/api/auth/profile/avatar", { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { ok?: boolean } | null;
      if (!response.ok || !payload?.ok) {
        setErr("The photo could not be removed.");
        return;
      }
      setAvatar(undefined);
      setEditorSource(null);
    } catch {
      setErr("The photo could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  function updatePanFromPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const image = imageRef.current;
    if (!drag || !image || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const baseScale = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const width = image.naturalWidth * baseScale * zoom;
    const height = image.naturalHeight * baseScale * zoom;
    const overflowX = Math.max(0, (width - rect.width) / 2);
    const overflowY = Math.max(0, (height - rect.height) / 2);
    setPanX(overflowX ? clamp(drag.panX + (event.clientX - drag.x) / overflowX, -1, 1) : 0);
    setPanY(overflowY ? clamp(drag.panY + (event.clientY - drag.y) / overflowY, -1, 1) : 0);
  }

  function adjustWithKeyboard(event: React.KeyboardEvent<HTMLCanvasElement>) {
    const amount = event.shiftKey ? 0.15 : 0.05;
    if (event.key === "ArrowLeft") setPanX(value => clamp(value - amount, -1, 1));
    else if (event.key === "ArrowRight") setPanX(value => clamp(value + amount, -1, 1));
    else if (event.key === "ArrowUp") setPanY(value => clamp(value - amount, -1, 1));
    else if (event.key === "ArrowDown") setPanY(value => clamp(value + amount, -1, 1));
    else return;
    event.preventDefault();
  }

  return (
    <div className="min-w-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
          event.currentTarget.value = "";
        }}
      />

      {editorSource ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(220px,320px)_minmax(0,1fr)] lg:items-center">
          <div className="mx-auto w-full max-w-80">
            <div className="relative aspect-square overflow-hidden rounded-full border-4 border-white bg-black/[0.05] shadow-[0_16px_40px_rgba(0,0,0,0.16)] ring-1 ring-black/10">
              <canvas
                ref={canvasRef}
                width={PREVIEW_PX}
                height={PREVIEW_PX}
                tabIndex={0}
                role="img"
                aria-label="Profile picture crop. Use the arrow keys to reposition the photo."
                onKeyDown={adjustWithKeyboard}
                onPointerDown={event => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX, panY };
                }}
                onPointerMove={updatePanFromPointer}
                onPointerUp={event => {
                  if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
                }}
                onPointerCancel={() => { dragRef.current = null; }}
                className="h-full w-full touch-none cursor-grab outline-none focus-visible:ring-4 focus-visible:ring-brand/30 active:cursor-grabbing"
              />
              {!imageReady ? <span className="absolute inset-0 grid place-items-center text-xs font-medium text-black/45">Preparing photo...</span> : null}
              <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/45" />
            </div>
          </div>

          <div className="min-w-0 border-t border-black/10 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex items-center gap-2">
              <Crop size={17} className="text-brand" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-black/80">Frame your photo</h3>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-xs font-medium text-black/55">
                <span className="flex items-center justify-between"><span>Size</span><span className="tabular-nums text-black/35">{Math.round(zoom * 100)}%</span></span>
                <span className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2">
                  <IconButton label="Make photo smaller" disabled={zoom <= 1} onClick={() => setZoom(value => clamp(value - 0.1, 1, 3))}><Minus size={15} /></IconButton>
                  <input aria-label="Photo size" type="range" min="1" max="3" step="0.02" value={zoom} onChange={event => setZoom(Number(event.target.value))} className="w-full accent-brand" />
                  <IconButton label="Make photo larger" disabled={zoom >= 3} onClick={() => setZoom(value => clamp(value + 0.1, 1, 3))}><Plus size={15} /></IconButton>
                </span>
              </label>

              <label className="grid gap-2 text-xs font-medium text-black/55">
                <span className="flex items-center gap-2"><Move size={14} /> Horizontal position</span>
                <input aria-label="Horizontal photo position" type="range" min="-1" max="1" step="0.01" value={panX} onChange={event => setPanX(Number(event.target.value))} className="w-full accent-brand" />
              </label>
              <label className="grid gap-2 text-xs font-medium text-black/55">
                <span className="flex items-center gap-2"><Move size={14} className="rotate-90" /> Vertical position</span>
                <input aria-label="Vertical photo position" type="range" min="-1" max="1" step="0.01" value={panY} onChange={event => setPanY(Number(event.target.value))} className="w-full accent-brand" />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-black/10 pt-4">
              <button type="button" onClick={() => void saveCrop()} disabled={busy || !imageReady} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-45"><Check size={15} />{busy ? "Saving..." : "Save photo"}</button>
              <button type="button" onClick={() => setEditorSource(null)} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/60 hover:bg-black/[0.03] disabled:opacity-45"><X size={15} />Cancel</button>
              <IconButton label="Reset framing" onClick={resetFrame} disabled={busy}><RotateCcw size={15} /></IconButton>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="grid gap-5 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-center"
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          <div className="relative mx-auto grid size-28 place-items-center overflow-hidden rounded-full bg-black text-white shadow-[0_12px_28px_rgba(0,0,0,0.15)] ring-4 ring-white outline outline-1 outline-black/10 sm:mx-0" data-testid="avatar-preview">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="Current profile" className="h-full w-full object-cover" />
            ) : <span className="text-xl font-semibold">{displayInitials}</span>}
          </div>

          <div className="min-w-0 text-center sm:text-left">
            <p className="text-sm font-semibold text-black/75">{avatar ? "Your current photo" : "Add your photo"}</p>
            <p className="mt-1 text-xs leading-5 text-black/45">PNG, JPEG, or WebP up to 15 MB.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-45"><ImageUp size={15} />{avatar ? "Replace photo" : "Choose photo"}</button>
              {avatar ? <button type="button" onClick={() => openEditor({ src: avatar, temporary: false })} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/60 hover:bg-black/[0.03] disabled:opacity-45"><Crop size={15} />Adjust framing</button> : null}
              {avatar ? <button type="button" onClick={() => void removePhoto()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-45"><Trash2 size={15} />{busy ? "Removing..." : "Remove photo"}</button> : null}
            </div>
          </div>
        </div>
      )}

      {err ? <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p> : null}
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="grid size-9 shrink-0 place-items-center rounded-md border border-black/12 bg-white text-black/55 hover:bg-black/[0.03] disabled:opacity-35">{children}</button>;
}
