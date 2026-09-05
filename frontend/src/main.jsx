import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, bsc, base, arbitrum, polygon, optimism, avalanche } from '@reown/appkit/networks';
import App from './App';
import './styles.css';

// Хелпер для кастомних чейнів (appkit + wagmi сумісний формат)
const defineChain = (id, name, symbol, rpc, explorerName, explorerUrl, decimals = 18) => ({
  id,
  name,
  nativeCurrency: { name: symbol, symbol, decimals },
  rpcUrls: { default: { http: [rpc] } },
  blockExplorers: { default: { name: explorerName, url: explorerUrl } },
  caipNetworkId: `eip155:${id}`,
  chainNamespace: 'eip155',
});

const mantleNetwork = defineChain(5000, 'Mantle', 'MNT', 'https://rpc.mantle.xyz', 'MantleScan', 'https://mantlescan.xyz');
const hyperevm    = defineChain(999,   'HyperEVM',        'HYPE', 'https://rpc.hyperliquid.xyz/evm',        'HyperEVMScan', 'https://hyperevmscan.io');
const ink         = defineChain(57073, 'Ink',             'ETH',  'https://rpc-gel.inkonchain.com',         'Ink Explorer', 'https://explorer.inkonchain.com');
const xlayer      = defineChain(196,   'X Layer',         'OKB',  'https://rpc.xlayer.tech',                'OKLink',       'https://www.oklink.com/xlayer');
const plasma      = defineChain(9745,  'Plasma',          'XPL',  'https://rpc.plasma.to',                  'PlasmaScan',   'https://plasmascan.to');
const robinhood   = defineChain(4663,  'Robinhood', 'ETH',  'https://rpc.mainnet.chain.robinhood.com','RobinScan',    'https://robinhoodchain.blockscout.com');

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
// mainnet перший — щоб AppKit не auto-switch на BSC при підключенні гаманця.
// Гаманець залишається на тому чейні де був; перемикання тільки при натисканні BRIDGE.
const allNetworks = [
  mainnet, bsc, base, arbitrum, polygon, optimism, avalanche, mantleNetwork,
  hyperevm, ink, xlayer, plasma, robinhood,
];

const metadata = {
  name: 'Galactic Bridge',
  description: 'LayerZero OFT bridge by contract address',
  url: 'https://galacticbridge.app',
  icons: ['https://galacticbridge.app/favicon.svg'],
};

const wagmiAdapter = new WagmiAdapter({ networks: allNetworks, projectId });
createAppKit({
  adapters: [wagmiAdapter],
  networks: allNetworks,
  projectId,
  metadata,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#e8ff00',
    '--w3m-font-family': "'Courier New', monospace",
    '--w3m-border-radius-master': '1px',
  },
  // Тільки гаманці — без email/соцмереж (вбудовані гаманці Reown вимкнено).
  features: { analytics: false, email: false, socials: false },
});

// ЄДИНИЙ wagmi-конфіг = конфіг адаптера AppKit (щоб модалка вибору гаманця і
// стан застосунку (useAccount тощо) читали одне джерело).
const config = wagmiAdapter.wagmiConfig;

// Веб-аналітика Cloudflare — підключається ЛИШЕ якщо власник сайту задав свій
// токен у .env. Без нього нічого не вантажиться і нікуди не надсилається:
// той, хто запускає міст локально, не шле статистику в чужий акаунт.
const cfBeacon = import.meta.env.VITE_CF_BEACON_TOKEN;
if (cfBeacon) {
  const s = document.createElement('script');
  s.defer = true;
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon', JSON.stringify({ token: cfBeacon }));
  document.head.appendChild(s);
}

const qc = new QueryClient();
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><WagmiProvider config={config}><QueryClientProvider client={qc}><App /></QueryClientProvider></WagmiProvider></React.StrictMode>);
