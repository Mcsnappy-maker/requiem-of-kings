import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { allowedOrigins, corsHeaders, type Env as ServiceEnv } from "../src/env";
import worker from "../src/index";

declare global {
  namespace Cloudflare {
    interface Env extends ServiceEnv {}
    interface GlobalProps {
      mainModule: typeof import("../src/index");
      durableNamespaces: "MatchRoom";
    }
  }
}

describe("Worker routes", () => {
  it("reports protocol 2 health", async () => {
    const response = await exports.default.fetch("https://worker.test/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true, protocol: 2, service: "requiem-multiplayer" });
  });

  it.each(["http://localhost:8080", "http://127.0.0.1:8080"])("reflects configured origin %s", async (origin) => {
    const response = await exports.default.fetch("https://worker.test/health", { headers: { Origin: origin } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it.each(["/api/matches", "/api/matches/example", "/api/unknown"])("rejects unknown origins on %s", async (path) => {
    for (const method of ["GET", "POST", "OPTIONS"]) {
      const response = await exports.default.fetch(`https://worker.test${path}`, { method, headers: { Origin: "https://unknown.test" } });
      expect(response.status).toBe(403);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(await response.json()).toEqual({ error: "origin-not-allowed" });
    }
  });

  it("rejects API requests without an origin", async () => {
    const response = await exports.default.fetch("https://worker.test/api/matches");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin-not-allowed" });
  });

  it("returns a safe JSON 404 for unknown routes", async () => {
    const response = await exports.default.fetch("https://worker.test/unknown?secret=must-not-echo");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "not-found" });
  });

  it("keeps allowlisted API routes unimplemented with CORS", async () => {
    const response = await exports.default.fetch("https://worker.test/api/unknown", { headers: { Origin: "http://localhost:8080" } });
    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8080");
    expect(await response.json()).toEqual({ error: "not-found" });
  });

  it("does not treat non-GET health requests as health checks", async () => {
    const response = await exports.default.fetch("https://worker.test/health", { method: "POST" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not-found" });
  });
});

describe("origin configuration", () => {
  it("parses a trimmed comma-separated allowlist and ignores empty entries", () => {
    expect([...allowedOrigins({ ...env, ALLOWED_ORIGINS: " https://game.test, ,http://localhost:8080,https://game.test," })]).toEqual(["https://game.test", "http://localhost:8080"]);
  });

  it("permits no origins when configuration is empty", () => {
    const configured = { ...env, ALLOWED_ORIGINS: "" };
    expect(allowedOrigins(configured).size).toBe(0);
    const headers = corsHeaders(new Request("https://worker.test/", { headers: { Origin: "http://localhost:8080" } }), configured);
    expect(headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(headers.get("Vary")).toBe("Origin");
  });

  it.each(["http://localhost:5173", "http://localhost:8080.evil.test", "null"])("does not grant CORS to %s", (origin) => {
    const headers = corsHeaders(new Request("https://worker.test/", { headers: { Origin: origin } }), env);
    expect(headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(headers.get("Vary")).toBe("Origin");
  });
});

describe("MatchRoom routing", () => {
  it("does not expose internal routes through the Worker", async () => {
    const response = await exports.default.fetch("https://worker.test/internal/create", { method: "POST" });
    expect(response.status).toBe(404);
  });

  it("returns a safe JSON 404 from an unknown Durable Object route", async () => {
    const room = env.MATCHES.get(env.MATCHES.idFromName("scaffold-test"));
    const response = await room.fetch("https://match.test/");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "not-found" });
  });
});

describe("match creation", () => {
  const origin = "http://localhost:8080";
  const create = (body: unknown, url = "https://worker.test/api/matches") => exports.default.fetch(url, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

  it("rejects edge clients after the match-creation limiter is exhausted", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const response = await worker.fetch(new Request("https://worker.test/api/matches", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.10" },
      body: JSON.stringify({ v: 2, name: "Host", color: "w" }),
    }), { ...env, MATCH_CREATE_LIMITER: { limit } }, {} as ExecutionContext);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate-limited" });
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.10" });
  });

  it.each([undefined, 1, "2"])("requires numeric protocol 2 (received %s)", async (v) => {
    const response = await create({ v, name: "Host", color: "w" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad-version" });
  });

  it.each([
    null, [], { v: 2, color: "w" }, { v: 2, name: "Host" }, { v: 2, name: 3, color: "w" },
    { v: 2, name: "Host", color: "red" }, { v: 2, name: "Host", color: "w", clock: 300 },
  ])("rejects malformed creation input %j", async (body) => {
    const response = await create(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad-message" });
  });

  it("rejects malformed JSON", async () => {
    const response = await exports.default.fetch("https://worker.test/api/matches", {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad-message" });
  });

  it("requires HTTPS for credentials", async () => {
    const response = await create({ v: 2, name: "Host", color: "w" }, "http://worker.test/api/matches");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "https-required" });
  });

  it.each(["http://localhost:8787", "http://127.0.0.1:8787"])("allows local HTTP development at %s with configured local origins", async (base) => {
    for (const localOrigin of ["http://localhost:8080", "http://127.0.0.1:8080"]) {
      const response = await exports.default.fetch(`${base}/api/matches`, {
        method: "POST", headers: { Origin: localOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ v: 2, name: "Host", color: "w" }),
      });
      expect(response.status).toBe(201);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(localOrigin);
    }
  });

  it("requires HTTPS for loopback requests from a configured nonlocal origin", async () => {
    const response = await worker.fetch(new Request("http://localhost:8787/api/matches", {
      method: "POST", headers: { Origin: "https://game.test", "Content-Type": "application/json" },
      body: JSON.stringify({ v: 2, name: "Host", color: "w" }),
    }), { ...env, ALLOWED_ORIGINS: "https://game.test" }, {} as ExecutionContext);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "https-required" });
  });

  it.each(["w", "b", "random"])("creates waiting matches for colour %s", async (color) => {
    const response = await create({ v: 2, name: "Host", color });
    expect(response.status).toBe(201);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json() as { matchId: string; hostToken: string; joinToken: string; state: { status: string; players: { name: string; color: string }[] } };
    expect(body.matchId).toMatch(/^[a-f0-9-]{36}$/);
    expect(body.hostToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.joinToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set([body.matchId, body.hostToken, body.joinToken]).size).toBe(3);
    expect(body.state.status).toBe("waiting");
    expect(body.state.players[0].name).toBe("Host");
    expect(color === "random" ? ["w", "b"] : [color]).toContain(body.state.players[0].color);
  });

  it("answers allowed preflight without allocating a match", async () => {
    const response = await exports.default.fetch("https://worker.test/api/matches", { method: "OPTIONS", headers: { Origin: origin } });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, GET, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
  });

  it("rejects credentials in WebSocket URLs", async () => {
    const response = await exports.default.fetch("https://worker.test/api/matches/00000000-0000-4000-8000-000000000000/ws?token=must-not-echo", {
      headers: { Origin: origin, Upgrade: "websocket" },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad-message" });
  });
});
