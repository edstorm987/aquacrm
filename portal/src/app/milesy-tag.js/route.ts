const TAG_SOURCE = String.raw`(() => {
  if (window.__milesymediaTagLoaded) return;
  window.__milesymediaTagLoaded = true;

  const script = document.currentScript;
  const siteKey = script && script.dataset ? script.dataset.siteKey : "";
  const propertyId = script && script.dataset ? script.dataset.property || "" : "";
  if (!siteKey || !script || !script.src) return;
  const endpoint = new URL("/api/telemetry/collect", script.src).toString();
  const sessionId = (() => {
    try {
      const key = "milesymedia-session";
      const existing = sessionStorage.getItem(key);
      if (existing) return existing;
      const created = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(key, created);
      return created;
    } catch {
      return Math.random().toString(36).slice(2);
    }
  })();

  const send = (type, data = {}) => {
    const payload = JSON.stringify({
      siteKey,
      propertyId,
      sessionId,
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
  document.addEventListener("submit", event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    send("form", {
      formName: form.dataset.milesymediaForm || form.getAttribute("name") || form.id || form.action || "Website form",
      experimentId: form.dataset.milesymediaExperiment || undefined,
      variant: form.dataset.milesymediaVariant || undefined,
    });
  }, true);
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target.closest("[data-milesymedia-conversion]") : null;
    if (!target) return;
    send("conversion", {
      formName: target.getAttribute("data-milesymedia-conversion") || "Conversion action",
      experimentId: target.getAttribute("data-milesymedia-experiment") || undefined,
      variant: target.getAttribute("data-milesymedia-variant") || undefined,
    });
  }, true);

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
