import "server-only";
// Phase token resolver — builds the personalization map for phase
// welcome copy (and, in time, any other phase-authored content). Phase
// authors write `[firstName]`, `[client]`, `[website]` etc. once;
// this resolver pulls the values from contact + client data per render.
//
// Adding a new token: extend `resolvePhaseTokens` and document it in
// `KNOWN_PHASE_TOKENS` below — the editor surfaces that list so authors
// know what's available.

import type { Client, ServerUser } from "./types";

export const KNOWN_PHASE_TOKENS: ReadonlyArray<{ key: string; description: string }> = [
  { key: "name",         description: "Logged-in user's display name" },
  { key: "firstName",    description: "First word of the user's display name" },
  { key: "lastName",     description: "Last word of the user's display name" },
  { key: "email",        description: "Logged-in user's email" },
  { key: "client",       description: "Client / business name" },
  { key: "businessName", description: "Alias of [client]" },
  { key: "website",      description: "Client's website URL (or 'your site' fallback)" },
  { key: "stage",        description: "Current phase / stage label" },
  { key: "agency",       description: "Agency name (you / Milesy Media)" },
];

interface ResolveInput {
  user: Pick<ServerUser, "name" | "email"> | null | undefined;
  client: Pick<Client, "name" | "websiteUrl" | "stage"> | null | undefined;
  agencyName: string;
}

export function resolvePhaseTokens(input: ResolveInput): Record<string, string> {
  const userName = input.user?.name?.trim() ?? "";
  const parts = userName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.length > 1 ? parts[parts.length - 1]! : "";

  return {
    name:         userName,
    firstName,
    lastName,
    email:        input.user?.email ?? "",
    client:       input.client?.name ?? "",
    businessName: input.client?.name ?? "",
    website:      input.client?.websiteUrl ?? "your site",
    stage:        input.client?.stage ?? "",
    agency:       input.agencyName,
  };
}
