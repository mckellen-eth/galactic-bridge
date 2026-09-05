import express from 'express';
import { layerZeroTxUrl } from '../lib/explorer.js';
import { getChainByEid } from '../lib/chains.js';

const router = express.Router();
router.get('/', async (req, res) => {
  try {
    const txHash = req.query.txHash;
    if (!txHash) return res.status(400).json({ ok: false, error: 'Missing txHash' });
    const data = await fetch(layerZeroTxUrl(txHash)).then((r) => r.json());
    const msg = data.data?.[0] || {};
    const statusStr = msg.status?.name || msg.status || 'INFLIGHT';
    const dstChain = getChainByEid(msg.pathway?.dstEid)?.name || null;
    res.json({
      ok: true,
      status: statusStr,
      srcStatus: msg.source?.status?.name || msg.source?.status || null,
      dstStatus: msg.destination?.status?.name || msg.destination?.status || null,
      srcTxHash: msg.source?.tx?.txHash || msg.srcTxHash || txHash,
      dstTxHash: msg.destination?.tx?.txHash || msg.dstTxHash || null,
      dstChainName: dstChain,
    });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
});
export default router;
