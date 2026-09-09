# Changelog

All notable changes to Galactic Bridge are documented here.

**Language:** English · [Українська](CHANGELOG_UKR.md)

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

---

## [1.2.1] — 2026-09-09

### Changed

- The footer now reads "Built on the LayerZero V2 protocol" instead of "Powered
  by LayerZero". The previous wording could be read as a claim of official
  affiliation, which it was never meant to be.
- The disclaimer now states plainly that Galactic Bridge is an independent,
  open-source project, not affiliated with, endorsed by, or operated by
  LayerZero Labs Ltd, and that the LayerZero name is used only to describe the
  protocol this interface interacts with.

---

## [1.2.0] — 2026-09-08

Reliability release. Nothing about the interface changed; the search underneath
it got considerably harder to break.

### Added

- **Disabled directions are detected before you sign.** A token existing on two
  networks does not mean it can move between them: projects switch directions
  off by clearing the `peer` setting on the contract, often after a single test
  transaction. LayerZero history still shows the old delivered message, so
  history alone is not proof that a route works today. The bridge now asks both
  contracts directly and explains the situation instead of quoting a fee for a
  transaction that would be rejected on-chain.
- **Protection against tokens stuck in transit.** `peer` is one-directional, and
  the two failure modes are not equally serious. Missing on the source, the
  transaction is rejected and funds are untouched. Missing on the *destination*,
  the source transaction succeeds, tokens are sent, and delivery fails on the
  other side — leaving them in limbo. Both sides are now checked, and the second
  case is blocked outright.
- **Search result caching.** The OFT adapter is cached for 24 hours (it does not
  change) and the network list for one hour. A repeated search returns in a
  fraction of a second instead of rescanning. Fees and balances are never cached
  — they depend on gas prices and a stale fee means a rejected transaction.
- **`LOGS_RPC_<CHAIN>` accepts several nodes**, separated by commas, tried in
  order.
- **`GET /api/cache-stats`** — cache size and hit rate.
- **`GET /api/scan-token?refresh=1`** — bypass the cached network list.
- **Separate rate limits** for the expensive endpoints: `RL_SCAN_MAX`
  (default 15/min) and `RL_FIND_MAX` (default 50/min).

### Changed

- **The logs node can now be replaced in the middle of a scan.** Picking a node
  takes one short request; a full adapter scan takes several hundred in a row.
  A node could pass the check and then start refusing requests once the real
  work began. Now the search moves to the next node and **resumes from the same
  block range** — nothing is rescanned and the scan is not abandoned.
- **A failed request is no longer indistinguishable from an empty result.** Both
  previously looked the same to the caller, which is how a search could quietly
  report "nothing found" for a token that was really there. They are now tracked
  separately, which is what makes the node switch above possible.
- Live fee quoting on HyperEVM, which previously fell back to a fee decoded from
  an old transaction when the public node did not respond.

### Fixed

- Searching a token by its contract address no longer misses a disabled
  direction when the token has not been saved yet. The check was reading
  `peers()` from the token address instead of the adapter, and plain ERC-20
  tokens have no such function.
- Deep log scanning on HyperEVM, which previously exhausted the public node and
  returned nothing. Routes for such tokens were discoverable from other networks
  but not from HyperEVM itself.

---

## [1.1.0] — 2026-09-07

### Added

- **Nebula theme** — a fourth appearance, carrying the look of the promo video
  over to the site: a drifting starfield with a soft nebula behind it.
- **Reworked meteors.** Instead of a steady stream, one meteor crosses at a
  time, entering from anywhere along the top or the upper sides, with a pause of
  10–20 seconds between flights and an occasional shorter gap. Sparse enough to
  be a surprise rather than background noise.

### Fixed

- **Cross-chain address collisions.** The same address can hold entirely
  unrelated contracts on different networks. When the entered token address
  existed on several chains, the search could start from the wrong one, find
  nothing, and give up — even though the token was perfectly discoverable from
  its real chain. Candidate chains are now ordered so that the ones where the
  address actually looks like a token come first, and the search continues
  through the rest instead of stopping at the first failure.

