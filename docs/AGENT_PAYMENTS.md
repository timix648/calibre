# Paid X-ray API for trading agents (MPP on Sui)

`GET /api/v1/xray/<wallet>` returns the same wallet X-ray as the free `/api/xray/wallet/<wallet>` route, plus a `receipt`, and charges
**0.01 USDC per call** over the [Machine Payments Protocol](https://mpp.dev) on Sui mainnet. There is no account, no API key and no
subscription: an agent that gets a `402 Payment Required` pays on-chain and retries. This is the Best Use of Agent Payments entry.

Status: the code is written and tested, but **no real payment has ever been made with it**. The server half is unit-tested up to the
402 challenge (a real `mppx` server with the real Sui method) and with a stand-in for the on-chain check; the buyer half
(`scripts/agent-pay-demo.ts`) has not been run. The first real run is yours, and is described below.

## How a call works

```
agent                               calibre (/api/v1/xray/0x...)
  | GET (no payment)                  |
  |---------------------------------->|  no credential: nothing is computed
  |<--------------- 402 + WWW-Authenticate: Payment ... method="sui" amount=0.01 USDC, recipient
  | send 0.01 USDC on Sui (~0.4 s)    |
  | sign a proof over the digest      |
  | GET + Authorization: Payment ...  |
  |---------------------------------->|  computes the X-ray, THEN verifies the transaction through Sui gRPC
  |<--------------- 200 { ok, cached, result, receipt: { digest, explorer } } + Payment-Receipt header
```

- A bad wallet address answers `400` before any money is requested. If the X-ray itself fails (Polymarket unreachable, rate limit),
  the answer is the error and **no payment is settled**: send the same request again with the same credential.
- A transaction digest pays for one call only. The server remembers spent digests (see "Replay protection").
- The reply carries `Cache-Control: no-store`, so a CDN never serves a paid answer to someone who did not pay.
- Until `MPP_RECIPIENT` and `MPP_SECRET_KEY` are set on the server the route answers `503` with
  `{"ok":false,"code":"payments_not_configured","error":"..."}` and nothing else happens. The free routes are unaffected.

## What you must set up for real payments

### 1. The server (receives the money)

| Variable | Required | Meaning |
|---|---|---|
| `MPP_RECIPIENT` | yes | A Sui address you control. The USDC lands here. Your own wallet works; it needs no funding. |
| `MPP_SECRET_KEY` | yes | At least 32 bytes that bind payment challenges to their contents. Generate: `openssl rand -base64 32`. Keep it secret. |
| `MPP_DIGEST_FILE` | no | A file path that keeps spent digests across restarts (a machine with a disk). |
| `MPP_NETWORK` | no | `mainnet` (default) or `testnet`. |
| `MPP_RPC_URL` | no | Sui gRPC endpoint used to verify payments. Default: the public mainnet fullnode. |

They are read on every request, so they can be added to a running deployment. On Vercel: Project, Settings, Environment Variables, then
redeploy. Locally put them in `apps/web/.env.local` (git-ignored) and run:

```sh
pnpm --filter @calibre/web build
pnpm --filter @calibre/web start          # http://localhost:3000
```

Without credentials you can already see the 402 challenge:

```sh
curl -i http://localhost:3000/api/v1/xray/0x684baa57c338c2549aec0aa3f034f695d72a8409
# HTTP/1.1 402 ... WWW-Authenticate: Payment id="...", method="sui", intent="charge", request="<base64url JSON: amount 0.01, Sui USDC, your recipient>"
```

**Replay protection.** The default digest store is in memory: it forgets when the server instance recycles and is not shared between
instances, so on Vercel a spent digest could in principle be presented again to another instance. That is acceptable for a demo at
0.01 USDC a call, and not for real revenue. For anything more, set `MPP_DIGEST_FILE` on a machine with a disk, or implement the two-method
`DigestStore` interface (`has(digest)`, `set(digest)`) over Redis, a KV or a database and pass it to `paymentsFor` in
`apps/web/lib/paid-xray.ts`.

**Verification goes through the public Sui fullnode**, not through Tatum. `@suimpp/mpp` builds a `SuiGrpcClient` for `MPP_RPC_URL`, and in our spike
Tatum's Sui gateway only answered native gRPC (docs/SPIKES.md), so pointing `MPP_RPC_URL` at it is untested and probably will not work. Tatum stays the source for the sealed verdicts.

### 2. The buyer (pays the money): fund this

The demo agent signs with the key in `AGENT_SUI_KEY`. Use a **fresh key made for this**, not your main wallet.

1. Create the key and note its address, for example with the Sui CLI: `sui client new-address ed25519`, then
   `sui keytool export --key-identity <address>` prints the `suiprivkey1...` string.
2. Put `AGENT_SUI_KEY=suiprivkey1...` in the repository's `.env` (git-ignored). The script prints the buyer address when it starts.
   Keep that `.env` on the laptop. If it ever sits on a server, leave it out of backups (`--exclude=.env --exclude='.env.*'`) and shred it
   with the backup archives at teardown (`docs/VPS_OPS.md`).
3. Send that address on **Sui mainnet**:
   - **0.10 USDC** (Circle USDC, coin type `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`).
     One run spends at most 0.05 USDC (5 calls at 0.01), so 0.10 covers two full runs. Do not send other stablecoins; the agent will refuse them.
   - **0.1 SUI** for gas. A payment is one small transaction; this is far more than enough.

Spending is capped by construction: the agent pays only after the server's challenge passes a guard (`scripts/agent-pay-cap.ts`): the price
must be at most `--max-price` (default 0.01 USDC), the coin must be Sui USDC, and at most `--max-calls` payments are made in a run
(default 5, never more than 25). The library is also told never to retry a payment.

### 3. Run it

```sh
# 1. The server is running with MPP_RECIPIENT and MPP_SECRET_KEY set (see above), or use the deployed URL.
# 2. The buyer agent: up to 3 calls on the wallets you name (the default is the sample wallet).
pnpm tsx scripts/agent-pay-demo.ts --base http://localhost:3000 --max-calls 3 \
  0x684baa57c338c2549aec0aa3f034f695d72a8409 0x<another wallet> 0x<a third>
```

For each call it prints the X-ray label, the payment **receipt digest** and a Suiscan link
(`https://suiscan.xyz/mainnet/tx/<digest>`), then a summary of the calls made and USDC spent. Open one link to show a judge the payment
settling on mainnet; the recipient address then shows the USDC arriving.

### 4. The first real call (4 Nov 2026)

Run against the deployed site with `MPP_RECIPIENT` and `MPP_SECRET_KEY` set in Vercel:

| | |
|---|---|
| Transaction | [`9edpkVC9QQegXDDwvxEt5dZyd2NZ36vBLw2yaqknF86K`](https://suiscan.xyz/mainnet/tx/9edpkVC9QQegXDDwvxEt5dZyd2NZ36vBLw2yaqknF86K) |
| Checkpoint | 341674249, 2026-11-04 20:21:41 UTC |
| Status | SUCCESS |
| Transfer | 10,000 units of native USDC (0.01) from the agent `0x62c1296aa94dd95c94734f916ff9b69934926ac5ca3706122d4519c7dfbf3cdf` to the recipient `0x6b2e6674d9f19c45ababd054fac1dfa3e3cbe8e7f4d58084bda4c4a1460ef5cf` |
| Gas | gas price 0, computation and storage cost 0: the agent held no SUI |

Checked on chain through Sui's public GraphQL (`transaction(digest: …) { effects { status balanceChanges gasEffects } }`).

## Files

- `apps/web/app/api/v1/xray/[address]/route.ts`: the route.
- `apps/web/lib/paid-xray.ts`: settings, digest stores, the payment handler (`handlePaidXray`).
- `scripts/agent-pay-demo.ts`, `scripts/agent-pay-cap.ts`: the buyer agent and its spending guard.
- Tests: `apps/web/test/paid-xray.test.ts` (503 when unconfigured, the real 402 challenge, receipts, no settlement on failure, the digest file)
  and `scripts/agent-pay-cap.test.ts` (the cap logic).

## Versions

`mppx@0.17.0` with `@suimpp/mpp@0.9.0`. `@suimpp/mpp` declares `mppx ^0.4.9` and installs its own copy of it, so the Sui method is built
against mppx 0.4 while the server and client wrappers come from 0.17. The challenge path is covered by the tests; the on-chain verification
path (credential, transaction lookup, signature check) will only be exercised by the first real payment, so make that first payment
yourself before showing it to anyone.
