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
  const explorerProtocolVersion = 1;
  const explorerErrors = [];
  const explorerElements = new Map();
  const explorerIds = new WeakMap();
  const explorerOriginals = new Map();
  const explorerSelector = "[data-aqua-edit], [data-portal-edit], h1, h2, h3, h4, h5, h6, p, figcaption, img, a, button";
  let explorerEnabled = false;
  let explorerElementSequence = 0;
  let explorerSelected = null;
  let explorerHover = null;
  let explorerParentOrigin = "*";
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

  const editableElements = () => document.querySelectorAll(explorerSelector).length;
  const explorerCapabilities = () => ({
    inspect: true,
    visualEditing: true,
    editableElements: editableElements(),
  });
  const explorerIdFor = element => {
    const existing = explorerIds.get(element);
    if (existing) return existing;
    explorerElementSequence += 1;
    const id = "aqua-element-" + explorerElementSequence;
    explorerIds.set(element, id);
    explorerElements.set(id, element);
    return id;
  };
  const explorerDescribe = element => {
    const styles = getComputedStyle(element);
    const isImage = element instanceof HTMLImageElement;
    const text = isImage ? "" : String(element.textContent || "").replace(/\s+/g, " ").trim();
    return {
      id: explorerIdFor(element),
      tagName: element.tagName.toLowerCase(),
      kind: isImage ? "image" : "text",
      label: element.getAttribute("data-aqua-edit") || element.getAttribute("data-portal-edit") || element.getAttribute("aria-label") || element.getAttribute("alt") || text.slice(0, 80) || element.tagName.toLowerCase(),
      text: isImage ? undefined : text.slice(0, 5000),
      src: isImage ? element.currentSrc || element.src || "" : undefined,
      alt: isImage ? element.alt || "" : undefined,
      styles: {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight,
        textAlign: styles.textAlign,
      },
    };
  };
  const explorerReportSelection = () => sendToExplorer({
    type: "aqua-explorer:selected",
    version: explorerProtocolVersion,
    element: explorerSelected ? explorerDescribe(explorerSelected) : null,
  });
  const explorerRememberOriginal = element => {
    const id = explorerIdFor(element);
    if (explorerOriginals.has(id)) return;
    explorerOriginals.set(id, {
      html: element instanceof HTMLImageElement ? undefined : element.innerHTML,
      src: element instanceof HTMLImageElement ? element.getAttribute("src") : undefined,
      alt: element instanceof HTMLImageElement ? element.getAttribute("alt") : undefined,
      style: element.getAttribute("style"),
    });
  };
  const explorerSafeImageSource = value => {
    if (!value) return "";
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:", "blob:", "data:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  };
  const explorerPatchElement = (element, patch) => {
    if (!patch || typeof patch !== "object") return;
    explorerRememberOriginal(element);
    if (!(element instanceof HTMLImageElement) && typeof patch.text === "string") element.textContent = patch.text.slice(0, 5000);
    if (element instanceof HTMLImageElement) {
      if (typeof patch.src === "string") {
        const safeSource = explorerSafeImageSource(patch.src);
        if (safeSource) element.src = safeSource;
      }
      if (typeof patch.alt === "string") element.alt = patch.alt.slice(0, 500);
    }
    if (patch.styles && typeof patch.styles === "object") {
      const allowed = ["color", "backgroundColor", "fontSize", "fontWeight", "textAlign"];
      for (const name of allowed) {
        const value = patch.styles[name];
        if (typeof value === "string" && value.length <= 100) element.style[name] = value;
      }
    }
  };
  const explorerReset = () => {
    for (const [id, original] of explorerOriginals.entries()) {
      const element = explorerElements.get(id);
      if (!element || !element.isConnected) continue;
      if (!(element instanceof HTMLImageElement) && original.html !== undefined) element.innerHTML = original.html;
      if (element instanceof HTMLImageElement) {
        if (original.src === null || original.src === undefined) element.removeAttribute("src");
        else element.setAttribute("src", original.src);
        if (original.alt === null || original.alt === undefined) element.removeAttribute("alt");
        else element.setAttribute("alt", original.alt);
      }
      if (original.style === null || original.style === undefined) element.removeAttribute("style");
      else element.setAttribute("style", original.style);
    }
    explorerOriginals.clear();
  };
  const explorerTarget = target => target instanceof Element ? target.closest(explorerSelector) : null;
  const explorerSetHover = element => {
    if (explorerHover && explorerHover !== explorerSelected) explorerHover.classList.remove("aqua-explorer-hover");
    explorerHover = element;
    if (explorerHover && explorerHover !== explorerSelected) explorerHover.classList.add("aqua-explorer-hover");
  };
  const explorerSetSelected = element => {
    if (explorerSelected) explorerSelected.classList.remove("aqua-explorer-selected");
    explorerSelected = element;
    if (explorerSelected) {
      explorerSelected.classList.remove("aqua-explorer-hover");
      explorerSelected.classList.add("aqua-explorer-selected");
    }
  };
  const explorerStyle = document.createElement("style");
  explorerStyle.dataset.aquaExplorer = "true";
  explorerStyle.textContent = ".aqua-explorer-hover{outline:2px dashed #0e7490!important;outline-offset:3px!important;cursor:crosshair!important}.aqua-explorer-selected{outline:3px solid #0891b2!important;outline-offset:3px!important;cursor:crosshair!important}";
  document.head.appendChild(explorerStyle);
  document.addEventListener("mouseover", event => {
    if (!explorerEnabled) return;
    explorerSetHover(explorerTarget(event.target));
  }, true);
  document.addEventListener("mouseout", event => {
    if (!explorerEnabled) return;
    const next = explorerTarget(event.relatedTarget);
    if (next !== explorerHover) explorerSetHover(next);
  }, true);
  document.addEventListener("click", event => {
    if (!explorerEnabled) return;
    const element = explorerTarget(event.target);
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    explorerSetSelected(element);
    explorerReportSelection();
  }, true);
  const explorerPerformance = () => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paints = performance.getEntriesByType("paint");
    const firstContentfulPaint = paints.find(entry => entry.name === "first-contentful-paint");
    return {
      responseMs: navigation ? Math.round(navigation.responseEnd) : undefined,
      domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : undefined,
      loadMs: navigation && navigation.loadEventEnd ? Math.round(navigation.loadEventEnd) : undefined,
      firstContentfulPaintMs: firstContentfulPaint ? Math.round(firstContentfulPaint.startTime) : undefined,
    };
  };
  const explorerConnection = () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return undefined;
    return {
      effectiveType: connection.effectiveType,
      downlinkMbps: connection.downlink,
      saveData: Boolean(connection.saveData),
    };
  };
  const explorerDiagnostics = () => ({
    path: location.pathname,
    title: document.title,
    readyState: document.readyState,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    document: {
      width: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0),
      height: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
    },
    counts: {
      editableElements: editableElements(),
      forms: document.forms.length,
      images: document.images.length,
      links: document.links.length,
      resources: performance.getEntriesByType("resource").length,
    },
    performance: explorerPerformance(),
    connection: explorerConnection(),
    recentErrors: explorerErrors.slice(-8),
  });
  const sendToExplorer = payload => {
    if (window.parent === window) return;
    try { window.parent.postMessage(payload, explorerParentOrigin); } catch {}
  };
  const respondToExplorer = (event, payload) => {
    if (event.source !== window.parent || window.parent === window) return;
    explorerParentOrigin = event.origin && event.origin !== "null" ? event.origin : "*";
    sendToExplorer(payload);
  };
  window.addEventListener("message", event => {
    const message = event.data;
    if (!message || typeof message !== "object" || message.version !== explorerProtocolVersion) return;
    if (message.type === "aqua-explorer:ping" && typeof message.requestId === "string") {
      respondToExplorer(event, {
        type: "aqua-explorer:ready",
        version: explorerProtocolVersion,
        requestId: message.requestId,
        propertyId,
        path: location.pathname,
        title: document.title,
        capabilities: explorerCapabilities(),
      });
    }
    if (message.type === "aqua-explorer:inspect" && typeof message.requestId === "string") {
      respondToExplorer(event, {
        type: "aqua-explorer:diagnostics",
        version: explorerProtocolVersion,
        requestId: message.requestId,
        diagnostics: explorerDiagnostics(),
      });
    }
    if (message.type === "aqua-explorer:enable") {
      explorerEnabled = true;
      document.documentElement.dataset.aquaExplorerActive = "true";
    }
    if (message.type === "aqua-explorer:disable") {
      explorerEnabled = false;
      delete document.documentElement.dataset.aquaExplorerActive;
      explorerSetHover(null);
      explorerSetSelected(null);
      explorerReportSelection();
    }
    if (message.type === "aqua-explorer:patch" && typeof message.elementId === "string") {
      const element = explorerElements.get(message.elementId);
      if (element && element.isConnected) {
        explorerPatchElement(element, message.patch);
        explorerSetSelected(element);
        explorerReportSelection();
      }
    }
    if (message.type === "aqua-explorer:reset") {
      explorerReset();
      explorerReportSelection();
    }
  });

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
  window.addEventListener("error", event => {
    const message = redactMessage(event.message || "Browser error") || "Browser error";
    explorerErrors.push(message);
    send("error", { message });
  });
  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    const message = redactMessage(reason && reason.message ? reason.message : String(reason || "Unhandled promise rejection")) || "Unhandled promise rejection";
    explorerErrors.push(message);
    send("error", { message });
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
