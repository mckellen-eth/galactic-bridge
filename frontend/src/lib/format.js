export const shortHash = (v) => (v ? `${v.slice(0, 10)}...${v.slice(-4)}` : '');
export const fmt = (v, d = 6) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: d });
