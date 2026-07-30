export type ClientEntityType = "company" | "person";

export interface ClientContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  notes?: string;
  primary: boolean;
  createdAt: number;
  updatedAt: number;
}

export function cleanClientContacts(value: unknown): ClientContact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const id = clean(raw.id, 120);
    const name = clean(raw.name, 120);
    if (!id || !name) return [];
    const createdAt = number(raw.createdAt) ?? Date.now();
    return [{
      id,
      name,
      email: clean(raw.email, 240) || undefined,
      phone: clean(raw.phone, 80) || undefined,
      role: clean(raw.role, 100) || undefined,
      notes: clean(raw.notes, 1_000) || undefined,
      primary: raw.primary === true,
      createdAt,
      updatedAt: number(raw.updatedAt) ?? createdAt,
    }];
  }).slice(0, 100);
}

function clean(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
