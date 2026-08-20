export const AQUA_TAG_SOURCE = String.raw`(() => {
  if (window.__aquaTagLoaded) return;
  window.__aquaTagLoaded = true;

  const script = document.currentScript;
  const siteKey = script && script.dataset ? script.dataset.siteKey || "" : "";
  const propertyId = script && script.dataset ? script.dataset.property || "" : "";
  if (!siteKey || !script || !script.src) return;

  const endpoint = new URL("/api/telemetry/collect", script.src).toString();
  const captureEndpoint = new URL("/api/public/form-capture", script.src).toString();
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

  // ── Consent-gated tag manager ───────────────────────────────────────────
  // Tools configured for this site (GA4/GTM/PostHog/pixels/Search Console) are
  // fetched once from the config endpoint and each is injected only when its
  // consent category is granted — retroactively when the visitor later opts in,
  // the same way analytics starts. v1 is an allow-list by id/key: the server
  // validates every value, so nothing arbitrary reaches the page. Every step is
  // wrapped — a failing tool must never break the site or the enquiry capture.
  const configEndpoint = new URL("/api/public/aqua-tag-config?key=" + encodeURIComponent(siteKey) + "&host=" + encodeURIComponent(location.host), script.src).toString();
  let injectionConfig = [];
  const injectedKeys = {};
  const injectScript = src => {
    const element = document.createElement("script");
    element.async = true;
    element.src = src;
    (document.head || document.documentElement).appendChild(element);
    return element;
  };
  let gtagLoaded = false;
  const gtagConfig = id => {
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) { window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag("js", new Date()); }
    if (!gtagLoaded) { injectScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id)); gtagLoaded = true; }
    window.gtag("config", id);
  };
  const injectTool = item => {
    const value = item.value;
    if (item.kind === "gsc-verification") {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "google-site-verification");
      meta.setAttribute("content", value);
      (document.head || document.documentElement).appendChild(meta);
    } else if (item.kind === "ga4" || item.kind === "google-ads") {
      gtagConfig(value);
    } else if (item.kind === "gtm") {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      injectScript("https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(value));
    } else if (item.kind === "meta-pixel") {
      if (!window.fbq) {
        const fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
        window.fbq = fbq; fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
        injectScript("https://connect.facebook.net/en_US/fbevents.js");
      }
      window.fbq("init", value);
      window.fbq("track", "PageView");
    } else if (item.kind === "posthog") {
      injectScript("https://app.posthog.com/static/array.js").addEventListener("load", () => {
        try { if (window.posthog && window.posthog.init) window.posthog.init(value, { api_host: "https://app.posthog.com" }); } catch { /* posthog init is best-effort */ }
      });
    } else if (item.kind === "linkedin") {
      window._linkedin_partner_id = value;
      window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
      window._linkedin_data_partner_ids.push(value);
      injectScript("https://snap.licdn.com/li.lms-analytics/insight.min.js");
    }
  };
  const runInjections = () => {
    for (const item of injectionConfig) {
      if (!item || !item.kind || !item.value) continue;
      const key = item.kind + ":" + item.value;
      if (injectedKeys[key]) continue;
      // Fail CLOSED. An item with no consent category — or one this tag does
      // not recognise — is HELD, never treated as "necessary". Defaulting an
      // unlabelled tool to "necessary" would fire it before consent, so a
      // server-side config gap could silently leak an analytics/marketing tag.
      // (permitted() returns falsy for undefined + unknown categories.)
      if (!permitted(item.consentCategory)) continue;
      injectedKeys[key] = true;
      try { injectTool(item); } catch { /* one tool failing must never break the page or the others */ }
    }
  };
  const loadInjections = () => {
    // No fetch (very old browsers) → no injections, never a thrown init.
    if (typeof fetch !== "function") return;
    fetch(configEndpoint, { mode: "cors", credentials: "omit" })
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (data && Array.isArray(data.injections)) { injectionConfig = data.injections; runInjections(); } })
      .catch(() => {});
  };

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
    // A newly-granted category lets its held tools fire now, retroactively.
    runInjections();
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
  loadInjections();
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
  // ── What a form actually contained ──────────────────────────────────────
  //
  // The telemetry event above is analytics: it counts submissions and strips
  // personal data on purpose. That is why the inbox never knew which form a
  // message came from or what was typed into it — the only path carrying the
  // answers was whatever the website chose to POST itself, and everything
  // outside a fixed dozen keys was dropped.
  //
  // This captures the submission as it stands and posts it separately. It runs
  // on public websites, so it is deliberately narrow about what it will touch.

  const sensitiveName = /(pass|pwd|secret|token|csrf|nonce|otp|cvv|cvc|card|iban|sortcode|sort_code|account_number|ssn|nino)/i;

  // Never leaves the page. A login form, a payment field or a CSRF token is
  // not an enquiry, and hoovering them up would be a breach dressed as a
  // feature — no configuration mistake should be able to switch this off.
  const captureableField = field => {
    if (!field || !field.name) return false;
    if (field.disabled) return false;
    const type = (field.type || "text").toLowerCase();
    if (type === "password" || type === "hidden" || type === "file" || type === "search") return false;
    if (sensitiveName.test(field.name)) return false;
    if (/^(cc-|current-password|new-password)/i.test(field.autocomplete || "")) return false;
    if (typeof field.closest === "function" && field.closest("[data-aqua-ignore]")) return false;
    return true;
  };

  const labelFor = field => {
    const wrapping = typeof field.closest === "function" ? field.closest("label") : null;
    if (wrapping && wrapping.textContent) return wrapping.textContent.trim().slice(0, 120);
    const id = field.id;
    if (id && typeof document.querySelector === "function" && typeof CSS !== "undefined" && CSS.escape) {
      const label = document.querySelector('label[for="' + CSS.escape(id) + '"]');
      if (label && label.textContent) return label.textContent.trim().slice(0, 120);
    }
    if (typeof field.getAttribute !== "function") return undefined;
    return field.getAttribute("aria-label") || field.getAttribute("placeholder") || undefined;
  };

  // A form is captured when the site marked it, or when it plainly asks for a
  // way to reply. Anything else — search boxes, filters, logins — is left
  // alone: capturing every form on a site would collect far more than anybody
  // consented to hand over.
  const capturableForm = form => {
    const dataset = form.dataset || {};
    const find = selector => typeof form.querySelector === "function" ? form.querySelector(selector) : null;
    if (typeof form.closest === "function" && form.closest("[data-aqua-ignore]")) return false;
    if (dataset.aquaIgnore !== undefined) return false;
    if (dataset.aquaForm !== undefined || dataset.aquaCapture !== undefined) return true;
    if (find('input[type="password"]')) return false;
    return Boolean(find('input[type="email"], input[type="tel"], input[name*="email" i], input[name*="phone" i]'));
  };

  const readField = field => {
    const type = (field.type || field.tagName.toLowerCase()).toLowerCase();
    if (type === "checkbox") return field.checked ? (field.value && field.value !== "on" ? field.value : "Yes") : "";
    if (type === "radio") return field.checked ? field.value : "";
    if (field.tagName === "SELECT" && field.multiple) {
      return Array.from(field.selectedOptions).map(option => option.textContent.trim() || option.value).join(", ");
    }
    if (field.tagName === "SELECT") {
      const option = field.selectedOptions && field.selectedOptions[0];
      return option ? (option.textContent.trim() || option.value) : field.value;
    }
    return typeof field.value === "string" ? field.value : "";
  };

  const captureSubmission = form => {
    const fields = [];
    const seen = new Map();
    for (const field of Array.from(form.elements || [])) {
      if (!captureableField(field)) continue;
      const value = readField(field);
      if (!value || !value.trim()) continue;
      // Radio groups and repeated checkboxes share one name; joining keeps the
      // whole answer rather than whichever happened to be last.
      if (seen.has(field.name)) {
        const existing = seen.get(field.name);
        existing.value = (existing.value + ", " + value.trim()).slice(0, 2000);
        continue;
      }
      const entry = {
        key: field.name.slice(0, 120),
        label: labelFor(field),
        value: value.trim().slice(0, 2000),
        type: (field.type || field.tagName.toLowerCase()).toLowerCase(),
      };
      seen.set(field.name, entry);
      fields.push(entry);
      if (fields.length >= 60) break;
    }
    return fields;
  };

  document.addEventListener("submit", event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const formName = form.dataset.aquaForm || form.dataset.milesymediaForm || form.getAttribute("name") || form.id || "Website form";
    send("form", {
      formName,
      experimentId: form.dataset.aquaExperiment || form.dataset.milesymediaExperiment || undefined,
      variant: form.dataset.aquaVariant || form.dataset.milesymediaVariant || undefined,
    });

    // Everything below is wrapped, not just the request.
    //
    // This handler runs inside the website's own submit event on somebody
    // else's site. A throw here — an exotic form, a element without the DOM
    // methods this assumes, a browser quirk — would surface as their contact
    // form breaking, which is a far worse outcome than a missing capture. The
    // guard covers reading the form as well as sending it, because reading is
    // where the assumptions are.
    try {
      if (!capturableForm(form)) return;
      const fields = captureSubmission(form);
      if (!fields.length) return;
      const payload = {
        siteKey,
        propertyId: propertyId || undefined,
        formName,
        formId: form.id || undefined,
        purpose: (form.dataset && form.dataset.aquaPurpose) || undefined,
        pageUrl: safeUrl(location.href),
        pagePath: location.pathname,
        submittedAt: new Date().toISOString(),
        fields,
      };
      // keepalive so the record survives the navigation a submit usually causes.
      fetch(captureEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        mode: "cors",
        credentials: "omit",
      }).catch(() => {});
    } catch { /* a failed capture must never break the website's own submit */ }
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
