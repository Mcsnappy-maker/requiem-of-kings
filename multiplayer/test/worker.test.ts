import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { allowedOrigins, corsHeaders, type Env as ServiceEnv } from "../src/env";

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

describe("MatchRoom scaffold", () => {
  it("returns a JSON 501 placeholder from the bound Durable Object", async () => {
    const room = env.MATCHES.get(env.MATCHES.idFromName("scaffold-test"));
    const response = await room.fetch("https://match.test/");
    expect(response.status).toBe(501);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "not-implemented" });
  });
});
