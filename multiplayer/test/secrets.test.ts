import { describe, expect, it } from "vitest";
import { createSecret, hashSecret } from "../src/secrets";

describe("secrets", () => {
  it("creates distinct, unpadded URL-safe secrets with 32 random bytes", () => {
    const first = createSecret();
    const second = createSecret();
    expect(/^[A-Za-z0-9_-]+$/.test(first)).toBe(true);
    expect(first.length).toBe(43);
    expect(atob(first.replace(/-/g, "+").replace(/_/g, "/")).length).toBe(32);
    expect(first === second).toBe(false);
  });

  it("supports an explicit size with at least 128 bits", () => {
    expect(atob(createSecret(16).replace(/-/g, "+").replace(/_/g, "/")).length).toBe(16);
    expect(atob(createSecret(48).replace(/-/g, "+").replace(/_/g, "/")).length).toBe(48);
  });

  it.each([0, 15, -1, 16.5, NaN, Infinity, 65_537])("rejects an invalid secret size (%s)", (size) => {
    expect(() => createSecret(size)).toThrow(RangeError);
  });

  it("returns the stable lowercase SHA-256 digest", async () => {
    expect(await hashSecret("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const secret = createSecret();
    const digest = await hashSecret(secret);
    expect(/^[a-f0-9]{64}$/.test(digest)).toBe(true);
    expect(await hashSecret(secret) === digest).toBe(true);
    expect(digest.includes(secret)).toBe(false);
  });
});
