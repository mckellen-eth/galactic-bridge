import express from 'express';
import { CHAINS } from '../lib/chains.js';

const router = express.Router();
const LZ_API = 'https://scan.layerzero-api.com/v1';
const lower = (v) => (v || '').toLowerCase();

// Швидка перевірка чи адреса є OApp/OFT на даному чейні
async function lzScanOapp1(eid, address) {
  const reqUrl = `${LZ_API}/messages/oapp/${eid}/${lower(address)}?limit=1`;
  try {
    const res = await fetch(reqUrl, { headers: { Accept: 'application/json' } });
    if (res.status !== 200) return { ok: false, status: res.status };
    const body = await res.json();
    const msgs = body?.data || [];
    return { ok: true, msgs };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

router.get('/', async (req, res) => {
  const chainKey = req.query.chain;
  const oft = lower(req.query.oft);
  if (!chainKey || !oft) {
    return res.status(400).json({ ok: false, error: 'Missing chain or oft' });
  }
  const chain = CHAINS[chainKey];
  if (!chain) return res.status(400).json({ ok: false, error: `Unknown chain: ${chainKey}` });

  console.log(`[verify-oft] chain=${chainKey} oft=${oft}`);
  const result = await lzScanOapp1(chain.eid, oft);
  if (!result.ok) {
    return res.json({ ok: false, error: `LZ Scan error: ${result.error || result.status}` });
  }
  if (result.msgs.length === 0) {
    return res.json({
      ok: false,
      verified: false,
      error: `Address ${oft.slice(0, 10)}... has no LayerZero messages on ${chain.name}`,
    });
  }

  const sample = result.msgs[0];
  return res.json({
    ok: true,
    verified: true,
    chain: chainKey,
    oft,
    sample: {
      srcEid: sample.pathway?.srcEid,
      dstEid: sample.pathway?.dstEid,
      sender: sample.pathway?.sender?.address,
      receiver: sample.pathway?.receiver?.address,
    },
  });
});

export default router;
