(function aquaBotChallengeBootstrap() {
  "use strict";

  var source = document.currentScript && document.currentScript.src
    ? new URL(document.currentScript.src, window.location.href)
    : new URL("/aqua-bot-challenge.js", window.location.href);
  var configUrl = new URL("/api/public/bot-challenge/config", source.origin).toString();
  var turnstileSrc = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  var states = new WeakMap();
  var scriptPromise = null;
  var config = null;

  function markedForms() {
    return Array.prototype.slice.call(
      document.querySelectorAll("form[data-aqua-challenge-action]"),
    );
  }

  function ensureState(form) {
    var state = states.get(form);
    if (state) return state;
    var hidden = form.querySelector('input[name="captchaToken"]');
    if (!hidden) {
      hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "captchaToken";
      hidden.setAttribute("data-aqua-ignore", "");
      form.appendChild(hidden);
    }
    var mount = document.createElement("div");
    mount.className = "aqua-bot-challenge";
    mount.style.maxWidth = "100%";
    mount.style.overflow = "hidden";
    var status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.style.margin = "6px 0";
    status.style.fontSize = "12px";
    var submit = form.querySelector('[type="submit"]');
    form.insertBefore(mount, submit || null);
    form.insertBefore(status, submit || null);
    state = {
      action: form.getAttribute("data-aqua-challenge-action") || "",
      hidden: hidden,
      mount: mount,
      status: status,
      token: "",
      widgetId: null,
      ready: false,
      failed: false,
      initialized: false,
    };
    states.set(form, state);
    return state;
  }

  function message(state, text, isError) {
    state.status.textContent = text || "";
    state.status.setAttribute("role", isError ? "alert" : "status");
  }

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-aqua-turnstile]');
      var script = existing || document.createElement("script");
      var settled = false;
      var timeout = window.setTimeout(function () {
        failed("turnstile-script-timeout");
      }, 12000);
      function cleanup() {
        window.clearTimeout(timeout);
        script.removeEventListener("load", loaded);
        script.removeEventListener("error", failed);
      }
      function loaded() {
        if (settled) return;
        if (!window.turnstile) {
          failed("turnstile-api-missing");
          return;
        }
        settled = true;
        cleanup();
        resolve(window.turnstile);
      }
      function failed(reason) {
        if (settled) return;
        settled = true;
        cleanup();
        scriptPromise = null;
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error(typeof reason === "string" ? reason : "turnstile-script-failed"));
      }
      script.addEventListener("load", loaded, { once: true });
      script.addEventListener("error", failed, { once: true });
      if (!existing) {
        script.src = turnstileSrc;
        script.async = true;
        script.defer = true;
        script.setAttribute("data-aqua-turnstile", "");
        document.head.appendChild(script);
      }
    });
    return scriptPromise;
  }

  function render(form) {
    var state = ensureState(form);
    if (state.initialized) return;
    if (!config) {
      message(state, "Loading verification…", false);
      return;
    }
    if (!config.enabled || !config.siteKey) {
      state.initialized = true;
      state.ready = config.required !== true;
      state.failed = config.required === true;
      message(
        state,
        config.required ? "Verification is temporarily unavailable. Please try again later." : "",
        config.required === true,
      );
      return;
    }
    if (!state.action) {
      state.initialized = true;
      state.failed = true;
      message(state, "This form's verification action is missing.", true);
      return;
    }
    state.ready = false;
    state.failed = false;
    state.initialized = true;
    message(state, "Loading verification…", false);
    loadTurnstile().then(function (api) {
      if (state.widgetId !== null) return;
      state.widgetId = api.render(state.mount, {
        sitekey: config.siteKey,
        action: state.action,
        theme: "auto",
        retry: "auto",
        "refresh-expired": "auto",
        callback: function (token) {
          state.token = token;
          state.hidden.value = token;
          state.ready = true;
          state.failed = false;
          message(state, "Verification complete.", false);
        },
        "error-callback": function () {
          state.token = "";
          state.hidden.value = "";
          state.ready = false;
          state.failed = true;
          message(state, "Verification failed to load. Please try again.", true);
        },
        "expired-callback": function () {
          state.token = "";
          state.hidden.value = "";
          state.ready = false;
          message(state, "Verification expired. Please complete it again.", true);
        },
        "timeout-callback": function () {
          state.token = "";
          state.hidden.value = "";
          state.ready = false;
          state.failed = true;
          message(state, "Verification timed out. Please try again.", true);
        },
      });
    }).catch(function () {
      state.ready = false;
      state.failed = true;
      message(state, "Verification failed to load. Please refresh and try again.", true);
    });
  }

  function reset(form) {
    var state = states.get(form);
    if (!state) return;
    state.token = "";
    state.hidden.value = "";
    state.ready = config ? config.required !== true && config.enabled !== true : false;
    if (window.turnstile && state.widgetId !== null) {
      try { window.turnstile.reset(state.widgetId); } catch (_) {}
    }
  }

  window.AquaBotChallenge = Object.freeze({
    tokenFor: function (form) {
      var state = states.get(form);
      return state ? state.token : "";
    },
    reset: reset,
    ready: function (form) {
      var state = states.get(form);
      return Boolean(state && state.ready);
    },
  });

  // Capture phase means a fast click cannot outrun a page's own React/plain-JS
  // submit handler while configuration or the challenge is still pending.
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-aqua-challenge-action]")) return;
    var state = ensureState(form);
    if (state.ready) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    message(
      state,
      state.failed ? "Verification is unavailable. Please try again." : "Please complete verification before sending.",
      true,
    );
  }, true);

  fetch(configUrl, { cache: "no-store", credentials: "omit", mode: "cors" })
    .then(function (response) {
      if (!response.ok) throw new Error("challenge-config-unavailable");
      return response.json();
    })
    .then(function (payload) {
      config = {
        enabled: payload && payload.enabled === true,
        required: payload && payload.required === true,
        siteKey: payload && typeof payload.siteKey === "string" ? payload.siteKey : "",
      };
      markedForms().forEach(render);
    })
    .catch(function () {
      config = { enabled: false, required: true, siteKey: "" };
      markedForms().forEach(render);
    });

  function start() { markedForms().forEach(render); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  if (typeof MutationObserver === "function") {
    new MutationObserver(start).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
