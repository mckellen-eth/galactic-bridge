# Contributing to Galactic Bridge

Thanks for taking an interest. This is a small project, so the process is light.

## Ways to help

- **Report a bug.** Open an issue describing what you did, what you expected, and
  what happened instead.
- **Report a route that fails.** This is the most useful kind of report. Include
  the token contract address, the source and destination networks, and the error
  text the interface showed.
- **Add a network.** See "Adding a network" in [README_ENG.md](README_ENG.md).
- **Improve the docs.** Corrections to the README or the
  [documentation site](https://galactic-bridge.gitbook.io/galactic-bridge-docs/)
  are welcome.

## Before you open an issue

Please check that the problem is not one of the known limitations, which are
documented in README_ENG.md under "What is and isn't supported":

- **LayerZero V1 tokens are not supported.** They use a different protocol. The
  bridge detects this and says so.
- **Stargate pool tokens** (USDC and similar) use their own architecture, not the
  OFT standard.
- **Custom OApps** that are not tokens have no `token()` or `quoteSend()`.
- **A failing search is often an RPC problem, not a bug.** Run
  `node backend/tools/checkLogsRpc.js` first. If a network cannot serve historical
  logs, set `LOGS_RPC_<CHAIN>` in your `.env`.

## Development setup

```bash
git clone https://github.com/<your-username>/galactic-bridge.git
cd galactic-bridge
cp .env.example .env          # set VITE_REOWN_PROJECT_ID

cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
grep '^VITE_' .env > frontend/.env

cd backend  && node server.js     # terminal 1
cd frontend && npm run dev        # terminal 2
```

Use your **own** Reown project ID from [dashboard.reown.com](https://dashboard.reown.com).
It is free and tied to your account.

## Pull requests

- Keep a pull request to one change. Small and reviewable beats large and complete.
- Explain *why*, not only *what*. The reasoning is the part that is hard to
  reconstruct later.
- Match the surrounding code style. There is no linter to argue with you.
- Test the route search against at least one real token before submitting changes
  to `backend/lib/oftSearch.js` — this is the part where a subtle mistake silently
  produces wrong transaction parameters.

## Things that will not be merged

- **Secrets of any kind.** No API keys, RPC keys, project IDs or tokens in source
  files. Everything configurable goes in `.env`, which is git-ignored.
- **Anything that spends the maintainer's quota by default.** A local install must
  not fall back to shared analytics, RPC keys or wallet project IDs.
- Custody of user funds. The interface is non-custodial and stays that way.

## Security

If you find a vulnerability, please **do not open a public issue.** Report it
privately via [Telegram](https://t.me/mckellen_eth) and allow reasonable time for
a fix before disclosing.

## Code of conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
