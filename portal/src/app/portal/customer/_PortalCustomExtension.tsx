"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientPortalCustomCode } from "@/server/types";

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 1_200;

export function PortalCustomExtension({
  id,
  code,
  context,
}: {
  id: string;
  code: ClientPortalCustomCode;
  context: Record<string, string>;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(code.minHeight);
  const srcDoc = useMemo(() => extensionDocument(id, code, context), [code, context, id]);

  useEffect(() => {
    setHeight(code.minHeight);
  }, [code.minHeight, srcDoc]);

  useEffect(() => {
    const receiveHeight = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = event.data as { type?: unknown; id?: unknown; height?: unknown } | null;
      if (!message || message.type !== "aqua-portal-extension:resize" || message.id !== id) return;
      if (typeof message.height !== "number" || !Number.isFinite(message.height)) return;
      setHeight(Math.min(MAX_HEIGHT, Math.max(code.minHeight, Math.ceil(message.height))));
    };
    window.addEventListener("message", receiveHeight);
    return () => window.removeEventListener("message", receiveHeight);
  }, [code.minHeight, id]);

  return (
    <section data-portal-extension={id} aria-label={code.title} className="w-full">
      <iframe
        ref={frameRef}
        title={code.title}
        srcDoc={srcDoc}
        sandbox="allow-downloads allow-forms allow-popups allow-scripts"
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-transparent"
        style={{ height }}
      />
    </section>
  );
}

function extensionDocument(id: string, code: ClientPortalCustomCode, context: Record<string, string>): string {
  const safeId = JSON.stringify(id).replaceAll("<", "\\u003c");
  const safeContext = JSON.stringify(context).replaceAll("<", "\\u003c");
  const customScript = code.javascript.replace(/<\/script/gi, "<\\/script");
  const customCss = code.css.replace(/<\/style/gi, "<\\/style");
  const bootstrap = `
    window.AQUA_PORTAL = Object.freeze(${safeContext});
    const extensionId = ${safeId};
    const reportHeight = () => {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0,
        ${Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, code.minHeight))}
      );
      parent.postMessage({ type: "aqua-portal-extension:resize", id: extensionId, height }, "*");
    };
    addEventListener("load", reportHeight);
    new ResizeObserver(reportHeight).observe(document.documentElement);
    try {
      ${customScript}
    } catch (error) {
      console.error("Portal extension error", error);
    }
    requestAnimationFrame(reportHeight);
  `.replace(/<\/script/gi, "<\\/script");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: blob:; media-src https: data: blob:; font-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src https:; form-action https:; connect-src 'none';" />
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; background: transparent; color: #171512; font-family: Arial, Helvetica, sans-serif; }
      img, video, iframe { max-width: 100%; }
      button, input, textarea, select { font: inherit; }
      ${customCss}
    </style>
  </head>
  <body>
    <div id="aqua-extension-root">${code.html}</div>
    <script>${bootstrap}</script>
  </body>
</html>`;
}
