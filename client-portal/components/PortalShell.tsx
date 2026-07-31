"use client";

import {
  Aperture,
  Camera,
  CircleUserRound,
  Download,
  ExternalLink,
  Home,
  Images,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  PanelsTopLeft,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { PortalSession } from "@/lib/auth";

const clientLinks = [
  { href: "/portal", label: "Home", icon: Home },
  { href: "/portal/shoots", label: "Shoots", icon: Camera },
  { href: "/portal/downloads", label: "Downloads", icon: Download },
  { href: "/portal/aqua", label: "Your Aqua account", icon: PanelsTopLeft },
  { href: "/portal/support", label: "Support", icon: LifeBuoy },
  { href: "/portal/account", label: "Account", icon: CircleUserRound },
];

export default function PortalShell({
  session,
  children,
}: {
  session: PortalSession;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = session.role === "admin"
    ? [
        { href: "/portal", label: "Client view", icon: Images },
        { href: "/portal/admin", label: "Admin workspace", icon: LayoutDashboard },
        { href: "/portal/aqua", label: "AquaOasis-Web", icon: PanelsTopLeft },
        ...clientLinks.slice(1),
      ]
    : clientLinks;

  function isActive(href: string) {
    return href === "/portal" ? pathname === href : pathname.startsWith(href);
  }

  return (
    <div className="portal-frame">
      <aside className={`portal-sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <Aperture size={24} />
          <div><strong>Milesymedia</strong><span>Client portal</span></div>
          <button className="mobile-close" type="button" aria-label="Close menu" onClick={() => setOpen(false)}><X size={19} /></button>
        </div>
        <nav aria-label="Portal navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={`${href}-${label}`} href={href} className={isActive(href) ? "active" : ""} onClick={() => setOpen(false)}>
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{session.name.slice(0, 1)}</span>
          <div><strong>{session.name}</strong><span>{session.role === "admin" ? "Administrator" : "Client"}</span></div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
          </form>
        </div>
      </aside>
      {open ? <button className="sidebar-scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <div className="portal-main">
        <header className="portal-topbar">
          <button className="mobile-menu" type="button" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div>
            <span>Private workspace</span>
            <strong>{session.role === "admin" ? "Admin mode" : "Your Milesymedia home"}</strong>
          </div>
          <a href={process.env.NEXT_PUBLIC_MILESYMEDIA_WEBSITE_URL || "http://localhost:3030"} target="_blank" rel="noreferrer">
            Website <ExternalLink size={14} />
          </a>
        </header>
        <div className="portal-content">{children}</div>
      </div>
    </div>
  );
}
