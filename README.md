<h1 align="center">Galactic Bridge</h1>

<p align="center">
  Universal cross-chain bridge interface for <b>LayerZero V2 OFT</b> tokens.<br>
  Bridge any OFT token between EVM networks — even those no bridge UI has listed.
</p>

<p align="center">
  <a href="https://galacticbridge.app"><b>galacticbridge.app</b></a>
  ·
  <a href="https://galactic-bridge.gitbook.io/galactic-bridge-docs/"><b>Documentation</b></a>
</p>

---

## Documentation

**[Full documentation site →](https://galactic-bridge.gitbook.io/galactic-bridge-docs/)**

In this repository:

| | |
|---|---|
| 🇬🇧 **English** | [README_ENG.md](README_ENG.md) |
| 🇺🇦 **Українська** | [README_UKR.md](README_UKR.md) |
| 📋 **Changelog** | [CHANGELOG.md](CHANGELOG.md) · [українською](CHANGELOG_UKR.md) |

## Quick start

Install [Node.js LTS](https://nodejs.org/), then:

**Windows** — double-click `start.bat`

**macOS / Linux**
```bash
cp .env.example .env                  # set VITE_REOWN_PROJECT_ID
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
grep '^VITE_' .env > frontend/.env
cd backend && node server.js          # terminal 1
cd frontend && npm run dev            # terminal 2
```

Open `http://localhost:5173`.

## At a glance

- Works with **any** OFT token — no allowlist
- Finds the bridge contract automatically, including adapters for non-OFT tokens
- Builds routes even with **zero transaction history**, by querying contracts directly
- Non-custodial — no accounts, no personal data, you sign everything yourself
- 13 networks: Ethereum, BNB Chain, Base, Arbitrum, Optimism, Polygon, Avalanche,
  Mantle, HyperEVM, Ink, X Layer, Plasma, Robinhood

## Tech

React + Vite · Node + Express · [LayerZero V2](https://layerzero.network/) · [Reown AppKit](https://reown.com/)

---

> Provided as is, without warranty. Crypto transactions are irreversible — always
> verify the token contract, destination network and amount before confirming.
> Not financial advice.
