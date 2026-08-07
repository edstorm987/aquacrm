export const AQUA_TAG_SOURCE = String.raw`(() => {
  if (window.__aquaTagLoaded) return;
  window.__aquaTagLoaded = true;

  const script = document.currentScript;
  const siteKey = script && script.dataset ? script.dataset.siteKey || "" : "";
  const propertyId = script && script.dataset ? script.dataset.property || "" : "";
  if (!siteKey || !script || !script.src) return;

  const endpoint = new URL("/api/telemetry/collect", script.src).toString();
  const preferenceKey = "aqua-cookie-preferences";
  const consentEvent = "aqua:consent-updated";
  const anonymousKey = "aqua-anonymous-id";
  let preferences = null;
  let sessionId = "";
  let lastPath = "";

  const boolean = value => value === true;
  const normalizePreferences = value => {
    if (!value || value.version !== 1 || value.necessary !== true) return null;
    return {
      necessary: true,
      preferences: boolean(value.preferences),
      analytics: boolean(value.analytics),
      marketing: boolean(value.marketing),
      version: 1,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    };
  };
  const readPreferences = () => {
    try { return normalizePreferences(JSON.parse(localStorage.getItem(preferenceKey) || "null")); }
    catch { return null; }
  };
  const randomId = () => crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const anonymousId = () => {
    try {
      const existing = localStorage.getItem(anonymousKey);
      if (existing) return existing;
      const created = randomId();
      localStorage.setItem(anonymousKey, created);
      return created;
    } catch { return randomId(); }
  };
  const analyticsSession = () => {
    if (sessionId) return sessionId;
    try {
      sessionId = sessionStorage.getItem("aqua-session") || randomId();
      sessionStorage.setItem("aqua-session", sessionId);
    } catch { sessionId = randomId(); }
    return sessionId;
  };
  const safeUrl = value => {
    if (!value) return undefined;
    try {
      const url = new URL(value, location.origin);
      return url.origin + url.pathname;
    } catch { return undefined; }
  };
  const categoryFor = type => type === "conversion" ? "marketing" : type === "consent" ? "necessary" : "analytics";
  const allowedDataKeys = new Set([
    "message", "metric", "value", "release", "environment", "formName", "impressions",
    "clicks", "position", "experimentId", "variant", "conversionValueCents",
  ]);
  const redactMessage = value => typeof value === "string"
    ? value.slice(0, 2000)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
      .replace(/(?:\+?\d[\d ().-]{6,}\d)/g, "[phone removed]")
      .replace(/https?:\/\/[^\s]+/gi, match => safeUrl(match) || "[url removed]")
    : undefined;
  const safeData = value => {
    if (!value || typeof value !== "object") return {};
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!allowedDataKeys.has(key)) continue;
      result[key] = key === "message" ? redactMessage(entry) : entry;
    }
    return result;
  };
  const permitted = category => category === "necessary"
    || (category === "preferences" && preferences && preferences.preferences)
    || (category === "analytics" && preferences && preferences.analytics)
    || (category === "marketing" && preferences && preferences.marketing);

  const send = (type, data = {}, requestedCategory) => {
    const category = requestedCategory || categoryFor(type);
    if (!permitted(category)) return false;
    const payload = JSON.stringify({
      ...safeData(data),
      siteKey,
      propertyId,
      anonymousId: anonymousId(),
      sessionId: category === "analytics" || category === "marketing" ? analyticsSession() : undefined,
      category,
      type,
      consentVersion: preferences ? preferences.version : 1,
      consentNecessary: true,
      consentPreferences: Boolean(preferences && preferences.preferences),
      consentAnalytics: Boolean(preferences && preferences.analytics),
      consentMarketing: Boolean(preferences && preferences.marketing),
      occurredAt: Date.now(),
      url: safeUrl(location.href),
      path: location.pathname,
      title: document.title,
      referrer: safeUrl(document.referrer),
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: "text/plain" }));
    } else {
      fetch(endpoint, { method: "POST", body: payload, keepalive: true, mode: "cors" }).catch(() => {});
    }
    return true;
  };

  const pageview = () => {
    if (!preferences || !preferences.analytics || location.pathname === lastPath) return;
    lastPath = location.pathname;
    send("pageview");
  };
  const startAnalytics = () => {
    if (!preferences || !preferences.analytics) return;
    pageview();
    queueMicrotask(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      if (navigation && navigation.loadEventEnd) {
        send("performance", { metric: "load", value: Math.round(navigation.loadEventEnd) });
      }
    });
  };
  const applyPreferences = (value, recordChoice) => {
    const next = normalizePreferences(value);
    if (!next) return false;
    const previouslyAllowedAnalytics = Boolean(preferences && preferences.analytics);
    preferences = next;
    if (recordChoice) {
      send("consent", {
        consentVersion: next.version,
        consentNecessary: true,
        consentPreferences: next.preferences,
        consentAnalytics: next.analytics,
        consentMarketing: next.marketing,
      }, "necessary");
    }
    if (!previouslyAllowedAnalytics && next.analytics) startAnalytics();
    return true;
  };

  preferences = readPreferences();
  window.addEventListener(consentEvent, event => {
    const supplied = event instanceof CustomEvent ? event.detail : null;
    applyPreferences(supplied || readPreferences(), true);
  });
  window.addEventListener("error", event => send("error", { message: event.message || "Browser error" }));
  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    send("error", { message: reason && reason.message ? reason.message : String(reason || "Unhandled promise rejection") });
  });
  window.addEventListener("load", startAnalytics, { once: true });
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
      formName: form.dataset.aquaForm || form.dataset.milesymediaForm || form.getAttribute("name") || form.id || "Website form",
      experimentId: form.dataset.aquaExperiment || form.dataset.milesymediaExperiment || undefined,
      variant: form.dataset.aquaVariant || form.dataset.milesymediaVariant || undefined,
    });
  }, true);
  document.addEventListener("click", event => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-aqua-conversion], [data-milesymedia-conversion]")
      : null;
    if (!target) return;
    send("conversion", {
      formName: target.getAttribute("data-aqua-conversion") || target.getAttribute("data-milesymedia-conversion") || "Conversion action",
      experimentId: target.getAttribute("data-aqua-experiment") || target.getAttribute("data-milesymedia-experiment") || undefined,
      variant: target.getAttribute("data-aqua-variant") || target.getAttribute("data-milesymedia-variant") || undefined,
    }, "marketing");
  }, true);

  const tracker = Object.freeze({
    track(type, data = {}, options = {}) { return send(type || "custom", data, options.category); },
    consent: Object.freeze({
      get() { return preferences ? { ...preferences } : null; },
      set(value) {
        const next = normalizePreferences({ ...value, necessary: true, version: 1, updatedAt: new Date().toISOString() });
        if (!next) return false;
        try { localStorage.setItem(preferenceKey, JSON.stringify(next)); } catch {}
        window.dispatchEvent(new CustomEvent(consentEvent, { detail: next }));
        return true;
      },
    }),
  });
  window.Aqua = tracker;
  window.Milesymedia = tracker;
  if (preferences && preferences.analytics && document.readyState === "complete") startAnalytics();
})();`;

export function aquaTagResponse() {
  return new Response(AQUA_TAG_SOURCE, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
      deprecation: "false",
    },
  });
}
