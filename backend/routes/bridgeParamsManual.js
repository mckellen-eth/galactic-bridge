import express from 'express';
import { CHAINS } from '../lib/chains.js';
import { decodeLayout } from '../lib/decoder.js';
import { layerZeroTxUrl } from '../lib/explorer.js';
import { getTransaction, rpcCall } from '../lib/rpc.js';
import { encodeQuoteSend, decodeQuoteResult } from '../lib/decoder.js';
import { findBridgeParams } from '../lib/oftSearch.js';

const router = express.Router();
const lower = (v) => (v || '').toLowerCase();

const withBump = (value) => {
  const wei = BigInt(value || '0');
  if (wei === 0n) return '0';
  return (wei + wei / 50n).toString();
};

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

router.get('/', async (req, res) => {
  const fromChain = CHAINS[req.query.fromChain];
  const toChain = CHAINS[req.query.toChain];
  const tokenAddress = lower(req.query.token);
  const wallet = req.query.wallet || '0x000000000000000000000000000000000000dEaD';
  const dstOft = lower(req.query.dstOft);
  const txHash = lower(req.query.txHash);

  if (!fromChain || !toChain || !tokenAddress) {
    return res.status(400).json({ ok: false, error: 'Missing fromChain/toChain/token' });
  }
  if (!dstOft && !txHash) {
    return res.status(400).json({ ok: false, error: 'Provide dstOft or txHash' });
  }

  // Шлях A: txHash — найшвидший (1 запит до LZ Scan дає все)
  if (txHash) {
    console.log(`[manual] txHash path: ${txHash}`);
    const lzMsg = await lzScanByTx(txHash);
    if (!lzMsg) {
      return res.json({ ok: false, error: 'LZ Scan does not know this txHash' });
    }
    const srcEid = Number(lzMsg.pathway?.srcEid);
    const dstEid = Number(lzMsg.pathway?.dstEid);
    if (srcEid !== fromChain.eid || dstEid !== toChain.eid) {
      return res.json({
        ok: false,
        error: `txHash маршрут: src=${srcEid} dst=${dstEid}, очікувалось ${fromChain.eid}->${toChain.eid}`,
      });
    }

    const srcOft = lower(lzMsg.pathway?.sender?.address);
    const dstOftFromMsg = lower(lzMsg.pathway?.receiver?.address);
    const srcTx = lzMsg.source?.tx?.txHash;
    if (!srcOft || !srcTx) {
      return res.json({ ok: false, error: 'Incomplete LZ Scan response' });
    }

    let layout = null;
    try {
      const tx = await getTransaction(fromChain, srcTx);
      if (tx?.data) layout = decodeLayout(tx.data);
    } catch (e) {
      console.error('[manual] getTransaction error:', e.message);
    }
    if (!layout) {
      return res.json({ ok: false, error: 'Cannot decode tx layout' });
    }

    let nativeFee = withBump(layout.nativeFee);
    const quote = await tryQuote(fromChain, srcOft, toChain.eid, BigInt('1000000000000000000'), wallet);
    if (quote) nativeFee = quote.nativeFee;

    return res.json({
      ok: true,
      source: 'manual_tx',
      tokenAddress,
      oftContract: srcOft,
      tokenIsOft: srcOft === tokenAddress,
      selector: layout.selector,
      pointer: layout.pointer,
      dstEid: toChain.eid,
      nativeFee,
      lzTokenFee: quote?.lzTokenFee || '0',
      foundTxHash: srcTx,
      learnedDstOft: dstOftFromMsg,  // для збереження в customTokens
    });
  }

  // Шлях B: dstOft — звичайний reverse-search через findBridgeParams
  console.log(`[manual] dstOft path: ${dstOft}`);
  try {
    const bridge = await findBridgeParams(tokenAddress, fromChain, toChain, dstOft);
    if (!bridge?.ok) {
      return res.json({
        ok: false,
        error: bridge?.error || 'Reverse search failed even with provided dstOft',
      });
    }

    let nativeFee = withBump(bridge.nativeFee);
    const quote = await tryQuote(fromChain, bridge.oftContract, toChain.eid, BigInt('1000000000000000000'), wallet);
    if (quote) nativeFee = quote.nativeFee;

    return res.json({
      ok: true,
      source: bridge.foundVia === 'reverse' ? 'manual_dstOft_reverse' : 'manual_dstOft_forward',
      tokenAddress,
      oftContract: bridge.oftContract,
      tokenIsOft: bridge.oftContract === tokenAddress,
      selector: bridge.selector,
      pointer: bridge.pointer,
      dstEid: toChain.eid,
      nativeFee,
      lzTokenFee: quote?.lzTokenFee || '0',
      foundTxHash: bridge.srcTxHash,
      learnedDstOft: dstOft,
    });
  } catch (e) {
    console.error('[manual] error:', e.message);
    return res.json({ ok: false, error: e.message });
  }
});

export default router;
