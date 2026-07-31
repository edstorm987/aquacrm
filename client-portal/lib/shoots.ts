export interface ShootPhoto {
  id: string;
  src: string;
  title: string;
  dimensions: string;
}

export interface Shoot {
  id: string;
  title: string;
  type: string;
  date: string;
  location: string;
  status: "Ready" | "Editing" | "Archived";
  cover: string;
  summary: string;
  photos: ShootPhoto[];
}

export const shoots: Shoot[] = [
  {
    id: "portside-riders",
    title: "Portside Riders",
    type: "Automotive",
    date: "18 July 2026",
    location: "Felixstowe",
    status: "Ready",
    cover: "/shoots/portside-riders/rider-front.jpg",
    summary: "A quiet industrial portrait series built around movement, machines and late-day light.",
    photos: [
      { id: "rider-front", src: "/shoots/portside-riders/rider-front.jpg", title: "Arrival", dimensions: "3456 x 5184" },
      { id: "rider-white", src: "/shoots/portside-riders/rider-white.jpg", title: "White fairing", dimensions: "3456 x 5184" },
      { id: "rider-rear", src: "/shoots/portside-riders/rider-rear.jpg", title: "Ready to ride", dimensions: "3456 x 5184" },
    ],
  },
  {
    id: "pool-hall-stories",
    title: "Pool Hall Stories",
    type: "Editorial",
    date: "9 June 2026",
    location: "Suffolk",
    status: "Ready",
    cover: "/shoots/pool-hall-stories/pool-setup.jpg",
    summary: "Low light, patient frames and the small rituals that happen before the first break.",
    photos: [
      { id: "pool-setup", src: "/shoots/pool-hall-stories/pool-setup.jpg", title: "The setup", dimensions: "3456 x 5184" },
      { id: "pool-shot", src: "/shoots/pool-hall-stories/pool-shot.jpg", title: "On the line", dimensions: "3456 x 5184" },
      { id: "pool-detail", src: "/shoots/pool-hall-stories/pool-detail.jpg", title: "After the shot", dimensions: "3456 x 5184" },
    ],
  },
  {
    id: "night-stories",
    title: "Night Stories",
    type: "Creative",
    date: "28 May 2026",
    location: "Ipswich",
    status: "Editing",
    cover: "/shoots/night-stories/night-story.png",
    summary: "An experimental frame exploring distance, friendship and the colour of a late night.",
    photos: [
      { id: "night-story", src: "/shoots/night-stories/night-story.png", title: "Through the glass", dimensions: "2048 x 1536" },
    ],
  },
];

export function getShoot(id: string) {
  return shoots.find(shoot => shoot.id === id);
}

interface ShootRow {
  id: string;
  title: string;
  shoot_type: string;
  shoot_date_label: string;
  location: string;
  status: Shoot["status"];
  cover: string;
  summary: string;
  shoot_photos?: {
    id: string;
    src: string;
    title: string;
    dimensions: string | null;
  }[];
}

function mapShoot(row: ShootRow): Shoot {
  return {
    id: row.id,
    title: row.title,
    type: row.shoot_type,
    date: row.shoot_date_label,
    location: row.location,
    status: row.status,
    cover: row.cover,
    summary: row.summary,
    photos: (row.shoot_photos || []).map(photo => ({
      id: photo.id,
      src: photo.src,
      title: photo.title,
      dimensions: photo.dimensions || "",
    })),
  };
}

export async function getShoots() {
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shoots")
      .select("id,title,shoot_type,shoot_date_label,location,status,cover,summary,shoot_photos(id,src,title,dimensions)")
      .order("sort_order", { ascending: true })
      .order("sort_order", { referencedTable: "shoot_photos", ascending: true });

    if (error || !data) return shoots;
    return (data as ShootRow[]).map(mapShoot);
  } catch {
    return shoots;
  }
}

export async function getShootById(id: string) {
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("shoots")
      .select("id,title,shoot_type,shoot_date_label,location,status,cover,summary,shoot_photos(id,src,title,dimensions)")
      .eq("id", id)
      .order("sort_order", { referencedTable: "shoot_photos", ascending: true })
      .single();

    if (error || !data) return getShoot(id);
    return mapShoot(data as ShootRow);
  } catch {
    return getShoot(id);
  }
}
