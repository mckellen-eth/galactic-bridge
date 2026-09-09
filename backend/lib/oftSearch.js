import { CHAINS, getChainByEid } from './chains.js';
import { LZ_ENDPOINT_V2, layerZeroTxUrl } from './explorer.js';
import { chainRpcUrls } from './rpc.js';
import { oftCache, routesCache } from './cache.js';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_TOPIC = '0x0000000000000000000000000000000000000000000000000000000000000000';
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const TOKEN_SELECTOR = '0xfc0c546a';
// keccak256("OFTSent(bytes32,uint32,address,uint256,uint256)")
const OFT_SENT_TOPIC     = '0x85496b760a4b7f8d66384b9df21b381f5d1b1e79f229a47aaf4c232edc2fe59a';
// keccak256("OFTReceived(bytes32,uint32,address,uint256)")
const OFT_RECEIVED_TOPIC = '0xefed6d3500546b29533b128a29e3a94d70788727f0507505ac12eaf2e578fd9c';
const LOG_RANGE = {
  bsc: 500, base: 2000, mantle: 2000, eth: 2000, arb: 2000, poly: 2000, op: 2000, avax: 2000,
  hyperevm: 2000, ink: 2000, xlayer: 2000, plasma: 2000, robinhood: 2000,
};
const lzEndpointLower = (LZ_ENDPOINT_V2 || '').toLowerCase();
const lower = (v) => (v || '').toLowerCase();
const LZ_API = 'https://scan.layerzero-api.com/v1';
const LIMITS_TO_TRY = [100, 200];


