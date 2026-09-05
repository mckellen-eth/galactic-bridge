import express from 'express';
import { Interface, formatUnits } from 'ethers';
import { CHAINS } from '../lib/chains.js';
import { rpcCall } from '../lib/rpc.js';

const router = express.Router();
const erc20 = new Interface([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)'
]);

// Кеш незмінних метаданих токена (decimals/symbol/name) — щоб не тягнути їх щоразу.
const metaCache = new Map();
async function getMeta(chain, token) {
  const key = `${chain.key}:${token.toLowerCase()}`;
  if (metaCache.has(key)) return metaCache.get(key);
  const [decRaw, symRaw, nameRaw] = await Promise.all([
    rpcCall(chain, token, erc20.encodeFunctionData('decimals', [])),
    rpcCall(chain, token, erc20.encodeFunctionData('symbol', [])),
    rpcCall(chain, token, erc20.encodeFunctionData('name', [])),
  ]);
  const meta = {
    decimals: Number(erc20.decodeFunctionResult('decimals', decRaw)[0]),
    symbol: erc20.decodeFunctionResult('symbol', symRaw)[0],
    name: erc20.decodeFunctionResult('name', nameRaw)[0],
  };
  metaCache.set(key, meta);
  return meta;
}

router.get('/', async (req, res) => {
  try {
    const chain = CHAINS[req.query.chain];
    const token = req.query.token;
    const wallet = req.query.wallet;
    if (!chain || !token || !wallet) return res.status(400).json({ ok: false, error: 'Missing chain, token, or wallet' });
    const [balRaw, meta] = await Promise.all([
      rpcCall(chain, token, erc20.encodeFunctionData('balanceOf', [wallet])),
      getMeta(chain, token),
    ]);
    const balanceWei = BigInt(erc20.decodeFunctionResult('balanceOf', balRaw)[0]);
    return res.json({ ok: true, balanceWei: balanceWei.toString(), decimals: meta.decimals, symbol: meta.symbol, name: meta.name, balanceFormatted: formatUnits(balanceWei, meta.decimals) });
  } catch (error) {
    return res.json({ ok: false, error: error.message });
  }
});

export default router;
