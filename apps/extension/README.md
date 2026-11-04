# CALIBRE Whale X-ray extension (Chrome, Manifest V3)

A small panel on polymarket.com that shows the X-ray from a CALIBRE site:

- **Profile pages** (`/profile/0x…`, or `/@username`, which is looked up through Polymarket's public profile search): the wallet's label
  (proven losing record, mostly sniping, too early, proven winning record, no proven edge), with what the label test found for it, edge with its error band, and sniping share.
- **Event and market pages** (`/event/<slug>[/<market-slug>]`, `/market/<slug>`): the latest move of 4 points or more in the last
  6 hours, the share of the pushing money that came from wallets with a proven losing record (with its coverage), and the biggest takers.

It follows Polymarket's single-page navigation, so the panel updates when you click from page to page. The panel lives in a closed shadow
root at the bottom right; collapse it with the dash, close it with the cross.

Square money is a caution signal and early evidence, not a trade recommendation: in a replay of 11,975 moves, loser-driven moves did 3.1 pts worse for followers (p = 0.07); not conclusive.

## Install (no build needed)

Download `calibre-extension.zip` from https://calibre-blush.vercel.app/extension, unzip it, and load the folder with **Load unpacked**
(steps below). To refresh that zip after a change: build, then zip the contents of `dist` into `apps/web/public/calibre-extension.zip`.

## Build

```sh
pnpm install
pnpm --filter @calibre/extension build     # writes apps/extension/dist
```

The build bundles `src/` with esbuild, copies `static/` (manifest and options page), generates the icons and checks that every file the
manifest names exists.

## Load unpacked

1. Start the site the panel talks to: `pnpm --filter @calibre/web dev` (it listens on `http://localhost:3000`), or use a deployed one.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the `apps/extension/dist` folder.
4. Open any Polymarket profile or event page. The panel appears at the bottom right.

After changing the code, run the build again and press the reload icon on the extension's card.

## Point it at the deployed site

The panel's data comes from the site's `/api/xray/*` routes, which answer GET with open CORS. The default is the live site, `https://calibre-blush.vercel.app`; set `http://localhost:3000` in the options for local development.
To use the deployed site, open the extension's **options** (click the toolbar icon, or Details, then Extension options), enter its address
(for example `https://your-site.vercel.app`), press **Save**, and **Test** to confirm it answers. The address is stored in `chrome.storage.sync`.

## What it calls

| Page | Request (through the background service worker) |
|---|---|
| `/profile/0x…` | `GET <base>/api/xray/wallet/<address>` |
| `/@username` | `GET <base>/api/xray/handle/<username>`, then the wallet call |
| `/event/<slug>[/<market>]` | `GET <base>/api/xray/market/<slug>[?market=<market-slug>]` |

The extension asks for the `storage` permission only and runs on `polymarket.com`. It sends no Polymarket cookies or page content to the API,
only the address, username or slug in the URL.

## Tests

`pnpm test` at the repository root runs the URL detection and panel model tests (`apps/extension/test`).
