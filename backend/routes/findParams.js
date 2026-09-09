import express from 'express';
import { CHAINS } from '../lib/chains.js';
import { decodeLayout } from '../lib/decoder.js';
import { layerZeroOAppUrl } from '../lib/explorer.js';
import { getTransaction, rpcCall } from '../lib/rpc.js';
import { encodeQuoteSend, decodeQuoteResult } from '../lib/decoder.js';
import { findBridgeParams, getPeerStatus } from '../lib/oftSearch.js';

const router = express.Router();

const withBump = (value) => {
  const wei = BigInt(value || '0');
  if (wei === 0n) return '0';
  return (wei + wei / 50n).toString();
};

// Повертає всі DELIVERED повідомлення для даного OFT→dstEid
async function lzScanDelivered(eid, address, dstEid) {
  const url = layerZeroOAppUrl(eid, address, 100);
  console.log(`[find-params] LZ Scan: ${url}`);
  // Повтори: збій API не має тлумачитись як "маршруту немає".
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 404) return [];               // достовірно немає
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const msgs = d.data || [];
      const routes = [...new Set(msgs.map(m => `${m.pathway?.srcEid}->${m.pathway?.dstEid}[${m.status?.name}]`))];
      if (routes.length) console.log(`[find-params] routes:`, routes.join(', '));
      return msgs.filter(m => m.pathway?.dstEid === dstEid && m.status?.name === 'DELIVERED');
    } catch (e) {
      if (i < 2) { await new Promise((r) => setTimeout(r, 400 * (i + 1))); continue; }
      console.error(`[find-params] LZ Scan недоступний після 3 спроб:`, e.message);
      return [];
    }
  }
  return [];
}

