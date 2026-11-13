import { PROTOCOL_VERSION, isCreateMatchResponse, type CreateMatchRequest, type CreateMatchResponse, type SeatPreference } from "./protocol";

export type { CreateMatchResponse } from "./protocol";
export interface CreateMatchInput {
  name: string;
  color: SeatPreference;
}

export type CreateMatchErrorCode = "bad-message" | "bad-version" | "origin-not-allowed" | "https-required" | "not-found" | "server-error";
const CREATE_ERRORS: readonly CreateMatchErrorCode[] = ["bad-message", "bad-version", "origin-not-allowed", "https-required", "not-found", "server-error"];

export class MatchApiError extends Error {
  constructor(message: string, public readonly code?: CreateMatchErrorCode) {
    super(message);
    this.name = "MatchApiError";
  }
}

function createEndpoint(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_HTTP_URL as string | undefined;
  if (!configured) throw new MatchApiError("Multiplayer service is not configured");
  try {
    const base = new URL(configured);
    const local = base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname);
    if (base.protocol !== "https:" && !local || base.username || base.password || base.search || base.hash
      || base.pathname !== "/" || (configured !== base.origin && configured !== `${base.origin}/`)) throw new Error();
    return `${base.origin}/api/matches`;
  } catch {
    throw new MatchApiError("Invalid multiplayer service URL");
  }
}

function errorCode(value: unknown): CreateMatchErrorCode | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && CREATE_ERRORS.includes(body.error as CreateMatchErrorCode)
    ? body.error as CreateMatchErrorCode : undefined;
}

export async function createRemoteMatch(input: CreateMatchInput): Promise<CreateMatchResponse> {
  if (!input || typeof input.name !== "string" || !["w", "b", "random"].includes(input.color)) {
    throw new MatchApiError("Invalid match request");
  }
  const endpoint = createEndpoint();
  const body: CreateMatchRequest = { v: PROTOCOL_VERSION, name: input.name, color: input.color };
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store",
    });
  } catch {
    throw new MatchApiError("Could not create match");
  }
  let value: unknown;
  try { value = await response.json(); } catch {
    throw new MatchApiError(response.ok ? "Invalid match service response" : "Could not create match");
  }
  if (!response.ok) throw new MatchApiError("Could not create match", errorCode(value));
  if (response.status !== 201 || !isCreateMatchResponse(value)) throw new MatchApiError("Invalid match service response");
  return value;
}
