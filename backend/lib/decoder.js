import { Interface } from 'ethers';

// selector 0xc7c7f5b3 = send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address)
const sendIface = new Interface([
  'function send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes) _sendParam, (uint256,uint256) _fee, address _refundAddress)',
]);

const quoteIfaceBool = new Interface([
  'function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes) _sendParam, bool _payInLzToken) view returns ((uint256 nativeFee, uint256 lzTokenFee))',
]);
const quoteIfaceBytes = new Interface([
  'function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes) _sendParam, bytes _extraOptions) view returns ((uint256 nativeFee, uint256 lzTokenFee))',
]);

export const SEND_SELECTORS = ['c7c7f5b3', '7cce660e', 'c7101b7a', '1f1e0efe', 'b731ef96', '571d3dc7'];

// Не валідуємо selector через whitelist — кожен OFT може мати кастомну send-функцію.
// Шукаємо dstEid у слотах 1..15 (LZ V2 eids у діапазоні 30100..30300).
// nativeFee завжди у slot[1] для send функцій LZ V2.
// expectedDstEid — eid саме цього повідомлення (з LZ Scan). Якщо переданий,
// шукаємо ТОЧНО його: це виключає хибні збіги. Якщо ні — беремо загальний
// діапазон EID V2. ВАЖЛИВО: діапазон мусить покривати нові мережі
// (ink 30339, hyperevm 30367, plasma 30383, robinhood 30416) — раніше стеля
// 30300 різала їх, і навіть стандартний layout c7c7f5b3 не декодувався.
export function decodeLayout(inputHex, expectedDstEid = null) {
  if (!inputHex || inputHex.length < 10 + 64) return null;
  const data = inputHex.startsWith('0x') ? inputHex.slice(2) : inputHex;
  const selector = data.slice(0, 8).toLowerCase();
  const payload = data.slice(8);
  const slot = (i) => payload.slice(i * 64, (i + 1) * 64);
  const pointer = parseInt(slot(0), 16);
  const want = expectedDstEid ? Number(expectedDstEid) : null;
  const isEid = (v) => (want ? v === want : (v >= 30100 && v <= 30999));

  // Стандартні layouts (швидкий шлях):
  if (pointer === 128 || pointer === 96) {
    const dstEidSlot = pointer === 128 ? 4 : 3;
    const dstEid = parseInt(slot(dstEidSlot), 16);
    if (isEid(dstEid)) {
      const nativeFee = BigInt('0x' + slot(1)).toString();
      return { selector, pointer, nativeFee, dstEid };
    }
  }

  // Fallback для нестандартних layouts: шукаємо dstEid у слотах 2..15.
  // Слот 1 ПРОПУСКАЄМО — там nativeFee. Якщо dstEid «знаходився» там само,
  // виходив сміттєвий layout, де nativeFee дорівнює dstEid.
  const maxSlots = Math.min(15, Math.floor(payload.length / 64));
  for (let i = 2; i < maxSlots; i++) {
    const v = parseInt(slot(i), 16);
    if (isEid(v)) {
      const nativeFee = BigInt('0x' + slot(1)).toString();
      if (nativeFee === String(v)) continue; // явне сміття: комісія == dstEid
      console.log(`[decodeLayout] selector 0x${selector} pointer=${pointer}: dstEid=${v} found at slot ${i}, nativeFee=${nativeFee}`);
      return { selector, pointer, nativeFee, dstEid: v };
    }
  }

  // Не знайшли очікуваний eid — пробуємо ще раз загальним діапазоном
  // (напр. коли layout беремо з транзакції іншого напрямку).
  if (want) return decodeLayout(inputHex, null);

  console.log(`[decodeLayout] failed to find dstEid (selector 0x${selector}, pointer=${pointer})`);
  return null;
}

export function decodeSendTx(input) {
  if (!input || input.length < 10) return null;
  const sel = input.slice(2, 10).toLowerCase();
  if (!SEND_SELECTORS.includes(sel)) return null;
  try {
    const normalized = '0xc7c7f5b3' + input.slice(10);
    const decoded = sendIface.decodeFunctionData('send', normalized);
    const sendParam = decoded[0];
    const fee = decoded[1];
    const dstEid = Number(sendParam[0]);
    if (dstEid < 30100 || dstEid > 30300) return null;
    return {
      dstEid,
      to: sendParam[1],
      amountLD: sendParam[2].toString(),
      minAmountLD: sendParam[3].toString(),
      nativeFee: fee[0].toString(),
      lzTokenFee: fee[1].toString(),
    };
  } catch {
    return null;
  }
}

export function encodeQuoteSend(dstEid, walletAddress, amountWei, useBool = true) {
  const to = `0x000000000000000000000000${walletAddress.slice(2).toLowerCase()}`;
  const sendParam = [dstEid, to, amountWei, amountWei, '0x', '0x', '0x'];
  if (useBool) {
    return quoteIfaceBool.encodeFunctionData('quoteSend', [sendParam, false]);
  }
  return quoteIfaceBytes.encodeFunctionData('quoteSend', [sendParam, '0x']);
}

export function decodeQuoteResult(data) {
  try {
    const result = quoteIfaceBool.decodeFunctionResult('quoteSend', data);
    const fee = result[0];
    return { nativeFee: fee[0].toString(), lzTokenFee: fee[1].toString() };
  } catch {
    return null;
  }
}
