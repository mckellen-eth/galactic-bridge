# Galactic Bridge

**Language:** English · [Українська](README_UKR.md)

A universal cross-chain bridge interface for **LayerZero V2 OFT** tokens.

Move any OFT token between EVM networks — including tokens that were never added
to Stargate or any other bridge UI. Enter a token contract address and the bridge
figures out the rest: the OFT contract, the route, the fee, and the transaction.

Live at **https://galacticbridge.app** — or run it locally with the steps below.

---

## Why it exists

Most bridge interfaces only support tokens their team has added manually. If a
project never gets listed, moving its token between networks means doing it by
hand: finding the OFT contract on a block explorer, decoding a previous bridge
transaction, and assembling the call yourself. Slow and easy to get wrong.

Galactic Bridge automates that process.

## Features

- **Works with any OFT token** — no allowlist, no manual configuration.
- **Finds the bridge contract automatically**, including the separate *adapter*
  used by tokens that are not OFTs themselves.
- **Routes without history** — asks the contract directly which networks it is
  connected to, so a route works even if nobody has used it before.
- **Builds the transaction itself** — it does not merely replay a previous
  transfer. When the contract follows the LayerZero V2 OFT standard, the call is
  assembled from scratch and the fee comes from a live `quoteSend()`. This
  matters because popular tokens are usually bridged through routers and
  aggregators, so a past transaction contains the router's call data, not the
  token's.
- **Non-custodial** — the interface never holds funds or keys. You sign every
  transaction in your own wallet. No account, no personal data.
- **Saved tokens** — store frequently used tokens and reuse them by ticker.
  Stored in your browser only, never on a server.
- **13 networks:** Ethereum, BNB Chain, Base, Arbitrum, Optimism, Polygon,
  Avalanche, Mantle, HyperEVM, Ink, X Layer, Plasma, Robinhood.

---

## Quick start (Windows)

