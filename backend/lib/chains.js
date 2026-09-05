export const CHAINS = {
  // logsRpc — окремий вузол ТІЛЬКИ для eth_getLogs. Публічні bsc-dataseed.* віддають
  // "limit exceeded" навіть на 500 блоків, тому пошук OFT-адаптера на BSC не працював.
  bsc: { key: 'bsc', name: 'BNB Chain', chainId: 56, chainIdHex: '0x38', eid: 30102, explorerUrl: 'https://bscscan.com', nativeSym: 'BNB', rpc: 'https://bsc-dataseed.binance.org/', logsRpc: ['https://bsc-rpc.publicnode.com', 'https://bsc.blockpi.network/v1/rpc/public', 'https://bsc.meowrpc.com', 'https://bsc-pokt.nodies.app', 'https://binance.llamarpc.com', 'https://bsc-mainnet.public.blastapi.io'] },
  base: { key: 'base', name: 'Base', chainId: 8453, chainIdHex: '0x2105', eid: 30184, explorerUrl: 'https://basescan.org', nativeSym: 'ETH', rpc: 'https://mainnet.base.org', rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.drpc.org'] },
  // cloudflare-eth.com згорнули ("Cannot fulfill request") — замінено на робочий.
  // Глибокі логи безкоштовні вузли ETH не дають → задай LOGS_RPC_ETH у .env.
  eth: { key: 'eth', name: 'Ethereum', chainId: 1, chainIdHex: '0x1', eid: 30101, explorerUrl: 'https://etherscan.io', nativeSym: 'ETH', rpc: 'https://ethereum-rpc.publicnode.com', logsRpc: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://eth.merkle.io'] },
  arb: { key: 'arb', name: 'Arbitrum', chainId: 42161, chainIdHex: '0xa4b1', eid: 30110, explorerUrl: 'https://arbiscan.io', nativeSym: 'ETH', rpc: 'https://arb1.arbitrum.io/rpc', rpcs: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com', 'https://arbitrum.drpc.org'] },
  // polygon-rpc.com почав віддавати HTTP 401 — замінено на робочий.
  poly: { key: 'poly', name: 'Polygon', chainId: 137, chainIdHex: '0x89', eid: 30109, explorerUrl: 'https://polygonscan.com', nativeSym: 'POL', rpc: 'https://polygon-bor-rpc.publicnode.com', logsRpc: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'] },
  op: { key: 'op', name: 'Optimism', chainId: 10, chainIdHex: '0xa', eid: 30111, explorerUrl: 'https://optimistic.etherscan.io', nativeSym: 'ETH', rpc: 'https://mainnet.optimism.io', rpcs: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com', 'https://optimism.drpc.org'] },
  // api.avax.network жорстко ріже запити (error 1015) — основним ставимо publicnode.
  avax: { key: 'avax', name: 'Avalanche', chainId: 43114, chainIdHex: '0xa86a', eid: 30106, explorerUrl: 'https://snowtrace.io', nativeSym: 'AVAX', rpc: 'https://avalanche-c-chain-rpc.publicnode.com', rpcs: ['https://avalanche-c-chain-rpc.publicnode.com', 'https://avalanche.drpc.org', 'https://api.avax.network/ext/bc/C/rpc'] },
  mantle: { key: 'mantle', name: 'Mantle', chainId: 5000, chainIdHex: '0x1388', eid: 30181, explorerUrl: 'https://mantlescan.xyz', nativeSym: 'MNT', rpc: 'https://rpc.mantle.xyz', rpcs: ['https://rpc.mantle.xyz', 'https://mantle-rpc.publicnode.com'] },
  hyperevm: { key: 'hyperevm', name: 'HyperEVM', chainId: 999, chainIdHex: '0x3e7', eid: 30367, explorerUrl: 'https://hyperevmscan.io', nativeSym: 'HYPE', rpc: 'https://rpc.hyperliquid.xyz/evm', logsRpc: ['https://rpc.hyperliquid.xyz/evm', 'https://hyperliquid.drpc.org', 'https://rpc.hypurrscan.io', 'https://rpc.purroofgroup.com'] },
  ink: { key: 'ink', name: 'Ink', chainId: 57073, chainIdHex: '0xdef1', eid: 30339, explorerUrl: 'https://explorer.inkonchain.com', nativeSym: 'ETH', rpc: 'https://rpc-gel.inkonchain.com', rpcs: ['https://rpc-gel.inkonchain.com', 'https://ink.drpc.org'] },
  // rpc.xlayer.tech ок для eth_call, але на eth_getLogs віддає 400 → логи через drpc.
  xlayer: { key: 'xlayer', name: 'X Layer', chainId: 196, chainIdHex: '0xc4', eid: 30274, explorerUrl: 'https://www.oklink.com/xlayer', nativeSym: 'OKB', rpc: 'https://rpc.xlayer.tech', logsRpc: ['https://xlayer.drpc.org'] },
  plasma: { key: 'plasma', name: 'Plasma', chainId: 9745, chainIdHex: '0x2611', eid: 30383, explorerUrl: 'https://plasmascan.to', nativeSym: 'XPL', rpc: 'https://rpc.plasma.to', rpcs: ['https://rpc.plasma.to', 'https://plasma.drpc.org'] },
  robinhood: { key: 'robinhood', name: 'Robinhood', chainId: 4663, chainIdHex: '0x1237', eid: 30416, explorerUrl: 'https://robinhoodchain.blockscout.com', nativeSym: 'ETH', rpc: 'https://rpc.mainnet.chain.robinhood.com', rpcs: ['https://rpc.mainnet.chain.robinhood.com'] },
};

export const CHAIN_LIST = Object.values(CHAINS);
export const getChain = (key) => CHAINS[key];
export const getChainById = (chainId) => CHAIN_LIST.find((c) => c.chainId === Number(chainId));
export const getChainByEid = (eid) => CHAIN_LIST.find((c) => c.eid === Number(eid));
