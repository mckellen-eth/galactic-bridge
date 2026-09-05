// Підбір робочих RPC для проблемних мереж.
// Перевіряє КОЖНОГО кандидата на: блок, eth_call, глибокі логи, topic-only.
// Запуск:  cd /root/backend && node tools/findRpc.js
import { LZ_ENDPOINT_V2 } from '../lib/explorer.js';

const OFT_SENT = '0x85496b760a4b7f8d66384b9df21b381f5d1b1e79f229a47aaf4c232edc2fe59a';
const OFT_RECV = '0xefed6d3500546b29533b128a29e3a94d70788727f0507505ac12eaf2e578fd9c';
const hex = (n) => '0x' + n.toString(16);

// Кандидати для мереж, де поточний вузол не впорався
const CANDIDATES = {
  eth: [
    'https://ethereum-rpc.publicnode.com',
    'https://eth.llamarpc.com',
    'https://eth.drpc.org',
    'https://rpc.flashbots.net',
    'https://eth.merkle.io',
    'https://1rpc.io/eth',
    'https://cloudflare-eth.com',
  ],
  poly: [
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon.llamarpc.com',
    'https://polygon.drpc.org',
    'https://1rpc.io/matic',
    'https://polygon.blockpi.network/v1/rpc/public',
    'https://polygon-rpc.com',
  ],
  hyperevm: [
    'https://hyperliquid.drpc.org',
    'https://rpc.hypurrscan.io',
    'https://hyperliquid-json-rpc.stakely.io',
    'https://rpc.purroofgroup.com',
    'https://rpc.hyperliquid.xyz/evm',
  ],
  xlayer: [
    'https://xlayerrpc.okx.com',
    'https://endpoints.omniatech.io/v1/xlayer/mainnet/public',
    'https://xlayer.drpc.org',
    'https://rpc.xlayer.tech',
  ],
};

async function rpc(url, method, params) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: c.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { err: `HTTP ${r.status}` };
    const d = await r.json();
    if (d.error) return { err: String(d.error.message || d.error).slice(0, 40) };
    return { ok: d.result };
  } catch (e) { return { err: (e.name === 'AbortError' ? 'timeout' : String(e.message)).slice(0, 40) }; }
}

for (const [chainKey, urls] of Object.entries(CANDIDATES)) {
  console.log(`\n########  ${chainKey.toUpperCase()}  ########`);
  for (const url of urls) {
    const bn = await rpc(url, 'eth_blockNumber', []);
    if (!bn.ok) { console.log(`  ✗ ${url}\n      блок: ERR ${bn.err}`); continue; }
    const latest = parseInt(bn.ok, 16);

    // базовий eth_call (потрібен для quote/balance)
    const call = await rpc(url, 'eth_call', [{ to: LZ_ENDPOINT_V2, data: '0x' }, 'latest']);
    const callOk = !call.err || /revert|execution/i.test(call.err);

    const deep = await rpc(url, 'eth_getLogs', [{
      fromBlock: hex(Math.max(0, latest - 500999)), toBlock: hex(Math.max(1, latest - 500000)),
      address: LZ_ENDPOINT_V2,
    }]);
    const topic = await rpc(url, 'eth_getLogs', [{
      fromBlock: hex(latest - 499), toBlock: hex(latest), topics: [[OFT_SENT, OFT_RECV]],
    }]);

    const deepOk = !deep.err;
    const mark = deepOk && callOk ? '✓' : (callOk ? '~' : '✗');
    console.log(`  ${mark} ${url}`);
    console.log(`      блок=${latest}  eth_call=${callOk ? 'ok' : 'ERR ' + call.err}`);
    console.log(`      -500k логи: ${deep.err ? 'ERR ' + deep.err : 'ok(' + (deep.ok?.length ?? 0) + ')'}`);
    console.log(`      topic-only: ${topic.err ? 'ERR ' + topic.err : 'ok(' + (topic.ok?.length ?? 0) + ')'}`);
  }
}
console.log('\nЛегенда: ✓ придатний і для логів, і для транзакцій | ~ працює, але без глибоких логів | ✗ не годиться');