1. Install [Node.js LTS](https://nodejs.org/).
2. Download or clone this repository.
3. Double-click **`start.bat`**.

On first run it creates a `.env` file and installs dependencies. Open
`http://localhost:5173` when the frontend window is ready.

## Quick start (macOS / Linux)

```bash
git clone https://github.com/<your-username>/galactic-bridge.git
cd galactic-bridge
cp .env.example .env          # then edit .env, see Configuration below

cd backend  && npm install && cd ..
cd frontend && npm install && cd ..

grep '^VITE_' .env > frontend/.env

# terminal 1
cd backend && node server.js

# terminal 2
cd frontend && npm run dev
```

Open `http://localhost:5173`.

---

## Configuration

Copy `.env.example` to `.env` and fill it in.

| Variable | Required | What it does |
|---|---|---|
| `VITE_REOWN_PROJECT_ID` | **Yes** | Wallet connection. Get your **own** free ID at [dashboard.reown.com](https://dashboard.reown.com) — it is tied to an account and has its own quota, so do not reuse someone else's. Without it the wallet window is empty. |
| `VITE_CF_BEACON_TOKEN` | No | Cloudflare Web Analytics token, only if you host your own site. Leave empty and no analytics script is loaded at all. |
| `PORT` | No | Backend port. Default `3001`. |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS allowlist. Empty = open (development). Set it in production. |
| `RL_MAX`, `RL_WINDOW_MS` | No | Rate limit per IP. Default 60 requests / 15 s. |
| `LOGS_RPC_<CHAIN>` | No | Archive RPC for a specific network, e.g. `LOGS_RPC_BSC`. See below. |

> `frontend/.env` is generated from the `VITE_` lines of the root `.env`.
> `start.bat` does this automatically; on macOS/Linux run the `grep` command above.

### About `LOGS_RPC_<CHAIN>`

Finding the bridge adapter for a token that is not an OFT itself requires reading
historical event logs. Some public RPC nodes refuse `eth_getLogs` or only serve
the most recent blocks. If that happens, point the bridge at a node with archive
access:

```
LOGS_RPC_BSC=https://bsc-mainnet.nodereal.io/v1/YOUR_KEY
```

Free tiers from [NodeReal](https://nodereal.io), [Ankr](https://www.ankr.com/rpc/),
[dRPC](https://drpc.org) or [Alchemy](https://alchemy.com) are more than enough.
Chain keys: `eth`, `bsc`, `base`, `arb`, `poly`, `op`, `avax`, `mantle`,
`hyperevm`, `ink`, `xlayer`, `plasma`, `robinhood`.

Check every network at once:

```bash
cd backend && node tools/checkLogsRpc.js
```

---

## How it works

**1. Resolve the OFT contract.**
The bridge first asks the LayerZero API whether the token address is itself an
OFT. If it is not, the token uses a separate *adapter* contract. To find it, the
bridge fetches the token's `Transfer` logs and LayerZero's `OFTSent`/`OFTReceived`
events for the same block range, then intersects them by transaction hash. A
match identifies the adapter directly — no transaction-by-transaction probing.
The candidate is verified by calling `token()` on it, so an aggregator swapping
several tokens in one transaction cannot produce a false match.

**2. Resolve the route.** In order:

1. **Forward** — look for a delivered LayerZero message in this exact direction.
2. **Reverse** — if the destination contract is known, search from that side.
3. **`peers()`** — ask the source contract which address it is paired with on the
   destination network. This is a standard LayerZero V2 function, so a route can
   be confirmed even with zero transaction history. Knowing the destination
   contract, the reverse search runs again and returns real transactions.
4. If nothing works, the user can enter the contract or a sample transaction hash
   manually.

**3. Build the transaction.**
The call format is decoded from a real transaction of the same contract — many
OFTs use custom function selectors, so the format is learned rather than assumed.
The fee comes from a live `quoteSend()` call for the actual destination.

**4. Discover networks.**
When saving a token, the bridge walks every connected contract via `peers()` and
supplements the result with LayerZero history. Networks are not always connected
in a star topology, so each node is queried, not only the starting one.

---

## What is and isn't supported

LayerZero Scan lists **every** application built on LayerZero, and most of them
are not token transfers. Knowing the difference saves a lot of guessing.

| Type | Supported | Why |
|---|---|---|
| **LayerZero V2 OFT** | ✅ | The standard this bridge is built for. |
| V2 OFT bridged through routers | ✅ | The call is built from the standard interface instead of copied. |
| V2 OFT with a separate adapter | ✅ * | The adapter is found automatically — if the network's RPC serves historical logs. |
| **LayerZero V1** | ❌ | A different protocol: other endpoint, other function, other network IDs. Detected and reported clearly. |
| Custom V2 OApps | ❌ | Have `peers()` but no `token()` / `quoteSend()` — each one has its own bespoke interface. |
| Stargate pools (USDC etc.) | ❌ | Own pool architecture, not the OFT standard. Use Stargate's own interface. |

**Check any token in five seconds** — is it an OFT at all?

```
https://scan.layerzero-api.com/v1/messages/oapp/<EID>/<TOKEN_ADDRESS>?limit=1
```

A list of messages means yes. `{"code":4040}` means the address is not an OApp on
that chain, so it needs an adapter — or isn't an OFT at all.

EIDs: Ethereum `30101`, BNB Chain `30102`, Avalanche `30106`, Polygon `30109`,
Arbitrum `30110`, Optimism `30111`, Mantle `30181`, Base `30184`,
X Layer `30274`, Ink `30339`, HyperEVM `30367`, Plasma `30383`,
Robinhood `30416`.

> Use the EID of the chain the address belongs to. The same token can be a plain
> OFT on one chain and use an adapter on another.

### Why a public RPC is sometimes not enough

Finding an adapter requires reading historical event logs, and free public nodes
vary wildly:

- some refuse `eth_getLogs` entirely (`limit exceeded`);
- some serve only the newest few thousand blocks (`archive request required`);
- some cap the range at 100–500 blocks, which is useless for scanning;
- some prune the transaction index and return `null` for older hashes.

The bridge rotates between nodes and never treats an RPC error as "no data".
When no free node works for a chain, point it at one with archive access via
`LOGS_RPC_<CHAIN>` — a free tier from NodeReal, Ankr, dRPC or Alchemy is enough.
Run `node backend/tools/checkLogsRpc.js` to see the state of every network.

## Project structure

```
backend/
  server.js              Express app, CORS allowlist, rate limiting
  lib/
    chains.js            Network definitions (RPC, EID, explorer)
    oftSearch.js         Core: OFT resolution, route search, peers()
    decoder.js           Decodes call layout from a real transaction
    rpc.js               JSON-RPC helper with retries
    explorer.js          LayerZero API endpoints
  routes/                find-params, scan-token, balance, quote, tx-status
  tools/
    checkLogsRpc.js      Diagnostics: can each network serve deep logs?
    findRpc.js           Finds a working RPC from a candidate list
frontend/
  src/
    App.jsx              Main UI and bridge logic
    main.jsx             wagmi + Reown AppKit setup
    lib/                 chains, encoder, formatting
    components/          token modal, rare-route modal, footer
```

## API endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/find-params` | Resolve the route and build bridge parameters |
| `GET /api/scan-token` | Find every network a token exists on |
| `GET /api/verify-oft` | Verify a manually entered OFT contract |
| `GET /api/bridge-params-manual` | Fallback using a txHash or destination contract |
| `GET /api/balance` | Token balance |
| `GET /api/quote` | Fee quote |
| `GET /api/tx-status` | LayerZero delivery status |
| `GET /api/health` | Health check |

---

## Adding a network

Add an entry to the `CHAINS` object in **both** `backend/lib/chains.js` and
`frontend/src/lib/chains.js`, then register the chain for the wallet in
`frontend/src/main.jsx`. Take the endpoint ID (`eid`) from the
[LayerZero docs](https://docs.layerzero.network/v2/deployments/deployed-contracts)
— it is not the same as the chain ID.

---

## Troubleshooting

**Wallet window is empty** — `VITE_REOWN_PROJECT_ID` is missing. Set it in `.env`,
regenerate `frontend/.env`, and restart the dev server (Vite reads env at startup).

**"Bridge route not found"** — the route may be genuinely unused. Try entering the
destination OFT contract or a sample transaction hash manually.

**Token search finds nothing** — usually the network's RPC cannot serve historical
logs. Run `node backend/tools/checkLogsRpc.js` and set `LOGS_RPC_<CHAIN>` if needed.

**Balance shows `—`** — check that the wallet is connected, the token exists on the
selected source network, and the RPC is reachable.

---

## Security notes

- The interface is non-custodial and never asks for a private key or seed phrase.
- Nothing is stored server-side: saved tokens live in your browser's local storage.
- **Always verify the token contract address you paste.** Anyone can deploy a
  token with a familiar name or ticker. The bridge does not review or endorse
  any token.
- Never commit your `.env` — it is git-ignored for a reason.

## Disclaimer

Provided as is, without warranty of any kind. Crypto transactions are
irreversible. Verify the destination network and amount before confirming.
Use at your own risk. This is not financial advice.

## Credits

Built on [LayerZero V2](https://layerzero.network/). Wallet connection by
[Reown AppKit](https://reown.com/). Frontend: React + Vite. Backend: Node + Express.
