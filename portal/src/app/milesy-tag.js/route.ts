const TAG_SOURCE = String.raw`(() => {
  if (window.__milesymediaTagLoaded) return;
  window.__milesymediaTagLoaded = true;

  const script = document.currentScript;
  const siteKey = script && script.dataset ? script.dataset.siteKey : "";
  const propertyId = script && script.dataset ? script.dataset.property || "" : "";
  if (!siteKey || !script || !script.src) return;
  const endpoint = new URL("/api/telemetry/collect", script.src).toString();

  const send = (type, data = {}) => {
    const payload = JSON.stringify({
      siteKey,
      propertyId,
      type,
      occurredAt: Date.now(),
      url: location.href,
      path: location.pathname,
      title: document.title,
      referrer: document.referrer || undefined,
      ...data,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: "text/plain" }));
      return;
    }
    fetch(endpoint, { method: "POST", body: payload, keepalive: true, mode: "cors" }).catch(() => {});
  };

  let lastPath = "";
  const pageview = () => {
    const path = location.pathname + location.search;
    if (path === lastPath) return;
    lastPath = path;
    send("pageview");
  };

  window.addEventListener("error", event => {
    send("error", { message: event.message || "Browser error" });
  });
  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    send("error", { message: reason && reason.message ? reason.message : String(reason || "Unhandled promise rejection") });
  });
  window.addEventListener("load", () => {
    pageview();
    setTimeout(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      if (navigation && navigation.loadEventEnd) {
        send("performance", { metric: "load", value: Math.round(navigation.loadEventEnd) });
      }
    }, 0);
  }, { once: true });

  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      queueMicrotask(pageview);
      return result;
    };
  }
  window.addEventListener("popstate", pageview);

  window.Milesymedia = Object.freeze({
    track(type, data = {}) {
      send(type || "custom", data);
    },
  });
})();`;

export async function GET() {
  return new Response(TAG_SOURCE, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}
