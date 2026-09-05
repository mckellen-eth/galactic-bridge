export const LZ_ENDPOINT_V2 = '0x1a44076050125825900e736c501f859c50fE728c';
export const layerZeroMessagesUrl = (address) => `https://scan.layerzero-api.com/v1/messages/wallet/${address}?limit=50`;
// УВАГА: v1 REST API НЕ підтримує `dstChainKey` — повертає `code:4220 Unrecognized key`.
// Сайт layerzeroscan.com фільтрує клієнтсько. Тому dstEid тут ігнорується.
// Server-side фільтрація по маршруту неможлива через цей API — використовуємо reverse-search
// (див. findBridgeParams в oftSearch.js).
export const layerZeroOAppUrl = (eid, address, limit = 50, _dstEid = null) => {
  const url = new URL(`https://scan.layerzero-api.com/v1/messages/oapp/${eid}/${address}`);
  url.searchParams.set('limit', String(limit));
  return url.toString();
};
export const layerZeroMessagesListUrl = (filters, limit = 15, pageNumber = 0) => {
  const input = encodeURIComponent(JSON.stringify({ filters, limit, pageNumber }));
  return `https://layerzeroscan.com/api/trpc/messages.list?input=${input}`;
};
export const layerZeroTxUrl = (txHash) => `https://scan.layerzero-api.com/v1/messages/tx/${txHash}`;
