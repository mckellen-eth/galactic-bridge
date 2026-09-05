export const CHAINS = {
  bsc: { key: 'bsc', name: 'BNB Chain', chainId: 56, chainIdHex: '0x38', eid: 30102, explorerUrl: 'https://bscscan.com', nativeSym: 'BNB' },
  base: { key: 'base', name: 'Base', chainId: 8453, chainIdHex: '0x2105', eid: 30184, explorerUrl: 'https://basescan.org', nativeSym: 'ETH' },
  eth: { key: 'eth', name: 'Ethereum', chainId: 1, chainIdHex: '0x1', eid: 30101, explorerUrl: 'https://etherscan.io', nativeSym: 'ETH' },
  arb: { key: 'arb', name: 'Arbitrum', chainId: 42161, chainIdHex: '0xa4b1', eid: 30110, explorerUrl: 'https://arbiscan.io', nativeSym: 'ETH' },
  poly: { key: 'poly', name: 'Polygon', chainId: 137, chainIdHex: '0x89', eid: 30109, explorerUrl: 'https://polygonscan.com', nativeSym: 'POL' },
  op: { key: 'op', name: 'Optimism', chainId: 10, chainIdHex: '0xa', eid: 30111, explorerUrl: 'https://optimistic.etherscan.io', nativeSym: 'ETH' },
  avax: { key: 'avax', name: 'Avalanche', chainId: 43114, chainIdHex: '0xa86a', eid: 30106, explorerUrl: 'https://snowtrace.io', nativeSym: 'AVAX' },
  mantle: { key: 'mantle', name: 'Mantle', chainId: 5000, chainIdHex: '0x1388', eid: 30181, explorerUrl: 'https://mantlescan.xyz', nativeSym: 'MNT' },
  hyperevm: { key: 'hyperevm', name: 'HyperEVM', chainId: 999, chainIdHex: '0x3e7', eid: 30367, explorerUrl: 'https://hyperevmscan.io', nativeSym: 'HYPE' },
  ink: { key: 'ink', name: 'Ink', chainId: 57073, chainIdHex: '0xdef1', eid: 30339, explorerUrl: 'https://explorer.inkonchain.com', nativeSym: 'ETH' },
  xlayer: { key: 'xlayer', name: 'X Layer', chainId: 196, chainIdHex: '0xc4', eid: 30274, explorerUrl: 'https://www.oklink.com/xlayer', nativeSym: 'OKB' },
  plasma: { key: 'plasma', name: 'Plasma', chainId: 9745, chainIdHex: '0x2611', eid: 30383, explorerUrl: 'https://plasmascan.to', nativeSym: 'XPL' },
  robinhood: { key: 'robinhood', name: 'Robinhood', chainId: 4663, chainIdHex: '0x1237', eid: 30416, explorerUrl: 'https://robinhoodchain.blockscout.com', nativeSym: 'ETH' },
};

export const CHAIN_LIST = Object.values(CHAINS);
