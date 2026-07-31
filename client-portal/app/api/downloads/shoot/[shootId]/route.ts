import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/auth";
import { jsonError, safePublicFilePath, safeZipName } from "@/lib/route-security";
import { getShootById } from "@/lib/shoots";

export async function GET(_request: Request, { params }: { params: Promise<{ shootId: string }> }) {
  const session = await getPortalSession();
  if (!session) return jsonError("Unauthorised.", 401);
  const { shootId } = await params;
  if (!/^[a-z0-9-]{1,80}$/i.test(shootId)) return jsonError("Shoot not found.", 404);
  const shoot = await getShootById(shootId);
  if (!shoot) return jsonError("Shoot not found.", 404);

  const zip = new JSZip();
  for (const [index, photo] of shoot.photos.entries()) {
    const filePath = safePublicFilePath(photo.src);
    const filename = `${String(index + 1).padStart(2, "0")}-${safeZipName(photo.id || path.basename(filePath), "photo.jpg")}`;
    zip.file(filename, await readFile(filePath));
  }
  const archive = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
  return new Response(archive, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${safeZipName(shoot.id, "shoot")}.zip"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
