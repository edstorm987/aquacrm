"use client";
// Floating "M" handle — appears ONLY when the nav has been folded away
// via the side-tab. Click → restores the nav (un-folds). Doubles as
// the visual anchor of where the brand "lives" while the nav is gone.

export function FloatingChat() {
  const restore = () => {
    document.body.classList.remove("mm-nav-side-folded");
  };

  return (
    <div className="mm-chat">
      <button
        type="button"
        className="mm-chat-launcher"
        aria-label="Restore navigation"
        title="Bring the nav back"
        onClick={restore}
      >
        <span className="mm-chat-mark">M</span>
        <span className="mm-chat-pulse" aria-hidden />
      </button>
    </div>
  );
}
