/** Dependency-free public/editor media contract shared by browser and server. */
export const MAX_PUBLIC_MEDIA_BYTES = 1 * 1024 * 1024;
export const PUBLIC_MEDIA_MAX_SIZE_LABEL = "1 MiB";
export const ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
] as const;
export type AllowedPublicUploadContentType = (typeof ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES)[number];
export const PUBLIC_MEDIA_FILE_ACCEPT = ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES.join(",");

export function normalizePublicUploadContentType(contentType: string): string {
  const normalized = contentType.split(";")[0]!.trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

export function publicUploadContentTypeAllowed(
  contentType: string,
): contentType is AllowedPublicUploadContentType {
  return (ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES as readonly string[])
    .includes(normalizePublicUploadContentType(contentType));
}
