export const SAVED_TOOL_ICON_SOURCE_BYTES = 10 * 1024 * 1024;
export const SAVED_TOOL_ICON_UPLOAD_BYTES = 512 * 1024;
export const SAVED_TOOL_ICON_SIZE = 96;
export const SAVED_TOOL_ICON_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This image could not be opened."));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("This image could not be prepared.")), "image/webp", 0.86);
  });
}

/** Validate and resize a user-selected raster before it reaches private storage. */
export async function prepareSavedToolIcon(file: File): Promise<File> {
  if (!SAVED_TOOL_ICON_TYPES.includes(file.type as (typeof SAVED_TOOL_ICON_TYPES)[number])) {
    throw new Error("Use a PNG, JPEG, or WebP image.");
  }
  if (!file.size || file.size > SAVED_TOOL_ICON_SOURCE_BYTES) {
    throw new Error("Choose an image smaller than 10 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await imageFromUrl(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = SAVED_TOOL_ICON_SIZE;
    canvas.height = SAVED_TOOL_ICON_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image.");
    const scale = Math.max(SAVED_TOOL_ICON_SIZE / image.naturalWidth, SAVED_TOOL_ICON_SIZE / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.clearRect(0, 0, SAVED_TOOL_ICON_SIZE, SAVED_TOOL_ICON_SIZE);
    context.drawImage(image, (SAVED_TOOL_ICON_SIZE - width) / 2, (SAVED_TOOL_ICON_SIZE - height) / 2, width, height);
    const blob = await canvasBlob(canvas);
    if (!blob.size || blob.size > SAVED_TOOL_ICON_UPLOAD_BYTES) {
      throw new Error("The finished icon is too large. Try a simpler image.");
    }
    const stem = file.name.replace(/\.[^.]+$/, "").trim().slice(0, 100) || "tool-icon";
    return new File([blob], `${stem}.webp`, { type: "image/webp", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