### Changed

- Shortened the "Why this bridge" text in the footer — it had grown long enough
  to make the panel scroll.

---

## [1.0.0] — 2026-09-05

First public release at [galacticbridge.app](https://galacticbridge.app).

The bridge previously found a route only when LayerZero history already
contained a delivered transaction in that exact direction. If it did not, you
were left looking up contracts in a block explorer by hand. This release replaced
that approach: the bridge asks the contracts, rather than trusting history.

### Added

- **Routes with no history at all.** `peers()` — the standard LayerZero function
  through which a contract states which networks it is paired with — is queried
  directly, so a route can be built even if nobody has ever used it. Rare
  directions, new networks and freshly opened pairs all work.
- **Automatic adapter discovery for tokens that are not OFTs themselves.** Many
  tokens are moved by a separate adapter contract that previously had to be
  found by hand. The bridge now intersects the token's `Transfer` logs with
  LayerZero's `OFTSent` / `OFTReceived` events over the same block range: a
  transaction present in both is a bridge transaction, and the address that
  emitted the event is the adapter. Deterministic, and it works for both
  lock/unlock and burn/mint designs.
- **A complete network map per token.** Saving a token walks every connected
  contract instead of reading history alone. The LayerZero API returns only the
  most recent ~100 messages, so networks with older activity used to disappear
  from the list entirely.
- **Transaction building from the standard interface.** The call format is
  normally learned from a real direct transaction, because many OFTs use custom
  selectors and a learned format is safer than an assumed one. But popular
  tokens are usually bridged through routers and aggregators, and such a
  transaction carries the router's call data, not the token's. When no direct
  example exists, the call is now assembled from the LayerZero V2 standard
  instead — which brought a whole class of tokens into scope. The fee comes from
  a live `quoteSend()` in both cases.
- **A wallet picker** showing every installed wallet plus WalletConnect for
  connecting a phone by QR code. Previously the first available wallet was used.
- Three themes, including animated ones — Minimal, Galactic and Starfield.

### Changed

- Search speed: what used to hit a timeout now takes seconds. Thousands of
  requests (two per token transfer) became dozens, with parallel scanning, early
  exit on a match, and caching.
- Node selection: the bridge picks an RPC that actually serves the data it
  needs, with fallbacks. Several public nodes turned out to be unusable and were
  replaced.
- Balance loading: retries on node failure, parallel requests, and caching of
  immutable token data removed the intermittent blank readings.
- Technical panels collapse by default; clearer transaction status icons; saved
  token markers, loading indicators and copy confirmations; a reworked mobile
  layout.

### Fixed

- **Networks with high endpoint IDs.** A decoder limitation meant routes to
  Robinhood, HyperEVM, Plasma and Ink were never built, even when every piece of
  data was present.
- **False contract matches.** The bridge verifies that the contract it found
  actually serves the token in question. An aggregator transaction swapping
  several tokens at once could otherwise supply the wrong contract, producing
  parameters that look valid but are not — worse than reporting nothing found.

### Infrastructure

- Moved from local-only to a dedicated server with a domain and HTTPS.
- Uptime monitoring with alerts, plus visitor analytics.
- Server hardening: key-only access, firewall, brute-force auto-banning, and the
  backend not exposed directly.

---

## Supported networks

Ethereum, BNB Chain, Base, Arbitrum, Optimism, Polygon, Avalanche, Mantle,
HyperEVM, Ink, X Layer, Plasma, Robinhood.

[1.2.1]: https://github.com/mckellen-eth/galactic-bridge/releases/tag/v1.2.1
[1.2.0]: https://github.com/mckellen-eth/galactic-bridge/releases/tag/v1.2.0
[1.1.0]: https://github.com/mckellen-eth/galactic-bridge/releases/tag/v1.1.0
[1.0.0]: https://github.com/mckellen-eth/galactic-bridge/releases/tag/v1.0.0
