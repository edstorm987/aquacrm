(function () {
  "use strict";

  const CONSENT_KEY = "aqua-cookie-preferences";
  const CONSENT_COOKIE = "aqua_cookie_preferences";
  const CONSENT_VERSION = 1;

  function setupCookieSettings() {
    if (window.__aquaConsentReady) return;
    const banner = document.querySelector("[data-cookie-banner]");
    const dialog = document.querySelector("[data-cookie-dialog]");
    const reopen = document.querySelector("[data-cookie-reopen]");
    if (!banner || !dialog || !reopen) return;

    function readConsent() {
      try {
        const value = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
        return value && value.necessary === true && value.version === CONSENT_VERSION ? value : null;
      } catch {
        return null;
      }
    }

    function saveConsent(values, source) {
      const choice = {
        version: CONSENT_VERSION,
        necessary: true,
        preferences: Boolean(values.preferences),
        analytics: Boolean(values.analytics),
        marketing: Boolean(values.marketing),
        updatedAt: new Date().toISOString(),
        source,
      };
      localStorage.setItem(CONSENT_KEY, JSON.stringify(choice));
      document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(choice))}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
      banner.hidden = true;
      dialog.close();
      window.dispatchEvent(new CustomEvent("aqua:consent-updated", { detail: choice }));
    }

    function populateConsent() {
      const choice = readConsent() || {};
      dialog.querySelector("[data-cookie-preferences]").checked = Boolean(choice.preferences);
      dialog.querySelector("[data-cookie-analytics]").checked = Boolean(choice.analytics);
      dialog.querySelector("[data-cookie-marketing]").checked = Boolean(choice.marketing);
    }

    document.querySelector("[data-cookie-reject]")?.addEventListener("click", () => saveConsent({}, "banner-reject"));
    document.querySelector("[data-cookie-accept]")?.addEventListener("click", () => saveConsent({ preferences: true, analytics: true, marketing: true }, "banner-accept"));
    document.querySelector("[data-cookie-manage]")?.addEventListener("click", () => { populateConsent(); dialog.showModal(); });
    reopen.addEventListener("click", () => { populateConsent(); dialog.showModal(); });
    document.querySelector("[data-cookie-save]")?.addEventListener("click", () => saveConsent({
      preferences: dialog.querySelector("[data-cookie-preferences]").checked,
      analytics: dialog.querySelector("[data-cookie-analytics]").checked,
      marketing: dialog.querySelector("[data-cookie-marketing]").checked,
    }, "settings-save"));
    document.querySelector("[data-cookie-dialog-accept]")?.addEventListener("click", () => saveConsent({ preferences: true, analytics: true, marketing: true }, "settings-accept"));
    banner.hidden = Boolean(readConsent());
  }

  function enquiryPayload(form, channel) {
    const data = new FormData(form);
    const service = data.get("service");
    const services = service ? [service] : data.getAll("services");
    return {
      brand: "aquacrm",
      channel,
      services,
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone") || "",
      contactMethod: data.get("contactMethod") || "email",
      message: data.get("message"),
      sourceUrl: window.location.href,
      campaign: new URLSearchParams(window.location.search).get("utm_campaign") || "",
      consent: data.get("consent") === "on" || data.get("consent") === "yes",
      website: data.get("website"),
    };
  }

  async function submitEnquiry(form, channel, status, submit) {
    submit.disabled = true;
    const previousLabel = submit.innerHTML;
    submit.textContent = "Sending...";
    status.textContent = "";
    status.classList.remove("is-error");
    try {
      const response = await fetch("/api/public/brand-enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(enquiryPayload(form, channel)),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "We could not send that message.");
      form.reset();
      status.textContent = channel === "chatbot"
        ? "Received. Your message is now in the AquaCRM enquiry queue."
        : "Received. Your enquiry is now in AquaCRM and we will reply using your chosen method.";
      submit.textContent = "Sent";
      window.setTimeout(() => { submit.innerHTML = previousLabel; submit.disabled = false; }, 2200);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "We could not send that message.";
      status.classList.add("is-error");
      submit.innerHTML = previousLabel;
      submit.disabled = false;
    }
  }

  function setupLeadChat() {
    const shell = document.querySelector("[data-lead-chat]");
    const launch = shell?.querySelector("[data-lead-chat-launch]");
    const panel = shell?.querySelector("[data-lead-chat-panel]");
    const close = shell?.querySelector("[data-lead-chat-close]");
    const form = shell?.querySelector("[data-chat-enquiry]");
    if (!shell || !launch || !panel || !form) return;

    function setOpen(open) {
      shell.classList.toggle("is-open", open);
      panel.hidden = !open;
      launch.setAttribute("aria-expanded", String(open));
      if (open) window.setTimeout(() => form.querySelector("input[name='name']")?.focus(), 40);
    }

    launch.addEventListener("click", () => setOpen(panel.hidden));
    close?.addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !panel.hidden) setOpen(false); });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitEnquiry(form, "chatbot", form.querySelector("[data-chat-status]"), form.querySelector("button[type='submit']"));
    });
  }

  function setupFullEnquiry() {
    document.querySelectorAll("[data-full-enquiry]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        submitEnquiry(form, "form", form.querySelector("[data-form-status]"), form.querySelector("button[type='submit']"));
      });
    });
  }

  function youtubeId(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1).split("/")[0];
      if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2] || "";
      if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/")[2] || "";
      return parsed.searchParams.get("v") || "";
    } catch {
      return /^[a-zA-Z0-9_-]{11}$/.test(url) ? url : "";
    }
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "--:--";
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  }

  function loadYouTubeApi() {
    if (window.YT?.Player) return Promise.resolve();
    return new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(); };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    });
  }

  function setupVsl() {
    const shell = document.querySelector("[data-vsl]");
    if (!shell) return;
    const source = shell.dataset.youtubeUrl || window.AQUACRM_VSL_URL || "";
    const videoId = youtubeId(source);
    const poster = shell.querySelector("[data-vsl-poster]");
    const youtube = shell.querySelector("[data-vsl-youtube]");
    const notice = shell.querySelector("[data-vsl-notice]");
    const toggle = shell.querySelector("[data-vsl-toggle]");
    const progress = shell.querySelector("[data-vsl-progress]");
    const current = shell.querySelector("[data-vsl-current]");
    const duration = shell.querySelector("[data-vsl-duration]");
    let player = null;
    let playing = false;
    let ticker = null;

    function sync() {
      if (!player?.getDuration) return;
      const total = player.getDuration() || 0;
      const elapsed = player.getCurrentTime() || 0;
      current.textContent = formatTime(elapsed);
      duration.textContent = formatTime(total);
      progress.value = total ? String(Math.round((elapsed / total) * 1000)) : "0";
    }

    async function start() {
      if (!videoId) {
        notice.hidden = false;
        notice.focus?.();
        return;
      }
      poster.hidden = true;
      youtube.hidden = false;
      if (player) {
        player.playVideo();
        return;
      }
      await loadYouTubeApi();
      const mount = document.createElement("div");
      mount.id = `aquacrm-vsl-youtube-${Date.now()}`;
      youtube.replaceChildren(mount);
      player = new window.YT.Player(mount.id, {
        videoId,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, enablejsapi: 1, modestbranding: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: (event) => { event.target.playVideo(); sync(); },
          onStateChange: (event) => {
            playing = event.data === window.YT.PlayerState.PLAYING;
            toggle.textContent = playing ? "Ⅱ" : "▶";
            toggle.setAttribute("aria-label", playing ? "Pause video" : "Play video");
            shell.classList.toggle("is-playing", playing);
            if (event.data === window.YT.PlayerState.ENDED) shell.classList.remove("is-mini");
          },
        },
      });
      ticker = window.setInterval(sync, 500);
    }

    shell.querySelector("[data-vsl-start]")?.addEventListener("click", start);
    toggle?.addEventListener("click", () => {
      if (!player) { start(); return; }
      if (playing) player.pauseVideo(); else player.playVideo();
    });
    shell.querySelector("[data-vsl-restart]")?.addEventListener("click", () => { if (!player) start(); else { player.seekTo(0, true); player.playVideo(); } });
    shell.querySelector("[data-vsl-mute]")?.addEventListener("click", (event) => {
      if (!player) return;
      if (player.isMuted()) { player.unMute(); event.currentTarget.textContent = "Sound"; }
      else { player.mute(); event.currentTarget.textContent = "Muted"; }
    });
    shell.querySelector("[data-vsl-fullscreen]")?.addEventListener("click", () => shell.querySelector(".vsl-frame")?.requestFullscreen?.());
    shell.querySelector("[data-vsl-close]")?.addEventListener("click", () => {
      player?.destroy?.();
      player = null;
      playing = false;
      shell.classList.remove("is-mini", "is-playing");
      youtube.replaceChildren();
      youtube.hidden = true;
      poster.hidden = false;
      toggle.textContent = "▶";
    });
    progress?.addEventListener("input", () => {
      const total = player?.getDuration?.() || 0;
      if (total) player.seekTo((Number(progress.value) / 1000) * total, true);
    });

    const section = shell.closest(".platform-proof");
    if (section && "IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => {
        shell.classList.toggle("is-mini", Boolean(player && playing && !entry.isIntersecting && window.innerWidth > 900));
      }, { threshold: 0.08 }).observe(section);
    }
    window.addEventListener("pagehide", () => { if (ticker) window.clearInterval(ticker); });
  }

  setupCookieSettings();
  setupLeadChat();
  setupFullEnquiry();
  setupVsl();
}());
