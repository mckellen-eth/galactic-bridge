// Encoder копіює selector і pointer з реальної знайденої транзакції.
// Ніколи не хардкодить — це єдиний спосіб зробити міст універсальним.

const p = (v) => BigInt(v).toString(16).padStart(64, '0');
const pAddr = (a) => '000000000000000000000000' + a.toLowerCase().replace('0x', '');

export function encodeSendCalldata({ selector, pointer, dstEid, walletAddress, amountBN, nativeFee }) {
  const amount = BigInt(amountBN);
  const fee = BigInt(nativeFee);

  console.log('[encoder] selector:', selector, 'pointer:', pointer, 'amountBN:', amount.toString(), 'nativeFee:', fee.toString());

  const topLevel =
    p(pointer) +          // slot 0: pointer to sendParam (0x60 або 0x80)
    p(fee) +              // slot 1: nativeFee
    p(0n) +               // slot 2: lzTokenFee
    pAddr(walletAddress); // slot 3: refundAddress

  const sendParam =
    p(dstEid) +           // dstEid
    pAddr(walletAddress) + // to (bytes32)
    p(amount) +           // amountLD
    p(amount) +           // minAmountLD
    p(0xe0n) +            // offset extraOptions
    p(0x100n) +           // offset composeMsg
    p(0x120n) +           // offset oftCmd
    p(0n) +               // extraOptions len
    p(0n) +               // composeMsg len
    p(0n);                // oftCmd len

  return '0x' + selector + topLevel + sendParam;
}
