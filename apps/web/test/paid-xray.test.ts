import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Receipt } from "mppx";
import { describe, expect, it, vi } from "vitest";
import { FileDigestStore, PRICE_USDC, handlePaidXray, paymentsFor, readPaymentConfig, receiptDigest, type Payments } from "../lib/paid-xray";
import type { WalletXrayResponse } from "../lib/xray-service";

const ADDRESS = "0x684baa57c338c2549aec0aa3f034f695d72a8409";
const RECIPIENT = `0x${"ab".repeat(32)}`;
const SECRET = "a-test-secret-that-is-at-least-32-bytes-long";
const configured = { MPP_RECIPIENT: RECIPIENT, MPP_SECRET_KEY: SECRET };
const request = (headers: Record<string, string> = {}) => new Request(`https://calibre.test/api/v1/xray/${ADDRESS}`, { headers });

const okXray = (): WalletXrayResponse => ({ ok: true, cached: false, result: { address: ADDRESS, xray: { label: "no proven edge" } } as never });

describe("readPaymentConfig", () => {
  it("needs a recipient and a secret of at least 32 bytes, and says which is missing", () => {
    expect(readPaymentConfig({})).toMatchObject({ ok: false, message: expect.stringContaining("MPP_RECIPIENT") });
    expect(readPaymentConfig({ MPP_RECIPIENT: "not-an-address" })).toMatchObject({ ok: false, message: expect.stringContaining("not a Sui address") });
    expect(readPaymentConfig({ MPP_RECIPIENT: RECIPIENT })).toMatchObject({ ok: false, message: expect.stringContaining("MPP_SECRET_KEY") });
    expect(readPaymentConfig({ MPP_RECIPIENT: RECIPIENT, MPP_SECRET_KEY: "short" })).toMatchObject({ ok: false, message: expect.stringContaining("32 bytes") });
  });
  it("reads the optional settings and defaults to mainnet", () => {
    expect(readPaymentConfig(configured)).toEqual({ ok: true, config: { recipient: RECIPIENT, secretKey: SECRET, network: "mainnet" } });
    expect(readPaymentConfig({ ...configured, MPP_NETWORK: "Testnet", MPP_DIGEST_FILE: "/tmp/d.json", MPP_RPC_URL: "https://rpc.test" })).toEqual({
      ok: true, config: { recipient: RECIPIENT, secretKey: SECRET, network: "testnet", rpcUrl: "https://rpc.test", digestFile: "/tmp/d.json" },
    });
  });
});

describe("GET /api/v1/xray/[address] without payment settings", () => {
  it("answers 503 with a clear message and computes nothing", async () => {
    const runXray = vi.fn(async () => okXray());
    const res = await handlePaidXray(request(), ADDRESS, { env: {}, runXray });
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ ok: false, code: "payments_not_configured", error: expect.stringContaining("MPP_RECIPIENT") });
    expect(runXray).not.toHaveBeenCalled();
  });
  it("answers 503 for a half-configured deployment too", async () => {
    const res = await handlePaidXray(request(), ADDRESS, { env: { MPP_RECIPIENT: RECIPIENT } });
    expect(res.status).toBe(503);
  });
});

describe("GET /api/v1/xray/[address] with payment settings", () => {
  it("rejects a bad address before asking for any money", async () => {
    const charge = vi.fn();
    const res = await handlePaidXray(request(), "0x123", { env: configured, payments: { charge } as never });
    expect(res.status).toBe(400);
    expect(charge).not.toHaveBeenCalled();
  });

  it("answers a request with no credential with a real 402 Sui challenge for 0.01 USDC, and computes nothing", async () => {
    const runXray = vi.fn(async () => okXray());
    const res = await handlePaidXray(request(), ADDRESS, { env: configured, runXray });
    expect(res.status).toBe(402);
    const challenge = res.headers.get("WWW-Authenticate") ?? "";
    expect(challenge).toMatch(/^Payment /);
    expect(challenge).toContain('method="sui"');
    expect(challenge).toContain('intent="charge"');
    // The request is base64url JSON: amount, currency (Sui USDC) and our recipient.
    const encoded = /request="([^"]+)"/.exec(challenge)?.[1] ?? "";
    const terms = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { amount: string; currency: string; recipient: string };
    expect(terms).toMatchObject({ amount: PRICE_USDC, recipient: RECIPIENT });
    expect(terms.currency).toContain("::usdc::USDC");
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("WWW-Authenticate");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(runXray).not.toHaveBeenCalled();
  });

  it("reuses one mppx server (and its digest store) for the same settings", () => {
    const parsed = readPaymentConfig(configured);
    if (!parsed.ok) throw new Error("config");
    expect(paymentsFor(parsed.config)).toBe(paymentsFor(parsed.config));
  });

  const settled = (digest: string): Payments => ({
    charge: () => async () => ({
      status: 200 as const,
      withReceipt: (response: Response) => {
        const headers = new Headers(response.headers);
        headers.set("Payment-Receipt", Receipt.serialize({ method: "sui", reference: digest, status: "success", timestamp: "2026-11-04T10:00:00.000Z" }));
        return new Response(response.body, { status: response.status, headers });
      },
    }),
  });

  it("returns the X-ray with the payment digest as the receipt once the payment is accepted, never cached", async () => {
    const res = await handlePaidXray(request({ authorization: "Payment abc" }), ADDRESS, { env: configured, runXray: async () => okXray(), payments: settled("Hp4oHHsDIGEST") });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(receiptDigest(res)).toBe("Hp4oHHsDIGEST");
    expect(await res.json()).toMatchObject({
      ok: true, cached: false, result: { address: ADDRESS },
      receipt: { method: "sui", digest: "Hp4oHHsDIGEST", amount: "0.01", currency: "USDC", network: "mainnet", explorer: "https://suiscan.xyz/mainnet/tx/Hp4oHHsDIGEST" },
    });
  });

  it("does not settle a payment when the X-ray cannot be computed", async () => {
    const charge = vi.fn();
    const failed: WalletXrayResponse = { ok: false, status: 502, code: "upstream", error: "Could not read this wallet's history." };
    const res = await handlePaidXray(request({ authorization: "Payment abc" }), ADDRESS, { env: configured, runXray: async () => failed, payments: { charge } as never });
    expect(res.status).toBe(502);
    expect(charge).not.toHaveBeenCalled();
    expect(((await res.json()) as { error: string }).error).toContain("not settled");
  });
});

describe("FileDigestStore", () => {
  it("keeps spent digests across instances", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "calibre-digests-")), "nested", "spent.json");
    const first = new FileDigestStore(file);
    expect(await first.has("d1")).toBe(false);
    await first.set("d1");
    expect(await first.has("d1")).toBe(true);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(["d1"]);
    const second = new FileDigestStore(file);
    expect(await second.has("d1")).toBe(true);
    expect(await second.has("d2")).toBe(false);
  });
});
