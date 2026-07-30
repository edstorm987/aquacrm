/* Business OS splash — self-contained vanilla JS for static HTML pages.
   Renders a teal-gradient splash screen on every page load and dissolves
   once the window has loaded + a min-display floor. Mirrors the React
   <LoadingScreen /> in the Next routes. */
(function () {
  if (window.__bosSplashMounted) return;
  window.__bosSplashMounted = true;
  var MIN_MS = 900;
  var FADE_MS = 600;
  var G1 = "#7DD3FC";
  var G2 = "#0E7490";

  var css = ""
    + ".bos-splash{position:fixed;inset:0;z-index:99999;background:radial-gradient(ellipse at 50% 40%, #0A1F2E 0%, #050505 60%, #000 100%);display:flex;align-items:center;justify-content:center;overflow:hidden;animation:bos-splash-in .4s cubic-bezier(.16,1,.3,1) both}"
    + ".bos-splash-out{animation:bos-splash-out .6s cubic-bezier(.6,0,.4,1) both;pointer-events:none}"
    + ".bos-splash-glow{position:absolute;inset:-20%;background:radial-gradient(circle at 50% 50%, rgba(125,211,252,.18) 0%, transparent 50%);animation:bos-splash-glow 2.4s ease-in-out infinite;filter:blur(24px)}"
    + ".bos-splash-inner{position:relative;display:flex;flex-direction:column;align-items:center;gap:18px;z-index:1}"
    + ".bos-splash-mark{animation:bos-splash-mark-in .9s cubic-bezier(.16,1,.3,1) both, bos-splash-mark-float 3.6s ease-in-out .9s infinite;filter:drop-shadow(0 8px 32px rgba(125,211,252,.35))}"
    + ".bos-splash-wordmark{font-family:\"Playfair Display\",Georgia,serif;font-size:32px;font-weight:700;letter-spacing:-.02em;color:#FAF7EE;opacity:0;animation:bos-splash-fade .8s .3s cubic-bezier(.16,1,.3,1) both}"
    + ".bos-splash-accent{background:linear-gradient(135deg," + G1 + " 0%," + G2 + " 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;margin-left:2px}"
    + ".bos-splash-tag{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:rgba(125,211,252,.65);font-weight:600;opacity:0;animation:bos-splash-fade .8s .55s cubic-bezier(.16,1,.3,1) both}"
    + ".bos-splash-progress{width:120px;height:2px;background:rgba(125,211,252,.12);border-radius:999px;overflow:hidden;margin-top:14px;opacity:0;animation:bos-splash-fade .8s .7s cubic-bezier(.16,1,.3,1) both}"
    + ".bos-splash-progress span{display:block;height:100%;width:30%;background:linear-gradient(90deg,transparent 0%," + G1 + " 50%,transparent 100%);animation:bos-splash-bar 1.4s linear infinite}"
    + "@keyframes bos-splash-in{from{opacity:0}to{opacity:1}}"
    + "@keyframes bos-splash-out{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.04);visibility:hidden}}"
    + "@keyframes bos-splash-glow{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}"
    + "@keyframes bos-splash-mark-in{0%{opacity:0;transform:scale(.6) rotate(-12deg)}100%{opacity:1;transform:scale(1) rotate(0)}}"
    + "@keyframes bos-splash-mark-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}"
    + "@keyframes bos-splash-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}"
    + "@keyframes bos-splash-bar{0%{transform:translateX(-100%)}100%{transform:translateX(450%)}}"
    + "@media (prefers-reduced-motion: reduce){.bos-splash,.bos-splash-glow,.bos-splash-mark,.bos-splash-wordmark,.bos-splash-tag,.bos-splash-progress,.bos-splash-progress span{animation:none!important}.bos-splash-out{display:none!important}}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var el = document.createElement("div");
  el.className = "bos-splash";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = ""
    + "<div class=\"bos-splash-glow\"></div>"
    + "<div class=\"bos-splash-inner\">"
    +   "<div class=\"bos-splash-mark\">"
    +     "<svg viewBox=\"0 0 64 64\" width=\"64\" height=\"64\" aria-hidden=\"true\">"
    +       "<defs><linearGradient id=\"bosGrad\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0%\" stop-color=\"" + G1 + "\"/><stop offset=\"100%\" stop-color=\"" + G2 + "\"/></linearGradient></defs>"
    +       "<rect x=\"6\" y=\"6\" width=\"52\" height=\"52\" rx=\"14\" fill=\"url(#bosGrad)\"/>"
    +       "<text x=\"32\" y=\"42\" text-anchor=\"middle\" font-family=\"Playfair Display, Georgia, serif\" font-size=\"28\" font-weight=\"700\" fill=\"#0A0A0A\">M</text>"
    +     "</svg>"
    +   "</div>"
    +   "<div class=\"bos-splash-wordmark\"><span>Milesy</span><span class=\"bos-splash-accent\">Media</span></div>"
    +   "<div class=\"bos-splash-tag\">Business OS</div>"
    +   "<div class=\"bos-splash-progress\"><span></span></div>"
    + "</div>";

  function mount() {
    if (!document.body) { setTimeout(mount, 16); return; }
    document.body.appendChild(el);
    var start = Date.now();
    function finish() {
      var wait = Math.max(0, MIN_MS - (Date.now() - start));
      setTimeout(function () {
        el.classList.add("bos-splash-out");
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, FADE_MS);
      }, wait);
    }
    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });
  }
  mount();
})();
