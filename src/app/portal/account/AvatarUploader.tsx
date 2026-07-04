"use client";

// T1 R036 — client-side upload zone for the profile picture.
//
// Click or drag a file → resize to 256×256 via <canvas> → POST as a
// JSON `{dataUrl}` payload. Server validates mime + cap. Falls back to
// initials when no avatar is set.
//
// Resize is "cover" semantics (fill the 256×256 square, crop overflow)
// so portrait + landscape files both yield a clean circular crop. We
// emit JPEG at q=0.85 for predictable size — comfortably under the 50KB
// cap for normal photos.

import { useRef, useState } from "react";

const TARGET_PX = 256;
const JPEG_QUALITY = 0.85;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

interface Props {
  initialAvatarUrl?: string;
  displayInitials: string;
}

async function fileToResizedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = TARGET_PX;
  canvas.height = TARGET_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  // Cover-fit: scale by max(W/H ratio) and centre-crop.
  const scale = Math.max(TARGET_PX / bitmap.width, TARGET_PX / bitmap.height);
  const sw = TARGET_PX / scale;
  const sh = TARGET_PX / scale;
  const sx = (bitmap.width - sw) / 2;
  const sy = (bitmap.height - sh) / 2;
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, TARGET_PX, TARGET_PX);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export function AvatarUploader({ initialAvatarUrl, displayInitials }: Props) {
  const [avatar, setAvatar] = useState<string | undefined>(initialAvatarUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setErr(null);
    if (!ALLOWED.includes(file.type)) { setErr("Use a PNG, JPEG, or WebP image."); return; }
    setBusy(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      const res = await fetch("/api/auth/profile/avatar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErr(json.error === "too_large" ? "Image too large after resize — try a smaller source." : "Upload failed.");
        return;
      }
      setAvatar(json.avatarUrl);
    } catch {
      setErr("Couldn't process that image.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/profile/avatar", { method: "DELETE" });
      if (!res.ok) { setErr("Couldn't clear avatar."); return; }
      setAvatar(undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-black/8 bg-white p-4">
      <div
        className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-black text-white"
        data-testid="avatar-preview"
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-semibold tracking-wide">{displayInitials}</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label
          className="cursor-pointer rounded-md border border-black/15 bg-[#FDFCF8] px-3 py-1.5 text-sm hover:bg-white"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
        >
          {busy ? "Working…" : avatar ? "Replace photo" : "Upload photo"}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        </label>
        {avatar && (
          <button
            type="button"
            onClick={handleClear}
            disabled={busy}
            className="text-left text-xs text-black/55 underline underline-offset-2 hover:text-black/80 disabled:opacity-50"
          >
            Remove photo
          </button>
        )}
        {err && <p className="text-xs text-red-700">{err}</p>}
      </div>
    </div>
  );
}