// Чи бріджиться цей токен через LayerZero V1? У V1 eid мережі = eid_v2 - 30000
// (avalanche 106, optimism 111). Якщо там є повідомлення — токен на старому
// протоколі: інший ендпоінт, інша функція, немає peers(). Ми підтримуємо V2.
async function isLayerZeroV1(eidV2, address) {
  const eidV1 = Number(eidV2) - 30000;
  if (eidV1 <= 0) return false;
  try {
    const url = `https://scan.layerzero-api.com/v1/messages/oapp/${eidV1}/${address.toLowerCase()}?limit=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status !== 200) return false;
    const body = await res.json();
    return (body?.data || []).length > 0;
  } catch {
    return false;
  }
}

// Пояснює, ЧОМУ не вийшло: контракт може бути LayerZero-застосунком, але не OFT
// (має peers, шле повідомлення, але без token()/quoteSend() — власний інтерфейс).
async function notAnOftMessage(chain, oftContract) {
  try {
    const isOft = await rpcCall(chain, oftContract, '0xfc0c546a').then(() => true).catch(() => false);
    if (!isOft) {
      return 'This contract is a LayerZero application, but not a standard OFT token. '
           + 'Galactic Bridge works with OFT tokens.';
    }
  } catch {}
  return 'Found a bridge transaction, but its call format is non-standard and could not be decoded.';
}

async function tryQuote(chain, oftContract, dstEid, amountWei, wallet) {
  for (const useBool of [true, false]) {
    try {
      const data = encodeQuoteSend(dstEid, wallet, amountWei, useBool);
      const result = await rpcCall(chain, oftContract, data);
      const decoded = decodeQuoteResult(result);
      if (decoded && BigInt(decoded.nativeFee) > 0n) return decoded;
    } catch {}
  }
  return null;
}

// Кеш layout по контракту: формат send() у конкретного OFT не змінюється, тож
// повторні пошуки не роблять десятки зайвих eth_getTransactionByHash
// (напр. base->bsc перебирав ~22 транзакції, поки не траплялась придатна).
const layoutCache = new Map(); // `${chainKey}:${oft}` -> { layout, srcTxHash }

async function findLayoutCached(chain, oftContract, messages, toEid, wallet) {
  const key = `${chain.key}:${(oftContract || '').toLowerCase()}`;
  const cached = layoutCache.get(key);
  if (cached) {
    // txHash беремо з поточного маршруту (точніше для показу), layout — з кешу
    const srcTxHash = messages.find((m) => m.source?.tx?.txHash)?.source?.tx?.txHash || cached.srcTxHash;
    console.log(`[find-params] layout from cache oft=${key} selector=${cached.layout.selector}`);
    return { layout: cached.layout, srcTxHash };
  }

  const res = await findLayout(chain, oftContract, messages);
  if (res.layout) {
    layoutCache.set(key, res);
    return res;
  }

  // Прямого прикладу немає (вся історія — через роутери). Але якщо контракт
  // відповідає стандарту LayerZero V2, транзакцію можна зібрати самим:
  // quoteSend() — це доказ, що інтерфейс стандартний.
  const q = await tryQuote(chain, oftContract, toEid, BigInt('1000000000000000000'), wallet);
  if (q) {
    console.log(`[find-params] прямого прикладу немає — беремо СТАНДАРТНИЙ інтерфейс V2 (quoteSend ok)`);
    return {
      layout: { selector: 'c7c7f5b3', pointer: 128, nativeFee: q.nativeFee },
      srcTxHash: messages.find((m) => m.source?.tx?.txHash)?.source?.tx?.txHash || null,
    };
  }
  console.log(`[find-params] ні прямого прикладу, ні відповіді quoteSend — контракт нестандартний`);
  return { layout: null, srcTxHash: null };
}

// Перебирає список повідомлень і повертає перший декодований layout.
// ВАЖЛИВО: беремо лише ПРЯМІ виклики OFT-контракту. Популярні токени часто
// бріджать через роутери (Stargate, LiFi, біржі) — у таких транзакціях
// calldata належить роутеру, а не OFT, і навчитись із неї неможливо.
async function findLayout(chain, oftContract, messages) {
  const oft = (oftContract || '').toLowerCase();
  for (const msg of messages) {
    const hash = msg.source?.tx?.txHash;
    if (!hash) continue;
    try {
      const tx = await getTransaction(chain, hash);
      if (oft && tx?.to && tx.to.toLowerCase() !== oft) {
        console.log(`[find-params] skip tx=${hash.slice(0, 14)} — виклик роутера ${tx.to.slice(0, 10)}, не OFT`);
        continue;
      }
      // Знаємо реальний dstEid цього повідомлення — шукаємо саме його в calldata
      const expectedDstEid = msg.pathway?.dstEid || msg.dstEid || null;
      const layout = tx?.data ? decodeLayout(tx.data, expectedDstEid) : null;
      if (layout) {
        console.log(`[find-params] layout found tx=${hash.slice(0,14)} selector=${layout.selector} pointer=${layout.pointer}`);
        return { layout, srcTxHash: hash };
      }
      console.log(`[find-params] skip tx=${hash.slice(0,14)} selector=${tx?.data?.slice(0,10)} (unknown layout)`);
    } catch (e) {
      console.error(`[find-params] getTransaction error:`, e.message);
    }
  }
  return { layout: null, srcTxHash: null };
}

router.get('/', async (req, res) => {
  const fromChain = CHAINS[req.query.fromChain];
  const toChain = CHAINS[req.query.toChain];
  const tokenAddress = req.query.token?.toLowerCase();
  const wallet = req.query.wallet || '0x000000000000000000000000000000000000dEaD';
  const manualOft = req.query.oftContract?.toLowerCase();
  const dstOft = req.query.dstOft?.toLowerCase();  // NEW: для reverse-search з saved customTokens

  if (!fromChain || !toChain || !tokenAddress) {
    return res.status(400).json({ ok: false, error: 'Missing params' });
  }

  let oftContract = null;
  let deliveredMsgs = [];
  let source = null;
  // Адаптер, знайдений під час пошуку, навіть якщо маршрут не склався.
  // Потрібен, щоб перевірити peers() саме на ньому, а не на адресі токена.
  let resolvedSrcOft = null;

  // STEP 1: ручний OFT (юзер ввів сам у RareRouteModal або CustomTokenModal)
  if (manualOft && manualOft !== tokenAddress) {
    console.log(`[find-params] STEP 1: manual OFT=${manualOft}`);
    const delivered = await lzScanDelivered(fromChain.eid, manualOft, toChain.eid);
    console.log(`[find-params] STEP 1: delivered=${delivered.length}`);
    if (delivered.length > 0) {
      oftContract = manualOft;
      deliveredMsgs = delivered;
      source = 'manual';
    }
  } else if (manualOft) {
    console.log('[find-params] STEP 1: ignoring manual OFT equal to token address');
  }

  // STEP 2: основний пошук — forward + auto-reverse через dstOft
  if (!oftContract) {
    console.log(`[find-params] STEP 2: bridge lookup ${fromChain.key}->${toChain.key}${dstOft ? ` dstOft=${dstOft.slice(0,12)}` : ''}`);
    try {
      const exactBridge = await findBridgeParams(tokenAddress, fromChain, toChain, dstOft, manualOft);
      // V1 визначився ще до глибокого скану — далі шукати нічого
      if (exactBridge?.isV1) {
        console.log('[find-params] токен використовує LayerZero V1 — не підтримується');
        return res.json({
          ok: false,
          isV1: true,
          error: 'This token bridges over LayerZero V1. Galactic Bridge supports LayerZero V2 contracts only.',
        });
      }
      if (exactBridge?.srcOft) resolvedSrcOft = exactBridge.srcOft;
      if (exactBridge?.ok) {
        oftContract = exactBridge.oftContract;
        source = exactBridge.foundVia || 'auto';
        // Передаємо ВСІ delivered txHashes — findLayout iterate через них поки не знайде
        // tx з відомим selector (для OFT з кастомним selector один tx може провалити decode,
        // інший — спрацювати).
        const hashes = exactBridge.srcTxHashes?.length
          ? exactBridge.srcTxHashes
          : [exactBridge.srcTxHash];
        deliveredMsgs = hashes.map((h) => ({
          source: { tx: { txHash: h } },
          pathway: { dstEid: exactBridge.dstEid },
        }));
        console.log(`[find-params] STEP 2: found via=${exactBridge.foundVia} oft=${oftContract} ${hashes.length} candidate tx(s)`);
      }
    } catch (e) {
      console.error(`[find-params] STEP 2 error:`, e.message);
    }
  }

  // STEP 3: token як OFT (попередній STEP 3)
  if (!oftContract) {
    console.log(`[find-params] STEP 3: token as OFT=${tokenAddress}`);
    const delivered = await lzScanDelivered(fromChain.eid, tokenAddress, toChain.eid);
    console.log(`[find-params] STEP 3: delivered=${delivered.length}`);
    if (delivered.length > 0) {
      oftContract = tokenAddress;
      deliveredMsgs = delivered;
      source = 'token_is_oft';
    }
  }

  // ПЕРЕВІРКА, ЧИ НАПРЯМОК УВІМКНЕНИЙ ЗАРАЗ.
  // Історія LayerZero доводить, що маршрут КОЛИСЬ працював, але не доводить,
  // що він працює сьогодні: проєкт може вимкнути напрямок, знявши peer
  // (типово після тестових транзакцій). Тоді quoteSend і send реверляться —
  // і користувач дізнається про це аж у гаманці, вже підписуючи.
  //
  // Робиться ДО перевірки на "нічого не знайшли", інакше при порожньому
  // oftContract людина отримає "введіть дані вручну" для напрямку, якого
  // не існує.
  //
  // Блокуємо ЛИШЕ коли контракт прямо відповів "peer порожній". Якщо peers()
  // не підтримується (нестандартний OFT) або вузол мовчить — стан 'unknown',
  // і ми не заважаємо.
  // Peer — ОДНОБІЧНИЙ. Те, що джерело знає призначення, не означає, що
  // призначення знає джерело. І це різні за наслідками випадки:
  //   • немає peer на ДЖЕРЕЛІ  → транзакція відхиляється одразу, кошти цілі;
  //   • немає peer на ПРИЗНАЧЕННІ → транзакція на джерелі ПРОХОДИТЬ, токени
  //     списуються, а доставка на тому боці відхиляється, і кошти висять
  //     у дорозі, доки хтось не налаштує peer.
  // Другий випадок небезпечніший, тому перевіряємо обидва боки.
  // Порядок важливий: адреса ТОКЕНА — останній варіант. Якщо міст іде через
  // окремий адаптер, у токена немає peers(), і перевірка мовчки не спрацює.
  const peerProbe = oftContract || manualOft || resolvedSrcOft || tokenAddress;
  const srcPeer = await getPeerStatus(fromChain, peerProbe, toChain.eid);

  if (srcPeer.state === 'unset') {
    console.log(`[find-params] напрямок вимкнено: peers(${toChain.eid}) порожній на ${peerProbe}`);
    return res.json({
      ok: false,
      routeDisabled: true,
      error: `${fromChain.name} → ${toChain.name} is currently disabled by the token's own contract. `
           + `The contract on ${fromChain.name} has no peer configured for ${toChain.name}, `
           + `so the transaction would be rejected on-chain. Try another destination network.`,
    });
  }

  // Адресу контракту призначення беремо з відповіді peers() джерела — вона
  // саме там і лежить. Тому перевірка другого боку працює і для НЕзбережених
  // токенів, де dstOft з фронтенду не приходить. Жодного зайвого запиту.
  const dstProbe = dstOft || srcPeer.peer;
  const dstPeer = dstProbe
    ? await getPeerStatus(toChain, dstProbe, fromChain.eid)
    : { state: 'unknown' };

  if (dstPeer.state === 'unset') {
    console.log(`[find-params] НЕБЕЗПЕЧНО: peers(${fromChain.eid}) порожній на ${dstProbe} (${toChain.key}) — доставка не пройде`);
    return res.json({
      ok: false,
      routeDisabled: true,
      unsafeDelivery: true,
      error: `${fromChain.name} → ${toChain.name} is not safe to use. The contract on ${toChain.name} `
           + `has no peer configured for ${fromChain.name}: the transaction on ${fromChain.name} would `
           + `succeed and your tokens would be sent, but delivery on ${toChain.name} would fail and the `
           + `tokens could stay stuck in transit. Blocked to protect your funds. Try another network.`,
    });
  }

  console.log(`[find-params] STEP 4: oftContract=${oftContract} msgs=${deliveredMsgs.length}`);
  if (!oftContract || deliveredMsgs.length === 0) {
    // Перевірка на LayerZero V1: у V1 ідентифікатори мереж без префікса 30000
    // (avalanche 106 замість 30106). V1 — інший ендпоінт і інший інтерфейс,
    // тож краще сказати про це прямо, ніж писати "маршрут не знайдено".
    if (await isLayerZeroV1(fromChain.eid, tokenAddress)) {
      console.log(`[find-params] STEP 4: токен використовує LayerZero V1 — не підтримується`);
      return res.json({
        ok: false,
        isV1: true,
        error: 'This token bridges over LayerZero V1. Galactic Bridge supports LayerZero V2 contracts only.',
      });
    }
    return res.json({
      ok: false,
      needsManualOft: true,
      error: 'No exact bridge route found for this pair. Provide the destination OFT contract or a sample bridge txHash manually.',
    });
  }

  if (source === 'manual') {
    const { layout, srcTxHash } = await findLayoutCached(fromChain, oftContract, deliveredMsgs, toChain.eid, wallet);

    if (!layout) {
      return res.json({
        ok: false,
        error: await notAnOftMessage(fromChain, oftContract),
      });
    }

    console.log(`[find-params] STEP 5: quote oftContract=${oftContract} dstEid=${toChain.eid}`);
    let nativeFee = withBump(layout.nativeFee);
    const quote = await tryQuote(fromChain, oftContract, toChain.eid, BigInt('1000000000000000000'), wallet);
    if (quote) {
      nativeFee = quote.nativeFee;
      console.log(`[find-params] STEP 5: quote nativeFee=${nativeFee}`);
    } else {
      console.log(`[find-params] STEP 5: quote failed, using decoded nativeFee=${nativeFee}`);
    }

    return res.json({
      ok: true,
      source,
      tokenAddress,
      oftContract,
      tokenIsOft: oftContract === tokenAddress,
      selector: layout.selector,
      pointer: layout.pointer,
      dstEid: toChain.eid,
      nativeFee,
      lzTokenFee: quote?.lzTokenFee || '0',
      foundTxHash: srcTxHash,
    });
  }

  const { layout, srcTxHash } = await findLayoutCached(fromChain, oftContract, deliveredMsgs, toChain.eid, wallet);

  if (!layout) {
    return res.json({
      ok: false,
      error: await notAnOftMessage(fromChain, oftContract),
    });
  }

  console.log(`[find-params] STEP 5: quote oftContract=${oftContract} dstEid=${toChain.eid}`);
  let nativeFee = withBump(layout.nativeFee);
  const quote = await tryQuote(fromChain, oftContract, toChain.eid, BigInt('1000000000000000000'), wallet);
  if (quote) {
    nativeFee = quote.nativeFee;
    console.log(`[find-params] STEP 5: quote nativeFee=${nativeFee}`);
  } else {
    console.log(`[find-params] STEP 5: quote failed, using decoded nativeFee=${nativeFee}`);
  }

  console.log(`[find-params] DONE: source=${source} oftContract=${oftContract} selector=${layout.selector} pointer=${layout.pointer} nativeFee=${nativeFee}`);

  return res.json({
    ok: true,
    source,
    tokenAddress,
    oftContract,
    tokenIsOft: oftContract === tokenAddress,
    selector: layout.selector,
    pointer: layout.pointer,
    dstEid: toChain.eid,
    nativeFee,
    lzTokenFee: quote?.lzTokenFee || '0',
    foundTxHash: srcTxHash,
  });

});

export default router;
