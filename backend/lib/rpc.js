import { JsonRpcProvider, ethers } from 'ethers';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Список вузлів мережі: спершу свій з .env (RPC_<CHAIN>), далі chain.rpcs,
// далі основний chain.rpc. Публічні вузли часто ріжуть запити (429),
// тому потрібен не лише повтор, а й перехід на інший вузол.
// Порядок: RPC_<CHAIN> (примусовий вибір) → публічні з chains.js →
// RPC_FALLBACK_<CHAIN> (платний/ключовий запасний — використовується ЛИШЕ якщо
// публічні не впорались, щоб не витрачати ліміти даремно).
export function chainRpcUrls(chain) {
  const KEY = chain.key.toUpperCase();
  const primary = process.env[`RPC_${KEY}`];
  const fallback = process.env[`RPC_FALLBACK_${KEY}`];
  const list = [];
  if (primary) list.push(primary);
  if (Array.isArray(chain.rpcs)) for (const u of chain.rpcs) if (!list.includes(u)) list.push(u);
  if (chain.rpc && !list.includes(chain.rpc)) list.push(chain.rpc);
  if (fallback && !list.includes(fallback)) list.push(fallback);
  return list;
}

const providers = new Map(); // url -> JsonRpcProvider
// staticNetwork + явний chainId ОБОВ'ЯЗКОВІ: інакше ethers нескінченно
// повторює визначення мережі у фоні ("failed to detect network") для кожного
// недоступного вузла і засмічує логи.
function providerFor(url, chainId) {
  if (!providers.has(url)) {
    providers.set(url, new JsonRpcProvider(url, chainId, { staticNetwork: true }));
  }
  return providers.get(url);
}

// Сумісність зі старим кодом: провайдер основного вузла мережі.
export const getProvider = (chain) => providerFor(chainRpcUrls(chain)[0], chain.chainId);

// Виконує дію по черзі на кожному вузлі, доки не спрацює.
// Кидає останню помилку лише якщо не спрацював ЖОДЕН вузол.
// nullIsMiss=true — порожня відповідь означає "цей вузол не має даних", а не
// "даних не існує". Критично для getTransaction: вузли без архівного індексу
// (напр. publicnode) віддають null на старі транзакції, хоча вони існують.
async function withFallback(chain, label, fn, { nullIsMiss = false } = {}) {
  const urls = chainRpcUrls(chain);
  let lastErr;
  for (let i = 0; i < urls.length; i++) {
    let result;
    let gotResult = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await fn(providerFor(urls[i], chain.chainId));
        gotResult = true;
        break;
      } catch (e) {
        lastErr = e;
        const msg = String(e?.message || '');
        // 429 / rate limit -> одразу наступний вузол, повтор не допоможе
        if (/429|rate limit|1015|too many/i.test(msg)) break;
        if (attempt === 0) await sleep(250);
      }
    }
    if (gotResult) {
      if (!nullIsMiss || (result !== null && result !== undefined)) return result;
      console.log(`[rpc] ${chain.key}/${label}: ${urls[i]} не має даних, пробую наступний вузол`);
    } else if (i < urls.length - 1) {
      console.log(`[rpc] ${chain.key}/${label}: ${urls[i]} не відповів, пробую наступний`);
    }
  }
  if (nullIsMiss && !lastErr) return null; // усі вузли відповіли, але даних немає
  throw lastErr;
}

export async function rpcCall(chain, to, data) {
  return withFallback(chain, 'eth_call', (p) => p.call({ to, data }));
}

export async function getTransaction(chain, txHash) {
  return withFallback(chain, 'getTransaction', (p) => p.getTransaction(txHash), { nullIsMiss: true });
}

export const selector = (sig) => ethers.id(sig).slice(0, 10);
export const hexToBigInt = (hex) => BigInt(hex || '0x0');
