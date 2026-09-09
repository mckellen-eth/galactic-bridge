# Tokens to try

Real LayerZero V2 OFT tokens that are **not listed on Stargate** — useful for
seeing what Galactic Bridge actually does. Paste a contract address into
[galacticbridge.app](https://galacticbridge.app), press **Search**, and the
bridge finds the OFT contract, the connected networks and the fee by itself.

> These are examples for testing, not recommendations. Galactic Bridge does not
> review, endorse or vouch for any token. Always verify a contract address
> yourself before sending anything — anyone can deploy a token using a familiar
> name or ticker.

Where an **OFT contract** is listed separately, the token itself is a plain
ERC-20 and the transfer goes through that adapter — which means two
transactions: an approval first, then the bridge.

---

## RAM — Ramses

Five networks, and on HyperEVM the OFT is a separate adapter.

| Network | Token | OFT contract |
|---|---|---|
| Base | `0x03fe4dd36db2c8483e258974db82d07d82f8d239` | same |
| Polygon | `0x8483f906187c45cc2b491f26dbbdd7c3231597e8` | same |
| Robinhood | `0x5173d45a1191ee33cbb7d8c7e65f21b04ed54802` | same |
| HyperEVM | `0x555570a286f15ebdfe42b66ede2f724aa1ab5555` | `0xe1c39b767e968a57af2ecad2f5b09ee2e7874d9f` |
| Ethereum | `0x95cbe89a7712ad5b99ff2956e9d5369fc65959eb` | same |

## APR — aPriori

| Network | Token | OFT contract |
|---|---|---|
| BNB Chain | `0x299AD4299Da5b2b93Fba4c96967B040C7F611099` | same |
| Ethereum | `0x5A9610919f5e81183823A2be4Bd1BeB2B4da2a20` | `0xc0d626efba75d74d6c50e3b1dadbb41d32169748` |

## O — o1.exchange

| Network | Token | OFT contract |
|---|---|---|
| Base | `0x182FA643E5f29d5EcA75e7b9CF9336A3fe4620b2` | `0x500a02a20b0b0a3f3efccfc0559543f5743bd1c4` |
| BNB Chain | `0x500A02a20B0B0A3F3efCCFc0559543F5743bd1C4` | same |

## GITLAWB — gitlawb

| Network | Token | OFT contract |
|---|---|---|
| Robinhood | `0xd1b0d44E4f6ed940fcC7A9F59Bf30Daf62cCFe3D` | same |
| Base | `0x5F980Dcfc4c0fa3911554cf5ab288ed0eb13DBa3` | `0x3308384bc308d09b3eba9a8f11cc36e993a273a4` |

## ACU

| Network | Token | OFT contract |
|---|---|---|
| Ethereum | `0x216b3643ff8b7bb30d8a48e9f1bd550126202add` | `0x4ad11f4d6b4626e426fbe88e8f1c78f469ca33be` |
| Base | `0xc5fed7c8ccc75d8a72b601a66dffd7a489073f0b` | same |
| BNB Chain | `0x6ef2ffb38d64afe18ce782da280b300e358cfeaf` | same |

## beHYPE — Hyperbeat

| Network | Token | OFT contract |
|---|---|---|
| HyperEVM | `0xd8fc8f0b03eba61f64d08b0bef69d80916e5dda9` | `0x637de4a55cdd37700f9b54451b709b01040d48df` |
| Optimism | `0xa519afbc91986c0e7501d7e34968fee51cd901ac` | same |

## PAXG — Paxos Gold

| Network | Token | OFT contract |
|---|---|---|
| Ethereum | `0x45804880de22913dafe09f4980848ece6ecbaf78` | `0xb20a9c1fce74ec335f5dbf30720e3b628bde49f9` |
| Optimism | `0x41a7f2bb9789199654c206f09392674c1af6676c` | same |

## NUMI — NUMINE

| Network | Token | OFT contract |
|---|---|---|
| Ethereum | `0xa29c9a740de8194e4016747e9a04a84946ada0a5` | `0xc61eb549acf4a05ed6e3fe0966f5e213b23541ce` |
| BNB Chain | `0xc61eb549acf4a05ed6e3fe0966f5e213b23541ce` | same |
| Avalanche | `0x59234b44214d88c57b7c54a6d2633334d95c5161` | same |

---

## What will not work, and why

Not every token on LayerZero can be bridged this way. The interface says which
case it is instead of failing silently:

- **LayerZero V1 tokens.** A different protocol version with its own endpoint
  and interface. Detected immediately and reported.
- **Directions the project switched off.** A token can exist on two networks
  while the route between them is disabled in the contract. Both sides are
  checked before you sign.
- **Tokens moved by a third-party app** rather than their own OFT contract —
  some launchpads bridge every token they issue through one shared contract with
  a custom interface.

See [Supported tokens](https://galactic-bridge.gitbook.io/galactic-bridge-docs/supported-tokens)
for the full picture.
