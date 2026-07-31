"use client";

import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export default function AquaAccount() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/aqua/session", { method: "POST" });
      const body = await response.json() as { ok?: boolean; url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Aqua is unavailable.");
      setUrl(body.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aqua is unavailable.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (busy) return <div className="embed-state"><LoaderCircle className="spin" /><strong>Opening your Aqua account</strong><span>Plans, billing and support are loading securely.</span></div>;
  if (error) return (
    <div className="embed-state">
      <AlertCircle />
      <strong>Could not open Aqua</strong>
      <span>{error}</span>
      <button type="button" onClick={() => void load()}><RefreshCw size={15} /> Try again</button>
    </div>
  );
  return <iframe className="aqua-frame" src={url} title="Aqua account" />;
}
