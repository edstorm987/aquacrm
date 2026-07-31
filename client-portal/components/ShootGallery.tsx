"use client";

import { ChevronLeft, ChevronRight, Download, Expand, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ShootPhoto } from "@/lib/shoots";

export default function ShootGallery({ photos }: { photos: ShootPhoto[] }) {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const photo = photos[active];

  function move(delta: number) {
    setActive(index => (index + delta + photos.length) % photos.length);
  }

  useEffect(() => {
    if (!expanded) return;
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [expanded, photos.length]);

  return (
    <>
      <div className="gallery">
        <div className="gallery-thumbnails" aria-label="Gallery thumbnails">
          {photos.map((item, index) => (
            <button key={item.id} type="button" className={index === active ? "active" : ""} onClick={() => setActive(index)} aria-label={`View ${item.title}`}>
              <img src={item.src} alt="" />
              <span>{index + 1}</span>
            </button>
          ))}
        </div>
        <div className="gallery-stage">
          <img src={photo.src} alt={photo.title} />
          {photos.length > 1 ? (
            <>
              <button className="gallery-prev" type="button" onClick={() => move(-1)} aria-label="Previous photo"><ChevronLeft /></button>
              <button className="gallery-next" type="button" onClick={() => move(1)} aria-label="Next photo"><ChevronRight /></button>
            </>
          ) : null}
          <button className="gallery-expand" type="button" onClick={() => setExpanded(true)} aria-label="View full screen"><Expand size={18} /></button>
          <div className="gallery-caption">
            <div><strong>{photo.title}</strong><span>{photo.dimensions}</span></div>
            <a href={photo.src} download><Download size={16} /> Download</a>
            <span>{active + 1} of {photos.length}</span>
          </div>
        </div>
      </div>
      {expanded ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={photo.title}>
          <button className="lightbox-close" type="button" onClick={() => setExpanded(false)} aria-label="Close"><X /></button>
          <button type="button" onClick={() => move(-1)} aria-label="Previous photo"><ChevronLeft /></button>
          <img src={photo.src} alt={photo.title} />
          <button type="button" onClick={() => move(1)} aria-label="Next photo"><ChevronRight /></button>
          <div><strong>{photo.title}</strong><a href={photo.src} download><Download size={16} /> Download original</a></div>
        </div>
      ) : null}
    </>
  );
}
