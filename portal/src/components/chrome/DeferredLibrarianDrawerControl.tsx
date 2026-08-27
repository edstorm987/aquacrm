"use client";

import { BookText } from "lucide-react";
import { useState, type ComponentType } from "react";

interface LibrarianControlProps {
  agencyId: string;
  userId?: string;
  userName?: string;
  initiallyOpen?: boolean;
}

let librarianModule: Promise<typeof import("@/components/chrome/LibrarianDrawerControl")> | null = null;

function loadLibrarian() {
  librarianModule ??= import("@/components/chrome/LibrarianDrawerControl").catch(error => {
    librarianModule = null;
    throw error;
  });
  return librarianModule;
}

/**
 * Keep the closed Dev Team Librarian to one small trigger. Its drawer/editor
 * graph is loaded on intent and its file world is requested only after the
 * drawer mounts, so an ordinary Home response never waits for either.
 */
export function DeferredLibrarianDrawerControl(props: LibrarianControlProps) {
  const [Control, setControl] = useState<ComponentType<LibrarianControlProps> | null>(null);
  const [opening, setOpening] = useState(false);

  if (Control) return <Control {...props} initiallyOpen={opening} />;

  const preload = () => { void loadLibrarian().catch(() => undefined); };
  const open = () => {
    setOpening(true);
    void loadLibrarian()
      .then(module => setControl(() => module.LibrarianDrawerControl))
      .catch(() => setOpening(false));
  };

  return (
    <button
      type="button"
      onMouseEnter={preload}
      onFocus={preload}
      onClick={open}
      aria-label="Open Librarian"
      aria-expanded="false"
      className="mm-has-attention-badge relative inline-flex size-9 items-center justify-center gap-2 overflow-visible rounded-md border border-[color:var(--dev-line)] bg-[color:var(--dev-surface-raised)] text-[color:var(--dev-ink-muted)] transition hover:bg-[color:var(--dev-surface)] hover:text-[color:var(--dev-ink)] xl:w-auto xl:px-3"
    >
      <BookText size={16} aria-hidden="true" />
      <span className="hidden text-xs font-semibold xl:inline">{opening ? "Opening…" : "Librarian"}</span>
    </button>
  );
}
