"use client";

import Link from "next/link";
import { Bell, Check, ChevronRight, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  LATEST_RELEASE,
  RELEASE_SEEN_EVENT,
  RELEASE_STORAGE_KEY,
  formatReleaseDate,
} from "@/lib/releases";

interface Props {
  operationalCount: number;
  inboxHref: string;
}

export function NotificationCentreButton({ operationalCount, inboxHref }: Props) {
  const [open, setOpen] = useState(false);
  const [updateUnread, setUpdateUnread] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncReleaseState = () => {
      setUpdateUnread(window.localStorage.getItem(RELEASE_STORAGE_KEY) !== LATEST_RELEASE.version);
    };
    syncReleaseState();
    window.addEventListener(RELEASE_SEEN_EVENT, syncReleaseState);
    return () => window.removeEventListener(RELEASE_SEEN_EVENT, syncReleaseState);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function markReleaseRead() {
    window.localStorage.setItem(RELEASE_STORAGE_KEY, LATEST_RELEASE.version);
    window.dispatchEvent(new Event(RELEASE_SEEN_EVENT));
    setUpdateUnread(false);
  }

  const unread = operationalCount + (updateUnread ? 1 : 0);
  const display = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications — ${unread} unread`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        onClick={() => setOpen(value => !value)}
        className="relative grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/60 shadow-sm transition hover:border-black/20 hover:bg-black/[0.025]"
      >
        <Bell size={16} aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-white">
            {display}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          role="dialog"
          aria-label="Notification centre"
          className="fixed right-3 top-14 z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] sm:absolute sm:right-0 sm:top-11"
        >
          <header className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-black/85">Notifications</h2>
              <p className="mt-0.5 text-[11px] text-black/45">Business attention and AquaCRM updates.</p>
            </div>
            {unread === 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"><Check size={12} />Up to date</span>
            ) : null}
          </header>

          <div className="divide-y divide-black/[0.07]">
            <Link
              href={`${inboxHref}?view=alerts`}
              onClick={() => setOpen(false)}
              className="group flex items-start gap-3 px-4 py-3.5 transition hover:bg-black/[0.025]"
            >
              <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${operationalCount > 0 ? "bg-red-50 text-red-700" : "bg-black/[0.04] text-black/40"}`}>
                <Bell size={15} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <strong className="text-sm font-semibold text-black/75">Business attention</strong>
                  <span className="text-xs font-semibold text-black/45">{operationalCount}</span>
                </span>
                <span className="mt-1 block text-xs leading-5 text-black/45">
                  {operationalCount > 0 ? "Open the master inbox to work through live alerts." : "Nothing currently needs your attention."}
                </span>
              </span>
              <ChevronRight size={15} className="mt-2 shrink-0 text-black/25 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>

            <Link
              href="/portal/agency/settings#updates"
              onClick={() => {
                markReleaseRead();
                setOpen(false);
              }}
              className="group flex items-start gap-3 px-4 py-3.5 transition hover:bg-black/[0.025]"
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700">
                <Sparkles size={15} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm font-semibold text-black/75">AquaCRM {LATEST_RELEASE.version}</strong>
                  {updateUnread ? <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[9px] font-semibold uppercase text-white">New</span> : null}
                </span>
                <span className="mt-1 block text-xs font-medium text-black/60">{LATEST_RELEASE.title}</span>
                <span className="mt-1 block text-[11px] text-black/40">Released {formatReleaseDate(LATEST_RELEASE.releasedAt)}</span>
              </span>
              <ChevronRight size={15} className="mt-2 shrink-0 text-black/25 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>

          <footer className="border-t border-black/10 bg-black/[0.018] px-4 py-2.5 text-right">
            <Link href="/portal/agency/settings#updates" onClick={() => { markReleaseRead(); setOpen(false); }} className="text-xs font-semibold text-black/55 underline decoration-black/20 underline-offset-4 hover:text-black">
              Explore what&apos;s new
            </Link>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
