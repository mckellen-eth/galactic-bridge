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

    let preferredChain = req.query.fromChain && CHAINS[req.query.fromChain];

    if (preferredChain) {
      const exists = await contractExists(preferredChain, token);
      if (!exists) {
        console.log(`[scan-token] contract not on ${preferredChain.key}, auto-detecting...`);
        preferredChain = null;
      }
    }

    let sourceChain = preferredChain;
    if (!sourceChain) {
      const found = await detectChains(token);
      console.log(`[scan-token] auto-detect found on chains: [${found.map(c => c.key).join(',')}]`);
      if (found.length === 0) {
        return res.json({
          ok: false,
          error: 'Contract not found on any supported chain',
          chains: {},
        });
      }
      sourceChain = found[0];
    }

    console.log('[scan-token] using sourceChain=', sourceChain.key);

    const result = await scanAllRoutes(sourceChain, token);
    if (!result || !Object.keys(result.chains || {}).length) {
      console.log('[scan-token] result chains=none');
      const meta = await getTokenMeta(sourceChain, token);
      return res.json({ ok: true, token, chains: {}, meta, detectedChain: sourceChain.key });
    }

    console.log('[scan-token] result chains=', Object.keys(result.chains).join(','));
    return res.json({
      ok: true,
      token,
      chains: result.chains,
      meta: result.meta,
      detectedChain: sourceChain.key,
    });
  } catch (error) {
    console.log('[scan-token] error=', error.message);
    return res.json({ ok: false, error: error.message });
  }
});

export default router;
