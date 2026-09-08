// Діагностика: чи вміє RPC кожної мережі віддавати ГЛИБОКІ логи (eth_getLogs).
// Це критично для пошуку bridge-адаптера, коли токен сам не є OFT.
// Запуск:  cd /root/backend && node tools/checkLogsRpc.js
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { CHAIN_LIST } from '../lib/chains.js';
import { LZ_ENDPOINT_V2 } from '../lib/explorer.js';

const OFT_SENT = '0x85496b760a4b7f8d66384b9df21b381f5d1b1e79f229a47aaf4c232edc2fe59a';
const OFT_RECV = '0xefed6d3500546b29533b128a29e3a94d70788727f0507505ac12eaf2e578fd9c';
const hex = (n) => '0x' + n.toString(16);

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
    if (d.error) return { err: String(d.error.message || d.error).slice(0, 48) };
    return { ok: d.result };
  } catch (e) { return { err: (e.name === 'AbortError' ? 'timeout' : String(e.message)).slice(0, 48) }; }
}

// той самий порядок вибору вузла, що й у бекенді
function logsUrls(chain) {
  const envUrls = String(process.env[`LOGS_RPC_${chain.key.toUpperCase()}`] || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const list = Array.isArray(chain.logsRpc) ? [...chain.logsRpc] : (chain.logsRpc ? [chain.logsRpc] : []);
  if (!list.includes(chain.rpc)) list.push(chain.rpc);
  return [...envUrls, ...list.filter((u) => !envUrls.includes(u))];
}

const short = (u) => (u.length > 46 ? u.slice(0, 43) + '...' : u);

for (const chain of CHAIN_LIST) {
  const urls = logsUrls(chain);
  let best = null;
  for (const url of urls) {
    const bn = await rpc(url, 'eth_blockNumber', []);
    if (!bn.ok) continue;
    const latest = parseInt(bn.ok, 16);
    const res = { url, latest, depth: {}, topicOnly: null };
    for (const off of [0, 50000, 500000]) {
      const to = Math.max(1, latest - off);
      const from = Math.max(0, to - 999);
      const r = await rpc(url, 'eth_getLogs', [{
        fromBlock: hex(from), toBlock: hex(to), address: LZ_ENDPOINT_V2,
      }]);
      res.depth[off] = r.err ? `ERR ${r.err}` : `ok(${r.ok?.length ?? 0})`;
    }
    const t = await rpc(url, 'eth_getLogs', [{
      fromBlock: hex(latest - 499), toBlock: hex(latest), topics: [[OFT_SENT, OFT_RECV]],
    }]);
    res.topicOnly = t.err ? `ERR ${t.err}` : `ok(${t.ok?.length ?? 0})`;
    const deepOk = String(res.depth[500000]).startsWith('ok');
    if (deepOk) { best = res; break; }          // знайшли архівний — далі не шукаємо
    if (!best) best = res;                       // запамʼятаємо перший робочий
  }

  console.log(`\n=== ${chain.key.toUpperCase()} (${chain.name}) ===`);
  if (!best) { console.log('  ЖОДЕН вузол не відповів'); continue; }
  console.log(`  вузол:      ${short(best.url)}`);
  console.log(`  свіжі логи: ${best.depth[0]}`);
  console.log(`  -50k блоків:  ${best.depth[50000]}`);
  console.log(`  -500k блоків: ${best.depth[500000]}`);
  console.log(`  topic-only:   ${best.topicOnly}`);
  const deepOk = String(best.depth[500000]).startsWith('ok');
  console.log(`  ВИСНОВОК: ${deepOk ? 'OK — глибокі логи працюють' : 'ПОТРІБЕН архівний вузол -> LOGS_RPC_' + chain.key.toUpperCase()}`);
}
console.log('\nГотово.');
