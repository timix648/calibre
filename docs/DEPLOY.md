# Deploying the site on Vercel

`apps/web` is a Next.js 16 app inside the pnpm monorepo. It needs **no environment variables and no secrets** (the optional paid agent API below aside): the verdicts, wallet index and
memory counts are static JSON files in `apps/web/data/` (committed), the live X-rays call Tatum (set `TATUM_API_KEY`, optionally `TATUM_DAILY_CREDITS`, default 150,000), and the live wallet audit at
`/api/wallet/[address]` reads Polymarket's free public API.

## One-time setup

1. Push the repository to GitHub (the deployment builds from Git).
2. In Vercel choose **Add New, Project**, import the repository.
3. Configure the project:

   | Setting | Value |
   |---|---|
   | Framework Preset | Next.js (picked up from `apps/web/vercel.json`) |
   | **Root Directory** | `apps/web` |
   | Include source files outside of the Root Directory in the Build Step | **Enabled** (the default). The app imports `packages/core` and `packages/public-data` from the workspace. |
   | Install Command | leave the default (Vercel detects `pnpm-lock.yaml` at the repository root and runs `pnpm install`) |
   | Build Command | `next build` (already in `apps/web/vercel.json`; `pnpm build` also works) |
   | Output Directory | leave the default (`.next`) |
   | Node.js Version | 22.x or 24.x |
   | Environment Variables | none for the site; `MPP_RECIPIENT` and `MPP_SECRET_KEY` only to turn on the paid API (docs/AGENT_PAYMENTS.md) |

4. Click **Deploy**. The pnpm version comes from `packageManager` in the root `package.json` (10.18.3).

Check locally first with the same command Vercel runs:

```sh
pnpm install
pnpm --filter @calibre/web build
```

## What runs where

- Static pages: `/`, `/moves`, `/move/[id]` (one per sealed verdict), `/proof`, `/method`.
- Serverless functions: `/api/xray/wallet/[address]`, `/api/xray/market/[ref]` and `/api/xray/handle/[handle]` (GET, CORS open so the browser extension can call them; `maxDuration` 60 s; Tatum first where it is used (the Sui checkpoint stamp, market fills, the wallet value line; see apps/web/lib/tatum.ts), Polymarket's free Gamma and Data APIs for everything else and as the labelled fallback; the market route returns partial results with `complete: false` after about 25 s). `/market/[ref]` is a thin page over the market route. `/api/v1/xray/[address]` is the paid agent API (0.01 USDC per call over MPP on Sui): it answers 503 until `MPP_RECIPIENT` and `MPP_SECRET_KEY` are set, never caches, and is described in docs/AGENT_PAYMENTS.md. The old `/api/wallet/[address]` (`maxDuration` 60 s, set in the route file). `/wallet/[address]` is a thin page that calls it from the browser.
- The route caches each audit in the function instance's memory for 10 minutes, de-duplicates concurrent audits of one wallet, and allows 8 uncached audits per minute per IP. This state is per instance, so on Vercel it is best effort; successful responses also carry `Cache-Control: public, s-maxage=600`, so Vercel's CDN absorbs repeat requests.

## The browser extension

Build it with `pnpm --filter @calibre/extension build` and load `apps/extension/dist` unpacked. In its options set the API base URL to the deployed site (default `http://localhost:3000`). See `apps/extension/README.md`.

## Updating the data

The site shows what was exported at build time. To publish new verdicts, grades or memory counts:

```sh
pnpm export:site        # needs .env (Walrus Memory and Tatum keys); rewrites apps/web/data/
git add apps/web/data
git commit -m "Refresh site data"
git push                # Vercel redeploys
```

`apps/web/data/` holds only public information: wallet addresses, market data and Walrus blob IDs. Never commit `.env`.

## After deploying

- Open `/moves` and a `/move/<id>` page, then `/wallet/0x684baa57c338c2549aec0aa3f034f695d72a8409`; the first audit takes a few seconds.
- Put the live URL in the submission form and the README.
