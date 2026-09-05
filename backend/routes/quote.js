import express from 'express';
import { CHAINS } from '../lib/chains.js';
import { rpcCall } from '../lib/rpc.js';
import { encodeQuoteSend, decodeQuoteResult } from '../lib/decoder.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const chain = CHAINS[req.query.chain];
    const oftContract = req.query.oftContract;
    const dstEid = Number(req.query.dstEid);
    const amountWei = BigInt(req.query.amountWei || '1000000000000000000');
    const wallet = req.query.wallet || '0x000000000000000000000000000000000000dEaD';
    if (!chain || !oftContract || !dstEid) return res.status(400).json({ ok: false, error: 'Missing params' });

    // Спробуємо спочатку з bool=false, потім з bytes='0x'
    for (const useBool of [true, false]) {
      try {
        const data = encodeQuoteSend(dstEid, wallet, amountWei, useBool);
        const result = await rpcCall(chain, oftContract, data);
        const decoded = decodeQuoteResult(result);
        if (decoded && BigInt(decoded.nativeFee) > 0n) {
          console.log(`[quote] success useBool=${useBool} nativeFee=${decoded.nativeFee}`);
          return res.json({ ok: true, nativeFee: decoded.nativeFee, lzTokenFee: decoded.lzTokenFee });
        }
      } catch (e) {
        console.log(`[quote] useBool=${useBool} failed:`, e.message);
      }
    }

    return res.json({ ok: false, error: 'quoteSend failed on both variants' });
  } catch (error) {
    return res.json({ ok: false, error: error.message });
  }
});

export default router;
