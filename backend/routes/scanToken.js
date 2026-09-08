import express from 'express';
import { CHAINS, CHAIN_LIST } from '../lib/chains.js';
import { scanAllRoutes, getTokenMeta } from '../lib/oftSearch.js';

const router = express.Router();
const lower = (v) => (v || '').toLowerCase();

async function contractExists(chain, token) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(chain.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [token, 'latest'] }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    const code = data.result;
    return code && code !== '0x' && code !== '0x0';
  } catch {
    return false;
  }
}

async function detectChains(token) {
  const checks = await Promise.all(
    CHAIN_LIST.map(async (c) => ({ chain: c, exists: await contractExists(c, token) }))
  );
  return checks.filter((x) => x.exists).map((x) => x.chain);
}

router.get('/', async (req, res) => {
  try {
    console.log('[scan-token] query=', JSON.stringify(req.query));
    const token = lower(req.query.token);
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Missing token' });
    }

    // Кандидати-мережі, звідки стартувати пошук: спершу fromChain (якщо валідна),
    // далі всі мережі, де за адресою є контракт (auto-detect).
    const candidates = [];
    const seen = new Set();
    const addCand = (c) => { if (c && !seen.has(c.key)) { seen.add(c.key); candidates.push(c); } };

    const pref = req.query.fromChain && CHAINS[req.query.fromChain];
    if (pref && await contractExists(pref, token)) addCand(pref);

    const found = await detectChains(token);
    console.log(`[scan-token] auto-detect found on chains: [${found.map(c => c.key).join(',')}]`);
    found.forEach(addCand);

    if (candidates.length === 0) {
      return res.json({ ok: false, error: 'Contract not found on any supported chain', chains: {} });
    }

    // Впорядкування: спершу мережі, де адреса схожа на справжній токен (має symbol) —
    // так правильна мережа йде першою, а марний повний скан на мережі-колізії не робиться.
    let ordered = candidates;
    if (candidates.length > 1) {
      const likeness = await Promise.all(candidates.map(async (c) => {
        try { const m = await getTokenMeta(c, token); return !!(m && m.symbol); } catch { return false; }
      }));
      ordered = candidates
        .map((c, i) => ({ c, ok: likeness[i] }))
        .sort((a, b) => (b.ok ? 1 : 0) - (a.ok ? 1 : 0))
        .map((x) => x.c);
      console.log(`[scan-token] source order (token-like first): [${ordered.map(c => c.key).join(',')}]`);
    }

    // Пробуємо кожну мережу-джерело по черзі, доки не знайдуться маршрути.
    // Адреса токена може мати контракт на кількох мережах (колізія адрес),
    // тож не здаємось на першій невдачі, а доводимо пошук до кінця.
    // ?refresh=1 — примусово оминути кеш (кнопка "оновити мережі")
    const noCache = req.query.refresh === '1';
    let result = null, usedChain = null;
    for (const chain of ordered) {
      console.log('[scan-token] trying sourceChain=', chain.key);
      const r = await scanAllRoutes(chain, token, { noCache });
      if (r && Object.keys(r.chains || {}).length) { result = r; usedChain = chain; break; }
      console.log(`[scan-token] no routes from ${chain.key}, trying next…`);
    }

    if (!result) {
      const first = ordered[0];
      console.log('[scan-token] result chains=none');
      const meta = await getTokenMeta(first, token);
      return res.json({ ok: true, token, chains: {}, meta, detectedChain: first.key });
    }

    console.log('[scan-token] result chains=', Object.keys(result.chains).join(','));
    return res.json({
      ok: true,
      token,
      chains: result.chains,
      meta: result.meta,
      detectedChain: usedChain.key,
    });
  } catch (error) {
    console.log('[scan-token] error=', error.message);
    return res.json({ ok: false, error: error.message });
  }
});

export default router;
