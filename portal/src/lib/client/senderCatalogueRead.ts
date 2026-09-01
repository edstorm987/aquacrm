import {
  checkedJsonMutation,
  mutationErrorMessage,
} from "@/lib/client/checkedMutation";

export interface OutboundSenderOption {
  id: string;
  label: string;
  address: string;
  provider: string;
}

export type SenderCatalogueRead =
  | { available: true; data: OutboundSenderOption[] }
  | { available: false; message: string };

type SenderFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function validSender(value: unknown): value is OutboundSenderOption {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const sender = value as Record<string, unknown>;
  return typeof sender.id === "string"
    && typeof sender.label === "string"
    && typeof sender.address === "string"
    && typeof sender.provider === "string";
}

/** A sender list is confirmed only when the endpoint and every row answer. */
export async function readSenderCatalogue(
  endpoint: string,
  options: { fetcher?: SenderFetcher } = {},
): Promise<SenderCatalogueRead> {
  const fallback = "Sending identities could not be loaded.";
  try {
    const payload = await checkedJsonMutation<{ ok: true; senders: OutboundSenderOption[] }>(
      endpoint,
      { method: "GET", cache: "no-store" },
      {
        fallback,
        fetcher: options.fetcher,
        validate: value => value?.ok === true
          && Array.isArray(value.senders)
          && value.senders.every(validSender),
      },
    );
    return { available: true, data: payload.senders };
  } catch (error) {
    return { available: false, message: mutationErrorMessage(error, fallback) };
  }
}