function log(msg) {
  console.log(`[oftSearch] ${msg}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Один запит. Повертає КОНВЕРТ {ok, result, error} — щоб можна було відрізнити
// "вузол не відповів" від "вузол відповів, даних немає". Раніше і те, й інше
// давало null, через що помилка RPC тлумачилась як "контракту не існує".
async function rpcRaw(url, method, params, timeoutMs = 12000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    if (data.error) return { ok: false, error: String(data.error.message || data.error).slice(0, 80) };
    return { ok: true, result: data.result ?? null };
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e).slice(0, 80) };
  }
}

const isRateLimit = (err) => /429|rate limit|1015|too many|limit exceeded/i.test(String(err || ''));

// Запит із ротацією вузлів: помилка на одному — пробуємо наступний.
// preferUrl (напр. обраний для логів) ставиться першим.
// nullIsMiss=true — порожня відповідь означає "цей вузол не має даних"
// (напр. вузол без архівного індексу транзакцій), тож пробуємо наступний.
async function rpcOn(chain, method, params, preferUrl = null, nullIsMiss = false) {
  const urls = rpcUrlsFor(chain, preferUrl);
  let lastErr = 'no rpc';
  let sawEmpty = false;
  for (const url of urls) {
    let r = await rpcRaw(url, method, params);
    if (!r.ok && !isRateLimit(r.error)) {
      await sleep(200);
      r = await rpcRaw(url, method, params); // одна повторна спроба на цьому вузлі
    }
    if (r.ok) {
      if (!nullIsMiss || (r.result !== null && r.result !== undefined)) return r;
      sawEmpty = true;
      log(`[rpc] ${chain.key}/${method}: вузол без даних, пробую наступний`);
      continue;
    }
    lastErr = r.error;
  }
  if (nullIsMiss && sawEmpty) return { ok: true, result: null }; // даних справді немає
  return { ok: false, error: lastErr };
}

// Сумісність зі старим кодом: повертає result або null (null = будь-яка невдача).
// Використовувати ТІЛЬКИ там, де різниця "помилка vs немає даних" не важлива.
async function rpc(url, method, params) {
  const r = await rpcRaw(url, method, params);
  return r.ok ? r.result : null;
}

async function rpcCall(url, method, params) {
  return rpc(url, method, params);
}



export async function getTokenMeta(chain, token) {
  try {
    const call = async (data) => {
      const r = await rpcOn(chain, 'eth_call', [{ to: token, data }, 'latest']);
      return r.ok ? r.result : null;
    };
    const decodeStr = (hex) => {
      if (!hex || hex === '0x') return null;
      const data = hex.startsWith('0x') ? hex.slice(2) : hex;
      const offset = parseInt(data.slice(0, 64), 16) * 2;
      const len = parseInt(data.slice(offset, offset + 64), 16) * 2;
      return Buffer.from(data.slice(offset + 64, offset + 64 + len), 'hex').toString('utf8');
    };
    const decodeUint = (hex) => (hex && hex !== '0x' ? parseInt(hex.slice(2), 16) : null);
    const [decimalsHex, symbolHex, nameHex] = await Promise.all([call('0x313ce567'), call('0x95d89b41'), call('0x06fdde03')]);
    const symbol = decodeStr(symbolHex);
    const name = decodeStr(nameHex);
    if (!symbol && !name) return null;
    return { decimals: decodeUint(decimalsHex), symbol, name };
  } catch {
    return null;
  }
}

async function getReceipt(chain, txHash) {
  if (!txHash) return null;
  const r = await rpcOn(chain, 'eth_getTransactionReceipt', [txHash], null, true);
  return r.ok ? r.result : null;
}


function pickDstTxHash(msg) {
  return msg.dstTxHash || msg.dstTx?.txHash || msg.destination?.tx?.txHash || msg.destination?.txHash || null;
}

function findDstTokenFromReceipt(receipt) {
  if (!receipt?.logs?.length) return null;
  const mint = receipt.logs.find((l) => lower(l.topics?.[0]) === TRANSFER_TOPIC && lower(l.topics?.[1]) === ZERO_TOPIC);
  if (mint) return lower(mint.address);
  const transfer = receipt.logs.find((l) => lower(l.topics?.[0]) === TRANSFER_TOPIC);
  return transfer ? lower(transfer.address) : null;
}

async function lzScanAll(eid, address, targetDstEid = null) {
  const addr = lower(address);
  let allMsgs = [];
  let foundTarget = null;
  let prevCount = -1;

  for (const limit of LIMITS_TO_TRY) {
    const reqUrl = `${LZ_API}/messages/oapp/${eid}/${addr}?limit=${limit}`;
    log(`[lzScan] /oapp/${eid}/${addr.slice(0, 10)}... limit=${limit}`);

    const r = await lzFetchJson(reqUrl);
    if (!r.ok) { log(`[lzScan] недоступно після повторів: ${r.error}`); break; }
    if (r.status === 404) { log('[lzScan] 404 not found'); break; }
    if (r.status === 422) { log('[lzScan] 422 limit not supported'); break; }

    const msgs = r.data;
    allMsgs = msgs;

    const dsts = [...new Set(msgs.map((m) => m.pathway?.dstEid || m.dstEid).filter(Boolean))];
    log(`[lzScan] limit=${limit}: got=${msgs.length} dsts=[${dsts}]`);

    if (targetDstEid) {
      const hit = msgs.find((m) => {
        const d = m.pathway?.dstEid || m.dstEid;
        const s = m.status?.name || m.status || '';
        return d === targetDstEid && s === 'DELIVERED';
      });
      if (hit) {
        foundTarget = hit;
        log(`[lzScan] HIT dstEid=${targetDstEid} at limit=${limit}`);
        break;
      }
    }

    if (msgs.length < limit) {
      log(`[lzScan] got ${msgs.length} < ${limit} — all records retrieved`);
      break;
    }

    if (msgs.length === prevCount) {
      log(`[lzScan] API cap at ${msgs.length}`);
      break;
    }
    prevCount = msgs.length;
  }

  return { allMsgs, foundTarget };
}

// ── v3 helpers (lzScanOapp1, lzScanByTx, pickOftFromLzMsg, findOftViaTransferAndLzScan) ──

// Запит до LayerZero API з повторами. Відрізняє ДОСТОВІРНЕ "немає" (404) від
// "не вдалося запитати" (мережа/5xx/ліміт) — інакше збій API читався як
// "токен не OFT" чи "маршруту немає".
async function lzFetchJson(url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      // 404 і 422 — остаточні відповіді, повторювати немає сенсу
      if (res.status === 404 || res.status === 422) return { ok: true, data: [], status: res.status };
      if (res.status === 200) {
        const body = await res.json();
        return { ok: true, data: body?.data || [], status: 200 };
      }
      if (i < attempts - 1) { await sleep(400 * (i + 1)); continue; }
      return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    } catch (e) {
      if (i < attempts - 1) { await sleep(400 * (i + 1)); continue; }
      return { ok: false, error: String(e?.message || e).slice(0, 60) };
    }
  }
  return { ok: false, error: 'unknown' };
}

// Повертає { ok, msgs }: ok=false означає "не вдалося дізнатись", а НЕ "немає".
async function lzScanOapp1(eid, address) {
  const r = await lzFetchJson(`${LZ_API}/messages/oapp/${eid}/${lower(address)}?limit=1`);
  if (!r.ok) log(`[lzScanOapp1] недоступно: ${r.error}`);
  return { ok: r.ok, msgs: r.ok ? r.data : [] };
}

// Чи бріджиться цей контракт через LayerZero V1? У V1 ідентифікатор мережі
// без префікса 30000 (ethereum 101, bsc 102, avalanche 106, arbitrum 110).
// V1 — інший ендпоінт, інший інтерфейс, немає peers(); ми підтримуємо V2.
// Дешева перевірка: один запит до API замість сотень запитів глибокого скану.
export async function isLayerZeroV1(eidV2, address) {
  const eidV1 = Number(eidV2) - 30000;
  if (eidV1 <= 0) return false;
  const r = await lzFetchJson(`${LZ_API}/messages/oapp/${eidV1}/${lower(address)}?limit=1`);
  return r.ok && Array.isArray(r.data) && r.data.length > 0;
}

async function lzScanByTx(txHash) {
  try {
    const res = await fetch(layerZeroTxUrl(txHash), { headers: { Accept: 'application/json' } });
    if (res.status !== 200) return null;
    const body = await res.json();
    return body?.data?.[0] || null;
  } catch {
    return null;
  }
}

function pickOftFromLzMsg(lzMsg, chainEid) {
  if (!lzMsg?.pathway) return null;
  const srcEid = Number(lzMsg.pathway.srcEid);
  const dstEid = Number(lzMsg.pathway.dstEid);
  if (srcEid === chainEid) return lower(lzMsg.pathway.sender?.address);
  if (dstEid === chainEid) return lower(lzMsg.pathway.receiver?.address);
  return null;
}

// Розмір діапазону eth_getLogs для пошуку OFT. Base перевірено на 10k (773 Transfer
// + 577 OFT-подій на діапазон — далеко до лімітів). Для строгих RPC є авто-ділення.
const SCAN_CHUNK = { default: 10000 };
// Глибина пошуку. BSC має ~0.75s блоки, тож потребує більше діапазонів,
// щоб покрити ту саму кількість днів (200 x 3000 = 600k блоків).
const SCAN_MAX_CHUNKS_BY_CHAIN = { bsc: 200, avax: 200, default: 100 };
// 5 діапазонів × 2 запити = 10 одночасних звернень — публічні вузли на це
// відповідають 429, і скан отримував тихі дірки. 3 — безпечний компроміс.
const SCAN_PARALLEL = 3;

// Один діапазон: беремо транзи токена і події OFT у ТОМУ Ж діапазоні та перетинаємо
// їх за txHash. Збіг => log.address і є OFT/адаптером. Без перебору транзакцій,
// працює і для lock/unlock, і для burn/mint адаптерів.
// Обираємо вузол, який реально віддає ГЛИБОКІ логи. Багато безкоштовних BSC-нод
// або взагалі не дають eth_getLogs ("limit exceeded"), або лише ~10k останніх
// блоків ("Archive requests require a personal token"). Пробуємо діапазон на
// глибині 60k блоків — так відсіюємо неархівні вузли одразу.
// Кандидати вузлів для логів: спершу свої з .env (LOGS_RPC_<CHAIN>, напр.
// LOGS_RPC_BSC), потім список із chains.js, і завжди основний RPC мережі як запасний.
// У LOGS_RPC_<CHAIN> можна вказати кілька вузлів через кому — вони пробуються
// по черзі у вказаному порядку (перший = основний, решта = запасні).
function logsCandidates(chain) {
  const envUrls = String(process.env[`LOGS_RPC_${chain.key.toUpperCase()}`] || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const list = Array.isArray(chain.logsRpc) ? [...chain.logsRpc] : (chain.logsRpc ? [chain.logsRpc] : []);
  for (const u of chainRpcUrls(chain)) if (!list.includes(u)) list.push(u);
  return [...envUrls, ...list.filter((u) => !envUrls.includes(u))];
}

// Усі вузли мережі для звичайних викликів (getCode, blockNumber, eth_call).
function rpcUrlsFor(chain, preferUrl = null) {
  const list = chainRpcUrls(chain);
  if (preferUrl && !list.includes(preferUrl)) list.unshift(preferUrl);
  else if (preferUrl) return [preferUrl, ...list.filter((u) => u !== preferUrl)];
  return list;
}

const pickedLogsUrl = new Map(); // chain.key -> обраний вузол (на час роботи процесу)

async function pickLogsUrl(chain, token, latest) {
  const urls = logsCandidates(chain);
  if (urls.length === 1) return urls[0]; // один варіант — нічого не перевіряємо
  const cached = pickedLogsUrl.get(chain.key);
  if (cached) return cached;
  const to = Math.max(1, latest - 60000);
  const from = Math.max(0, to - 999);
  for (const u of urls) {
    const res = await rpc(u, 'eth_getLogs', [{
      fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16),
      address: token, topics: [TRANSFER_TOPIC],
    }]);
    if (Array.isArray(res)) {
      log(`findOFT: deep-logs RPC for ${chain.key} = ${u}`);
      pickedLogsUrl.set(chain.key, u);
      return u;
    }
  }
  log(`findOFT: no RPC with deep logs for ${chain.key}, using ${urls[0]}`);
  return urls[0];
}

// Ознака "вузол відмовив", а не "збігів немає". Раніше обидва випадки давали
// null, тому пошук не міг відрізнити мертвий вузол від чесно порожнього
// діапазону і тихо здавався. Тепер відмова видно нагору → можна перемкнути вузол.
export const RPC_FAIL = Symbol('rpc-fail');

async function scanChunkForOft(chain, token, from, to, logsUrl, depth = 0) {
  const hex = (n) => '0x' + n.toString(16);

  const transfers = await rpc(logsUrl, 'eth_getLogs', [{
    fromBlock: hex(from), toBlock: hex(to), address: token, topics: [TRANSFER_TOPIC],
  }]);

  // RPC відмовив (завеликий діапазон/ліміт) → ділимо навпіл, новішу половину першою.
  if (transfers === null) {
    if (depth >= 2 || to - from < 400) return RPC_FAIL;
    const mid = Math.floor((from + to) / 2);
    const a = await scanChunkForOft(chain, token, mid + 1, to, logsUrl, depth + 1);
    if (a && a !== RPC_FAIL) return a;
    const b = await scanChunkForOft(chain, token, from, mid, logsUrl, depth + 1);
    if (b && b !== RPC_FAIL) return b;
    // жодної знахідки; якщо хоч одна половина впала — це відмова вузла
    return (a === RPC_FAIL || b === RPC_FAIL) ? RPC_FAIL : null;
  }
  if (!Array.isArray(transfers) || transfers.length === 0) return null;
  const txs = new Set(transfers.map((l) => l.transactionHash));

  // Основний шлях: події OFTSent/OFTReceived по всьому чейну в цьому ж діапазоні.
  const oftLogs = await rpc(logsUrl, 'eth_getLogs', [{
    fromBlock: hex(from), toBlock: hex(to), topics: [[OFT_SENT_TOPIC, OFT_RECEIVED_TOPIC]],
  }]);
  if (Array.isArray(oftLogs)) {
    for (const l of oftLogs) {
      if (!txs.has(l.transactionHash)) continue;
      const oft = lower(l.address);
      if (!oft || oft === lzEndpointLower || oft === token) continue;
      // Перевірка від ХИБНОГО збігу: в агрегаторних транзакціях (своп кількох
      // токенів + бридж одного) OFT може належати ІНШОМУ токену. Приймаємо лише
      // якщо token() цього OFT = наш токен (або token() відсутній — не перевірити).
      const underlying = lower(await getOftTokenAddress(oft, chain.rpc));
      if (!underlying || underlying === token) return { oft, proofTx: l.transactionHash };
      log(`findOFT: skip ${oft.slice(0, 10)} — wraps ${underlying.slice(0, 10)}, not our token`);
    }
    return null; // topic-запит підтримується, збігів у цьому діапазоні нема
  }

  // Фолбек: RPC не дозволяє запит без address → йдемо через LZ Endpoint + receipt.
  const epLogs = await rpc(logsUrl, 'eth_getLogs', [{
    fromBlock: hex(from), toBlock: hex(to), address: lzEndpointLower,
  }]);
  if (!Array.isArray(epLogs)) return null;
  const bridgeTxs = [...new Set(epLogs.map((l) => l.transactionHash))].filter((h) => txs.has(h)).slice(0, 5);
  for (const txHash of bridgeTxs) {
    const receipt = await getReceipt(chain, txHash);
    const oftLog = receipt?.logs?.find((l) => {
      const t0 = lower(l.topics?.[0]);
      return t0 === OFT_SENT_TOPIC || t0 === OFT_RECEIVED_TOPIC;
    });
    const oft = lower(oftLog?.address);
    if (!oft || oft === lzEndpointLower || oft === token) continue;
    const underlying = lower(await getOftTokenAddress(oft, chain.rpc));
    if (!underlying || underlying === token) return { oft, proofTx: txHash };
    log(`findOFT: skip ${oft.slice(0, 10)} — wraps ${underlying.slice(0, 10)}, not our token`);
  }
  return null;
}

async function findOftViaTransferAndLzScan(tokenAddress, chain) {
  const token = lower(tokenAddress);

  // Перевірка існування контракту. ВАЖЛИВО: якщо вузол не відповів — це НЕ
  // означає "контракту немає". Раніше помилка 429 давала хибне
  // "does not exist on <chain>" і пошук здавався, хоча токен існував.
  const codeRes = await rpcOn(chain, 'eth_getCode', [token, 'latest']);
  if (codeRes.ok) {
    const code = codeRes.result;
    if (!code || code === '0x' || code === '0x0') {
      log(`findOFT: contract ${token.slice(0, 10)} does not exist on ${chain.key} — abort`);
      return null;
    }
  } else {
    log(`findOFT: eth_getCode failed on ${chain.key} (${codeRes.error}) — існування не перевірено, продовжую`);
  }

  const blockRes = await rpcOn(chain, 'eth_blockNumber', []);
  if (!blockRes.ok || !blockRes.result) {
    log(`findOFT: blockNumber failed on ${chain.key} (${blockRes.error || 'empty'}) — усі вузли недоступні`);
    return null;
  }
  const blockHex = blockRes.result;
  const latest = parseInt(blockHex, 16);
  const chunk = SCAN_CHUNK[chain.key] || SCAN_CHUNK.default;
  const maxChunks = SCAN_MAX_CHUNKS_BY_CHAIN[chain.key] || SCAN_MAX_CHUNKS_BY_CHAIN.default;
  let logsUrl = await pickLogsUrl(chain, token, latest);
  log(`findOFT: ${chain.key} scanning up to ${maxChunks * chunk} blocks newest-first (chunk=${chunk})`);

  // Вузол може пройти коротку пробу, але здохнути на реальному навантаженні
  // (сотні запитів по 10k блоків підряд → 429 або відмова на діапазоні).
  // Тому рахуємо повністю провалені батчі й перемикаємось на наступний вузол,
  // продовжуючи з того самого місця.
  const triedUrls = new Set([logsUrl]);
  let failStreak = 0;

  // Паралельні батчі, від найновіших блоків; рання зупинка при першій знахідці.
  for (let i = 0; i < maxChunks; i += SCAN_PARALLEL) {
    const batch = [];
    for (let k = 0; k < SCAN_PARALLEL && i + k < maxChunks; k++) {
      const to = latest - (i + k) * chunk;
      if (to <= 0) break;
      const from = Math.max(0, to - chunk + 1);
      batch.push(scanChunkForOft(chain, token, from, to, logsUrl));
    }
    if (batch.length === 0) break;
    const results = await Promise.all(batch);
    const hit = results.find((r) => r && r !== RPC_FAIL && r.oft);
    if (hit) {
      log(`findOFT: OFT=${hit.oft} via LZ-event match tx=${(hit.proofTx || '').slice(0, 12)}`);
      return hit;
    }

    // Батч провалився ЦІЛКОМ → підозра на мертвий вузол. Один батч може впасти
    // випадково, тому реагуємо лише на два поспіль.
    if (results.every((r) => r === RPC_FAIL)) {
      if (++failStreak >= 2) {
        const next = logsCandidates(chain).find((u) => !triedUrls.has(u));
        if (!next) {
          log(`findOFT: ${chain.key} — усі вузли відмовляють, скан припинено`);
          break;
        }
        log(`findOFT: ${chain.key} node failing → switching to ${next}`);
        triedUrls.add(next);
        logsUrl = next;
        pickedLogsUrl.set(chain.key, next); // щоб наступні пошуки не брали мертвий
        failStreak = 0;
        i -= SCAN_PARALLEL; // повторити цей самий діапазон на новому вузлі
      }
    } else {
      failStreak = 0;
    }
  }

  log(`findOFT: no LayerZero bridge tx for this token on ${chain.key} in scanned range`);
  return null;
}

function extractMsgAddrs(msg) {
  return {
    srcOft: msg.pathway?.sender?.address || msg.srcUaAddress || '',
    dstOft: msg.pathway?.receiver?.address || msg.dstUaAddress || '',
    srcTx: msg.source?.tx?.txHash || msg.srcTxHash || '',
    dstTx: msg.destination?.tx?.txHash || msg.dstTxHash || '',
  };
}

function filterDelivered(msgs, dstEid) {
  return msgs.filter((m) => {
    const d = m.pathway?.dstEid || m.dstEid;
    const s = m.status?.name || m.status || '';
    return d === dstEid && s === 'DELIVERED';
  });
}

async function tryQuoteSend() {
  return null;
}

function decodeLayout(input) {
  if (!input || input.length < 74) return null;
  const selector = input.slice(2, 10);
  const pointer = parseInt(input.slice(10, 74), 16);
  const nativeFee = BigInt('0x' + input.slice(74, 138)).toString();
  return { selector, pointer, nativeFee };
}

export async function resolveOft(tokenAddress, chain) {
  const token = lower(tokenAddress);
  log(`resolveOft chain=${chain.key} token=${token}`);

  // Кеш: адаптер для токена не змінюється, а його пошук — найдорожча операція
  // (сотні запитів eth_getLogs). Кешуємо ЛИШЕ успіх: якщо не знайшли через
  // тимчасовий збій вузла, повторна спроба має бути справжньою.
  const cacheKey = `${chain.key}:${token}`;
  const cached = oftCache.get(cacheKey);
  if (cached) {
    log(`resolveOft: cache hit ${chain.key} → ${cached.oft}`);
    return cached;
  }

  // KROK 1: precheck — чи token сам є OFT?
  const pre = await lzScanOapp1(chain.eid, token);
  if (pre.ok && pre.msgs.length > 0) {
    log(`resolveOft: token IS OFT on ${chain.key}`);
    const res = { oft: token, tokenIsOft: true };
    oftCache.set(cacheKey, res);
    return res;
  }
  // API не відповів — це НЕ означає "не OFT". Перевіряємо ON-CHAIN:
  // якщо контракт має налаштованих peers(), він є LayerZero OApp.
  if (!pre.ok) {
    const peers = await getOftPeers(chain, token);
    if (peers.length > 0) {
      log(`resolveOft: LZ API недоступний, але peers() підтверджує — token IS OFT on ${chain.key}`);
      const res = { oft: token, tokenIsOft: true };
      oftCache.set(cacheKey, res);
      return res;
    }
  }

  // KROK 1.5: перш ніж запускати ГЛИБОКИЙ СКАН (сотні запитів, хвилини) —
  // одна дешева перевірка на LayerZero V1. Робиться лише тоді, коли API
  // відповів і сказав «це не V2 OApp» (pre.ok && порожньо). Якщо токен мігрував
  // з V1 на V2, KROK 1 зловив би його раніше і сюди ми не дійшли б.
  if (pre.ok && await isLayerZeroV1(chain.eid, token)) {
    log(`resolveOft: ${token.slice(0, 10)} використовує LayerZero V1 на ${chain.key} — скан не потрібен`);
    return { v1: true };
  }

  // KROK 2: token != OFT — шукаємо через Transfer logs + lzScanByTx + OFT*Topic
  const found = await findOftViaTransferAndLzScan(token, chain);
  if (found?.oft) {
    log(`resolveOft: found OFT via tx-scan on ${chain.key}: ${found.oft} (proofTx=${found.proofTx})`);
    const res = { oft: found.oft, tokenIsOft: false };
    oftCache.set(cacheKey, res);
    return res;
  }

  log(`resolveOft: NOT FOUND on ${chain.key}`);
  return null;
}
export async function getRoutesFromOft(chain, oftContract) {
  const { allMsgs } = await lzScanAll(chain.eid, oftContract);
  return allMsgs;
}

export async function findBridgeParams(tokenAddress, fromChain, toChain, dstOft = null, srcOftHint = null) {
  // Якщо OFT вихідної мережі вже відомий (збережений токен / ручний ввід) —
  // не скануємо логи взагалі.
  let srcOft;
  if (srcOftHint && lower(srcOftHint) !== lower(tokenAddress)) {
    srcOft = lower(srcOftHint);
    log(`findBridgeParams: using known srcOft=${srcOft} (no scan)`);
  } else {
    const resolved = await resolveOft(tokenAddress, fromChain);
    if (resolved?.v1) return { ok: false, isV1: true, error: 'LayerZero V1 token' };
    if (!resolved) return { ok: false, error: `OFT not found on ${fromChain.key}` };
    srcOft = resolved.oft;
  }

  // FORWARD: пошук з боку srcOft (стандартний шлях)
  // ВАЖЛИВО: повертаємо ВСІ delivered msgs (не тільки foundTarget), щоб findLayout міг
  // спробувати декодувати кілька — деякі OFT мають кастомні selectors які можуть бути
  // у різних tx серед delivered.
  const { allMsgs, foundTarget } = await lzScanAll(fromChain.eid, srcOft, toChain.eid);
  let delivered = filterDelivered(allMsgs, toChain.eid);
  if (foundTarget && !delivered.find((m) => m.source?.tx?.txHash === foundTarget.source?.tx?.txHash)) {
    delivered = [foundTarget, ...delivered];
  }
  let foundVia = 'forward';

  // REVERSE: forward порожній і знаємо dstOft -> питаємо з боку рідкісного чейну.
  // НЕ передаємо targetDstEid (він би шукав outbound dst->src, а нам потрібен
  // inbound src->dst). Фільтруємо вручну за srcEid+dstEid+sender.
  if (delivered.length === 0 && dstOft) {
    log(`findBridgeParams: forward empty, trying reverse from ${toChain.key}/${dstOft.slice(0,12)}`);
    const reverse = await lzScanAll(toChain.eid, dstOft);
    const matched = (reverse.allMsgs || []).filter((m) => {
      const srcEid = Number(m.pathway?.srcEid || m.srcEid || 0);
      const dstEid = Number(m.pathway?.dstEid || m.dstEid || 0);
      const sender = lower(m.pathway?.sender?.address);
      const status = m.status?.name || m.status || '';
      return srcEid === fromChain.eid &&
             dstEid === toChain.eid &&
             sender === lower(srcOft) &&
             status === 'DELIVERED';
    });
    if (matched.length > 0) {
      delivered = matched;
      foundVia = 'reverse';
      log(`findBridgeParams: reverse found ${matched.length} delivered msgs`);
    } else {
      log(`findBridgeParams: reverse got ${reverse.allMsgs?.length || 0} msgs, none matched ${fromChain.eid}->${toChain.eid} sender=${srcOft.slice(0,10)}`);
    }
  }

  // PEERS: рідкісний маршрут може існувати БЕЗ жодної історії повідомлень.
  // Питаємо сам контракт: peers(dstEid) != 0 => маршрут налаштований.
  // Формат виклику send() не залежить від мережі призначення (змінюється лише
  // dstEid), тож layout беремо з будь-якої delivered-транзакції ЦЬОГО Ж OFT,
  // а комісію — з quoteSend() уже для потрібного dstEid.
  if (delivered.length === 0) {
    const peer = await getPeer(fromChain, srcOft, toChain.eid);
    if (peer) {
      // 3a) ГОЛОВНЕ: peers() дав контракт призначення -> запускаємо reverse.
      // Він знаходить РЕАЛЬНІ транзакції саме цього маршруту, тож layout буде
      // правильний (а не взятий з іншого напрямку).
      if (lower(dstOft || '') !== peer) {
        log(`findBridgeParams: peers() -> ${peer}, trying reverse from ${toChain.key}`);
        const rev = await lzScanAll(toChain.eid, peer);
        const matched = (rev.allMsgs || []).filter((m) => {
          const sEid = Number(m.pathway?.srcEid || m.srcEid || 0);
          const dEid = Number(m.pathway?.dstEid || m.dstEid || 0);
          const sender = lower(m.pathway?.sender?.address);
          const status = m.status?.name || m.status || '';
          return sEid === fromChain.eid && dEid === toChain.eid &&
                 sender === lower(srcOft) && status === 'DELIVERED';
        });
        if (matched.length > 0) {
          delivered = matched;
          foundVia = 'peers-reverse';
          log(`findBridgeParams: peers-reverse found ${matched.length} delivered msgs`);
        }
      }

      // 3b) Історії немає в жодному напрямку -> layout з будь-якої ВИХІДНОЇ
      // транзакції цього ж OFT (формат send() не залежить від призначення).
      if (delivered.length === 0) {
        const anyDelivered = (allMsgs || []).filter((m) => {
          const status = m.status?.name || m.status || '';
          const sEid = Number(m.pathway?.srcEid || m.srcEid || 0);
          return status === 'DELIVERED' && sEid === fromChain.eid && m.source?.tx?.txHash;
        });
        if (anyDelivered.length > 0) {
          delivered = anyDelivered;
          foundVia = 'peers';
          log(`findBridgeParams: no history for this route; layout from another destination (${anyDelivered.length} tx)`);
        } else {
          log(`findBridgeParams: peers() confirms ${toChain.key}, but no outbound tx of this OFT to learn layout`);
        }
      }
    } else {
      log(`findBridgeParams: peers(${toChain.eid}) empty on ${srcOft.slice(0, 10)} — route not configured`);
    }
  }

  if (delivered.length === 0) {
    return {
      ok: false,
      needsManualOft: true,  // завжди true — дозволяємо юзеру ввести txHash якщо dstOft не спрацював
      srcOft,                // ВАЖЛИВО: віддаємо знайдений адаптер навіть при невдачі —
                             // інакше find-params перевірятиме peers() на адресі токена,
                             // у якого цієї функції немає, і не побачить вимкнений напрямок
      error: `No delivered msgs ${fromChain.key}->${toChain.key}`,
    };
  }

  const { srcTx } = extractMsgAddrs(delivered[0]);
  const txRes = await rpcOn(fromChain, 'eth_getTransactionByHash', [srcTx], null, true);
  const txData = txRes.ok ? txRes.result : null;
  const layout = decodeLayout(txData?.input);
  if (!layout) return { ok: false, error: 'decode failed' };

  let nativeFee = layout.nativeFee;
  const quote = await tryQuoteSend(fromChain, srcOft, toChain.eid);
  if (quote?.ok) nativeFee = BigInt(quote.nativeFee);

  // Усі src-txHashes деліверед-повідомлень (для подальшого decode-fallback у findParams)
  const srcTxHashes = delivered.map((m) => m.source?.tx?.txHash).filter(Boolean);

  return {
    ok: true,
    oftContract: srcOft,
    selector: layout.selector,
    pointer: layout.pointer,
    nativeFee: nativeFee.toString(),
    dstEid: toChain.eid,
    srcTxHash: srcTx,
    srcTxHashes,
    foundVia,
  };
}

// Допоміжна функція: дізнатись чи OFT є адаптером (token() != OFT) чи token == OFT.
async function getOftTokenAddress(oftAddr, rpcUrl) {
  try {
    const result = await rpc(rpcUrl, 'eth_call', [{ to: oftAddr, data: TOKEN_SELECTOR }, 'latest']);
    if (!result || result === '0x' || result.length < 66) return null;
    const addr = '0x' + result.slice(26).toLowerCase();
    if (addr === '0x0000000000000000000000000000000000000000') return null;
    if (addr === lower(oftAddr)) return null; // OFT.token() returned itself - treat as token == OFT
    return addr;
  } catch {
    return null;
  }
}

// peers(uint32) — стандарт LayerZero V2 (OAppCore). Питаємо САМ контракт, з якими
// мережами він зʼєднаний. Дає повну й точну карту маршрутів незалежно від того,
// наскільки свіжа історія повідомлень у LZ Scan (де рідкісні маршрути витісняються).
const PEERS_SELECTOR = '0xbb0b6a53';

// Один peer. Публічні RPC глушать пачки запитів і повертають null — тому повтор.
export async function getPeer(chain, oftAddress, eid) {
  const data = PEERS_SELECTOR + eid.toString(16).padStart(64, '0');
  // rpcOn сам робить повтори і перехід на інший вузол
  const r = await rpcOn(chain, 'eth_call', [{ to: oftAddress, data }, 'latest']);
  if (!r.ok) return null; // не вдалося дізнатись — трактуємо як "невідомо"
  const res = r.result;
  if (!res || res === '0x' || /^0x0+$/.test(res)) return null;
  const peer = '0x' + res.slice(-40).toLowerCase();
  return peer === ZERO_ADDR ? null : peer;
}

// Те саме, але з ТРЬОМА станами. Для попередження про вимкнений напрямок
// критично відрізняти "peer порожній" (напрямок вимкнено проєктом) від
// "не вдалося дізнатись" (вузол мовчить або контракт не має peers() взагалі).
// getPeer() віддає null в обох випадках, тому для перевірки він не годиться.
export async function getPeerStatus(chain, oftAddress, eid) {
  const data = PEERS_SELECTOR + eid.toString(16).padStart(64, '0');
  const r = await rpcOn(chain, 'eth_call', [{ to: oftAddress, data }, 'latest']);
  if (!r.ok) return { state: 'unknown' };            // вузол не відповів / виклик впав
  const res = r.result;
  if (!res || res === '0x') return { state: 'unknown' }; // контракт без peers()
  if (/^0x0+$/.test(res)) return { state: 'unset' };     // peer явно порожній
  return { state: 'set', peer: '0x' + res.slice(-40).toLowerCase() };
}

export async function getOftPeers(chain, oftAddress) {
  const targets = Object.values(CHAINS).filter((c) => c?.eid && c.key !== chain.key);
  const CONC = 4; // 13 паралельних викликів публічний RPC ріже -> неповна карта
  const found = [];
  for (let i = 0; i < targets.length; i += CONC) {
    const res = await Promise.all(targets.slice(i, i + CONC).map(async (c) => {
      const peer = await getPeer(chain, oftAddress, c.eid);
      return peer ? { chain: c, peer } : null;
    }));
    for (const r of res) if (r) found.push(r);
  }
  return found;
}

export async function scanAllRoutes(sourceChain, tokenAddress, { noCache = false } = {}) {
  log(`scanAllRoutes chain=${sourceChain.key} token=${tokenAddress}`);

  // Кеш переліку мереж. Живе годину: перелік може змінитися, якщо проєкт
  // підключить нову мережу. noCache=true — примусове оновлення (кнопка
  // "оновити мережі" у збережених токенах).
  const cacheKey = `${sourceChain.key}:${lower(tokenAddress)}`;
  if (!noCache) {
    const cached = routesCache.get(cacheKey);
    if (cached) {
      log(`scanAllRoutes: cache hit → ${Object.keys(cached.chains || {}).join(',')}`);
      return cached;
    }
  }

  const resolved = await resolveOft(tokenAddress, sourceChain);
  if (resolved?.v1) {
    log('scanAllRoutes: токен на LayerZero V1 — не підтримується');
    return { v1: true };
  }
  if (!resolved) {
    log('scanAllRoutes: resolveOft returned null');
    return null;
  }

  const meta = await getTokenMeta(sourceChain, tokenAddress);
  const chains = {};

  // Source chain — додаємо одразу
  chains[sourceChain.key] = {
    tokenAddress: lower(tokenAddress),
    oftContract: resolved.oft,
    tokenIsOft: lower(resolved.oft) === lower(tokenAddress),
    source: 'input',
    foundTxHash: null,
    meta,
  };

  // BFS: на КОЖНОМУ знайденому контракті питаємо peers() (повна карта без історії),
  // і додатково дивимось історію LZ Scan — для нестандартних OFT без peers().
  // Мережі бувають зʼєднані не «зіркою»: напр. Base-адаптер знає лише BSC,
  // а вже BSC знає і Mantle — тому опитувати треба кожен вузол, не тільки вихідний.
  const queue = [{ chain: sourceChain, oft: resolved.oft }];
  const visitedOfts = new Set([lower(resolved.oft) + ':' + sourceChain.key]);
  const MAX_HOPS = 8;
  let hops = 0;

  while (queue.length > 0 && hops < MAX_HOPS) {
    hops++;
    const { chain: curChain, oft: curOft } = queue.shift();
    log(`scanAllRoutes BFS hop ${hops}: ${curChain.key}/${curOft.slice(0,10)}`);

    // A) peers() поточного контракту — основне джерело
    try {
      const peers = await getOftPeers(curChain, curOft);
      log(`  peers() -> ${peers.length} connected chain(s)`);
      for (const { chain: dstChain, peer } of peers) {
        const key = peer + ':' + dstChain.key;
        if (!chains[dstChain.key]) {
          const linkedToken = lower(await getOftTokenAddress(peer, dstChain.rpc));
          const dstToken = linkedToken || peer;
          chains[dstChain.key] = {
            tokenAddress: dstToken,
            oftContract: peer,
            tokenIsOft: dstToken === peer,
            source: 'peers',
            foundTxHash: null,
            meta,
          };
          log(`  + peers: ${dstChain.key} token=${dstToken.slice(0, 10)} oft=${peer.slice(0, 10)}`);
        }
        if (!visitedOfts.has(key)) {
          visitedOfts.add(key);
          queue.push({ chain: dstChain, oft: peer });
        }
      }
    } catch (e) {
      log(`  peers() failed: ${e.message}`);
    }

    const { allMsgs } = await lzScanAll(curChain.eid, curOft);
    log(`  got ${allMsgs?.length || 0} messages`);

    const byDst = new Map();
    for (const msg of allMsgs || []) {
      const dstEid = msg.pathway?.dstEid;
      if (!dstEid) continue;
      const status = msg.status?.name || msg.status || '';
      const existing = byDst.get(dstEid);
      if (!existing || (status === 'DELIVERED' && existing.status !== 'DELIVERED')) {
        byDst.set(dstEid, { msg, status });
      }
    }

    for (const [dstEid, { msg }] of byDst) {
      const dstChain = getChainByEid(dstEid);
      if (!dstChain) continue;
      if (chains[dstChain.key]) continue;

      const dstOft = lower(msg.pathway?.receiver?.address);
      if (!dstOft) continue;

      let dstToken = null;
      const dstTxHash = pickDstTxHash(msg);
      if (dstTxHash) {
        try {
          const receipt = await getReceipt(dstChain, dstTxHash);
          dstToken = findDstTokenFromReceipt(receipt);
        } catch (e) {
          log(`  receipt fetch failed for ${dstChain.key}: ${e.message}`);
        }
      }
      if (!dstToken) {
        const linkedToken = await getOftTokenAddress(dstOft, dstChain.rpc);
        dstToken = linkedToken || dstOft;
      }

      chains[dstChain.key] = {
        tokenAddress: dstToken,
        oftContract: dstOft,
        tokenIsOft: dstToken === dstOft,
        source: 'auto',
        foundTxHash: msg.source?.tx?.txHash || null,
        meta,
      };
      log(`  + added ${dstChain.key} token=${dstToken.slice(0,10)} oft=${dstOft.slice(0,10)} isOft=${dstToken === dstOft}`);

      const key = dstOft + ':' + dstChain.key;
      if (!visitedOfts.has(key)) {
        visitedOfts.add(key);
        queue.push({ chain: dstChain, oft: dstOft });
      }
    }
  }

  log(`scanAllRoutes done: ${Object.keys(chains).length} chains found in ${hops} hops`);
  const result = { chains, meta, srcOft: resolved.oft };
  // Кешуємо лише змістовний результат: порожній міг вийти через збій вузла.
  if (Object.keys(chains).length > 1) routesCache.set(cacheKey, result);
  return result;
}

export async function scanRoute(sourceChain, targetChain, tokenAddress) {
  log(`scanRoute ${sourceChain.key}->${targetChain.key} token=${tokenAddress}`);
  const params = await findBridgeParams(tokenAddress, sourceChain, targetChain);
  if (!params?.ok) return null;

  const meta = await getTokenMeta(sourceChain, tokenAddress);
  return {
    tokenAddress: tokenAddress.toLowerCase(),
    oftContract:  params.oftContract,
    tokenIsOft:   params.oftContract?.toLowerCase() === tokenAddress.toLowerCase(),
    source:       'main',
    foundTxHash:  params.srcTxHash,
    meta,
  };
}

export { lzScanAll, filterDelivered, extractMsgAddrs };
