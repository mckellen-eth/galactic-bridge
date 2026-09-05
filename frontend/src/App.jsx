import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useSwitchChain, useSendTransaction, useWriteContract } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { CHAINS, CHAIN_LIST } from './lib/chains';
import { encodeSendCalldata } from './lib/encoder';
import { fmt, shortHash } from './lib/format';
import CustomTokenModal from './components/CustomTokenModal';
import RareRouteModal from './components/RareRouteModal';
import Footer from './components/Footer';

const lzScanUrl = 'https://layerzeroscan.com';
const explorerTxUrl = (chainKey, hash) => `${CHAINS[chainKey]?.explorerUrl}/tx/${hash}`;

// Мінімалістичне лого — орбіти (galactic) навколо ядра, у accent-кольорі.
function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <ellipse cx="16" cy="16" rx="13" ry="5.5" transform="rotate(30 16 16)" stroke="var(--accent)" strokeWidth="1.4" opacity="0.9" />
      <ellipse cx="16" cy="16" rx="13" ry="5.5" transform="rotate(-30 16 16)" stroke="var(--accent)" strokeWidth="1.4" opacity="0.5" />
      <circle cx="16" cy="16" r="3.2" fill="var(--accent)" />
    </svg>
  );
}

// Galactic — анімований фон: замідлений рух, орбіти обертаються (різні швидкості/
// напрями), пульс точок (twinkle), «дихання» нахилу дисків (scaleY на .tilt-*). Без ядра.
function BackgroundOrbitsAnimated2() {
  return (
    <div className="bg-layer" aria-hidden="true">
      <svg className="bg-orbits bg-orbits-anim2" viewBox="0 0 900 900" preserveAspectRatio="xMidYMid slice">
        <g stroke="var(--accent)" fill="none" strokeWidth="1" opacity="0.5">
          <g className="tilt-a"><ellipse className="orbit-a" cx="450" cy="450" rx="410" ry="150" /></g>
          <ellipse cx="450" cy="450" rx="300" ry="300" />
          <g className="tilt-c"><ellipse className="orbit-c" cx="450" cy="450" rx="430" ry="230" /></g>
          <g className="tilt-d"><ellipse className="orbit-d" cx="450" cy="450" rx="180" ry="380" /></g>
        </g>
        <g className="dots-a" fill="var(--accent)">
          <circle className="tw" cx="560" cy="250" r="4" opacity="0.85" />
          <circle className="tw" cx="330" cy="360" r="3" opacity="0.7" />
          <circle className="tw" cx="640" cy="560" r="3.5" opacity="0.8" />
        </g>
        <g className="dots-b" fill="var(--accent)">
          <circle className="tw" cx="250" cy="580" r="3" opacity="0.7" />
          <circle className="tw" cx="700" cy="360" r="2.5" opacity="0.65" />
          <circle className="tw" cx="410" cy="640" r="3.5" opacity="0.75" />
        </g>
        <g className="dots-c" fill="var(--accent)">
          <circle className="tw" cx="300" cy="250" r="2.5" opacity="0.6" />
          <circle className="tw" cx="620" cy="230" r="3" opacity="0.7" />
        </g>
      </svg>
    </div>
  );
}

// Анімовані зорі-мерехтіння для Starfield ✦ — ОКРЕМИЙ масив від статичних EDGE_STARS.
// [x%, y%, radius, durSec, delaySec] — різні розміри + різна швидкість пульсу.
// delaySec — РІЗНІ фази (застосовуються ЯК ВІД'ЄМНІ), щоб при вмиканні теми зорі не
// «спалахували» всі разом, а виглядали вже плавно-запущеними.
const TWINKLE_STARS = [
  [9, 20, 1.8, 4.2, 3.1], [15, 52, 1.2, 5.5, 0.7], [5, 70, 2.1, 3.6, 2.4], [26, 34, 1.4, 6, 4.8],
  [21, 78, 1.6, 4.8, 1.5], [12, 38, 1, 5, 3.9],
  [91, 22, 1.8, 4, 0.4], [85, 54, 1.3, 5.8, 5.1], [95, 72, 2, 3.8, 2.9], [74, 36, 1.5, 6.2, 1.2],
  [79, 80, 1.6, 4.6, 4.2], [88, 40, 1, 5.2, 2.0],
  [44, 10, 1.4, 5, 3.5], [57, 14, 1.7, 4.4, 0.9], [50, 88, 1.3, 5.6, 4.6],
];
// Starfield ✦ — статичні хмари+зорі (як у Starfield) + окремий анімований шар.
function StarfieldAnimated() {
  // Планувальник падінь: по одному за раз, пауза 8-15с (рідко 3-6с), чергуючи типи.
  const [flights, setFlights] = useState([]);
  useEffect(() => {
    const LANES = [
      { type: 'meteor', cls: 'm1', dur: 3600 }, { type: 'meteor', cls: 'm2', dur: 4000 }, { type: 'meteor', cls: 'm3', dur: 3800 },
      { type: 'star', cls: 's1', dur: 2100 }, { type: 'star', cls: 's2', dur: 2300 }, { type: 'star', cls: 's3', dur: 2000 },
      { type: 'star', cls: 's4', dur: 2200 }, { type: 'star', cls: 's5', dur: 2400 },
    ];
    const timers = new Set();
    let idc = 0, lastCls = null, lastType = null, cancelled = false;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const after = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); if (!cancelled) fn(); }, ms); timers.add(t); return t; };
    const pick = () => {
      let pool = LANES.filter((l) => l.cls !== lastCls);
      if (Math.random() < 0.7) { const opp = pool.filter((l) => l.type !== lastType); if (opp.length) pool = opp; }
      const lane = pool[Math.floor(Math.random() * pool.length)];
      lastCls = lane.cls; lastType = lane.type; return lane;
    };
    const launch = () => {
      const lane = pick();
      const id = ++idc;
      setFlights((f) => [...f, { id, type: lane.type, cls: lane.cls }]);
      after(lane.dur + 250, () => setFlights((f) => f.filter((x) => x.id !== id)));
      const gap = Math.random() < 0.15 ? rnd(12, 20) : rnd(30, 60);
      after(gap * 1000, launch);
    };
    after(rnd(1, 3) * 1000, launch);
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, []);
  return (
    <div className="bg-layer bg-stars-anim" aria-hidden="true">
      {/* Туманність — 3 шари з різними швидкостями дрейфу/обертання → форма плавно морфиться */}
      <div className="neb neb1" />
      <div className="neb neb2" />
      <div className="neb neb3" />
      <svg width="100%" height="100%" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="twGlow" x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Статичні зорі — ті самі що подобаються (не чіпаємо) */}
        <EdgeStars o={0.6} />
        <g fill="var(--accent)" opacity="0.5">
          <circle cx="18%" cy="34%" r="1.3" /><circle cx="12%" cy="48%" r="1" /><circle cx="24%" cy="40%" r="1.5" />
          <circle cx="82%" cy="62%" r="1.3" /><circle cx="88%" cy="50%" r="1" /><circle cx="78%" cy="70%" r="1.5" />
        </g>
        {/* Окремий анімований шар — мерехтливі зорі зі світінням */}
        <g className="tw-stars" fill="var(--accent)" filter="url(#twGlow)">
          {TWINKLE_STARS.map(([x, y, r, dur, delay], i) => (
            <circle key={i} cx={`${x}%`} cy={`${y}%`} r={r}
              style={{ animationDuration: `${dur}s`, animationDelay: `-${delay}s` }} />
          ))}
        </g>
        {/* Nova — 2 зорі що рідко яскраво спалахують */}
        <g className="nova-stars" fill="var(--accent)" filter="url(#twGlow)">
          <circle cx="28%" cy="22%" r="2.2" style={{ animationDelay: '2s' }} />
          <circle cx="72%" cy="82%" r="2.4" style={{ animationDelay: '9s' }} />
        </g>
      </svg>
      {/* Падіння за розкладом (JS): по одному, паузи 8-15с (рідко 3-6с), чергуючи типи.
          Вогняні метеори + малі далекі зорі (холодні тони, за метеорами). */}
      {flights.map((fl) => fl.type === 'meteor' ? (
        <span key={fl.id} className={`gb-meteor ${fl.cls} play`}><span className="tail" /><span className="tail2" /><span className="head" /></span>
      ) : (
        <span key={fl.id} className={`gb-star ${fl.cls} play`}><span className="strail" /><span className="shead" /></span>
      ))}
      {/* Метеоритні камені — ПЕРЕДНІЙ план, реалістичний сірий камінь, повільно пливуть */}
      <div className="gb-rock r1"><svg viewBox="0 0 100 100">
        <defs><radialGradient id="rockA" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#4c4f39" /><stop offset="55%" stopColor="#2b2d1f" /><stop offset="100%" stopColor="#131409" />
        </radialGradient></defs>
        <polygon points="50,5 66,9 80,20 90,40 86,62 74,82 54,92 34,88 16,74 8,52 12,28 28,12" fill="url(#rockA)" stroke="rgba(232,255,0,0.20)" strokeWidth="1" />
        <ellipse cx="42" cy="40" rx="11" ry="8" fill="#191a0f" opacity="0.7" />
        <ellipse cx="41" cy="38" rx="11" ry="8" fill="none" stroke="rgba(232,255,0,0.10)" strokeWidth="0.8" />
        <circle cx="66" cy="58" r="6" fill="#191a0f" opacity="0.6" />
        <circle cx="30" cy="62" r="3.5" fill="#191a0f" opacity="0.55" />
      </svg></div>
      <div className="gb-rock r2"><svg viewBox="0 0 100 100">
        <defs><radialGradient id="rockB" cx="60%" cy="36%" r="70%">
          <stop offset="0%" stopColor="#464934" /><stop offset="55%" stopColor="#27291c" /><stop offset="100%" stopColor="#121308" />
        </radialGradient></defs>
        <polygon points="50,8 68,12 84,26 88,48 80,70 62,86 40,88 22,74 12,52 16,30 32,14" fill="url(#rockB)" stroke="rgba(232,255,0,0.18)" strokeWidth="1" />
        <ellipse cx="58" cy="42" rx="9" ry="6" fill="#181910" opacity="0.65" />
        <circle cx="36" cy="60" r="4" fill="#181910" opacity="0.55" />
      </svg></div>
      <div className="gb-rock r3"><svg viewBox="0 0 100 100">
        <defs><radialGradient id="rockC" cx="42%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#43462f" /><stop offset="60%" stopColor="#25271a" /><stop offset="100%" stopColor="#111207" />
        </radialGradient></defs>
        <polygon points="50,10 72,20 84,44 76,70 50,88 26,74 16,48 26,22" fill="url(#rockC)" stroke="rgba(232,255,0,0.16)" strokeWidth="1" />
        <circle cx="46" cy="46" r="5" fill="#161710" opacity="0.55" />
      </svg></div>
    </div>
  );
}

// Зорі, зміщені до країв (не в центрі де картка, не в зоні футера).
const EDGE_STARS = [
  [6, 12, 1.5], [14, 26, 1], [4, 44, 1.2], [11, 60, 1.6], [20, 14, 0.9], [8, 76, 1],
  [24, 46, 1.1], [17, 82, 1.3], [28, 68, 0.9], [30, 30, 1.2],
  [94, 12, 1.5], [86, 26, 1], [96, 44, 1.2], [89, 60, 1.6], [80, 14, 0.9], [92, 76, 1],
  [76, 46, 1.1], [83, 80, 1.3], [72, 68, 0.9], [70, 30, 1.2],
  [40, 8, 1.1], [55, 12, 0.9], [48, 18, 1.4], [62, 6, 0.9], [45, 84, 1.1], [58, 82, 0.9],
];
function EdgeStars({ o = 0.5 }) {
  return (
    <g fill="var(--accent)">
      {EDGE_STARS.map(([x, y, r], i) => <circle key={i} cx={`${x}%`} cy={`${y}%`} r={r} opacity={o} />)}
    </g>
  );
}

// Перемикач теми — іконка, клік відкриває міні-меню з 3 темами.
const THEMES = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'galactic', label: 'Galactic' },
  { id: 'starfield', label: 'Starfield' },
];
function ThemeSwitcher({ theme, setTheme }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="theme-switch">
      <button type="button" className="icon-btn" title="Theme" onClick={() => setOpen((v) => !v)}>◐</button>
      {open && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="theme-menu">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-opt${theme === t.id ? ' active' : ''}`}
                onClick={() => { setTheme(t.id); setOpen(false); }}
              >
                {theme === t.id ? '● ' : '○ '}{t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChainSelect({ value, onChange, chains = CHAIN_LIST, placeholder = '— SELECT —', excludeKey = null }) {
  const visible = excludeKey ? chains.filter((c) => c.key !== excludeKey) : chains;
  return (
    <select className="select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {visible.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
    </select>
  );
}

// Безпечний fetch: якщо сервер повернув не-JSON (напр. таймаут nginx → HTML),
// даємо зрозуміле повідомлення замість "Unexpected token '<'".
async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    if (r.status === 504 || r.status === 502 || r.status >= 500) {
      throw new Error('Search took too long on the server. Please try again in a moment, or add the OFT contract manually.');
    }
    throw new Error(`Server returned an unexpected response (${r.status}).`);
  }
  return r.json();
}

function CopyButton({ value }) {
  const [done, setDone] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); };
  return <button className="copy" onClick={copy} title="Copy">{done ? '✓' : '⧉'}</button>;
}

function TxIcon({ status }) {
  const base = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (status === 'DELIVERED') {
    return <svg className="tx-ic" {...base} stroke="var(--green)"><path d="M5 12l5 5 10-10" /></svg>;
  }
  if (status === 'FAILED') {
    return <svg className="tx-ic" {...base} stroke="var(--red)"><path d="M18 6L6 18M6 6l12 12" /></svg>;
  }
  return <svg className="tx-ic tx-spin" {...base} stroke="var(--muted)"><path d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5-4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>;
}

function WalletButton() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  return isConnected
    ? <button className="btn btn-secondary wallet" onClick={() => open({ view: 'Account' })}>{shortHash(address)}</button>
    : <button className="btn wallet" onClick={() => open()}>CONNECT WALLET</button>;
}

export default function App() {
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const [fromChain, setFromChain] = useState('');
  const [toChain, setToChain] = useState('');
  const [token, setToken] = useState('');
  const [manualOft, setManualOft] = useState('');
  const [params, setParams] = useState(null);
  const [amount, setAmount] = useState('');
  const [toast, setToast] = useState('');
  const [paramsOpen, setParamsOpen] = useState(false);
  const [routeInfoOpen, setRouteInfoOpen] = useState(false);
  const balanceReq = useRef(0);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [status, setStatus] = useState(null);
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [debugData, setDebugData] = useState(null);
  const [error, setError] = useState('');
  const [needsManualOft, setNeedsManualOft] = useState(false);
  const [customToken, setCustomToken] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [customTokenOpen, setCustomTokenOpen] = useState(false);
  const [rareRouteOpen, setRareRouteOpen] = useState(false);
  const [bridging, setBridging] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('gb-theme');
    return ['minimal', 'galactic', 'starfield'].includes(saved) ? saved : 'minimal';
  });
  useEffect(() => { localStorage.setItem('gb-theme', theme); }, [theme]);

  const fromMeta = CHAINS[fromChain];
  const toMeta = CHAINS[toChain];
  const supportedChainKeys = customToken ? Object.keys(customToken.chains || {}) : Object.keys(CHAINS);
  const currentRoute = customToken?.chains?.[fromChain] || null;
  const activeTokenAddress = currentRoute?.tokenAddress || token;
  const activeOftContract = currentRoute?.oftContract || manualOft || token;
  const tokenIsOft = customToken ? !!currentRoute?.tokenIsOft : params?.tokenIsOft;
  const visibleChains = customToken ? CHAIN_LIST.filter((c) => supportedChainKeys.includes(c.key)) : CHAIN_LIST;

  const fetchBalance = () => {
    // Беремо реальний контракт активного fromChain (для saved customToken),
    // інакше — token з input (якщо це повна адреса).
    const tokenForFetch = customToken?.chains?.[fromChain]?.tokenAddress || token;
    const reqId = ++balanceReq.current;
    if (!isConnected || !tokenForFetch || tokenForFetch.length < 42 || !fromChain) {
      setBalance(null);
      setBalanceLoading(false);
      return;
    }
    setBalanceLoading(true);
    fetch(`/api/balance?chain=${fromChain}&token=${tokenForFetch}&wallet=${address}`)
      .then((r) => r.json())
      .then((j) => {
        if (reqId !== balanceReq.current) return; // застарілий запит — ігноруємо
        setBalance(j?.ok ? j : null);
      })
      .catch(() => { if (reqId === balanceReq.current) setBalance(null); })
      .finally(() => { if (reqId === balanceReq.current) setBalanceLoading(false); });
  };

  useEffect(() => { const t = setTimeout(fetchBalance, 250); return () => clearTimeout(t); }, [isConnected, token, address, fromChain, customToken]);
  useEffect(() => { const id = setInterval(fetchBalance, 30000); return () => clearInterval(id); }, [isConnected, token, address, fromChain, customToken]);

  useEffect(() => {
    if (!status?.poll) return;
    const id = setInterval(async () => {
      const j = await fetch(`/api/tx-status?txHash=${status.poll}`).then((r) => r.json());
      if (j.ok) setStatus((s) => ({ ...s, ...j }));
    }, 5000);
    return () => clearInterval(id);
  }, [status?.poll]);

  // Toast-нотифікація + рефетч балансу при завершенні bridge транзакції
  useEffect(() => {
    if (status?.status === 'DELIVERED') {
      setToast('Transaction successful');
      setTimeout(() => setToast(''), 4000);
      fetchBalance();
    } else if (status?.status === 'FAILED') {
      setToast('Transaction failed');
      setTimeout(() => setToast(''), 4000);
      fetchBalance();
    }
  }, [status?.status]);

  const search = async () => {
    if (!activeTokenAddress) return;
    if (!fromChain || !toChain) {
      setError('Please select both source and destination chains');
      return;
    }
    setLoading(true);
    setError('');
    setDebugData(null);
    setNeedsManualOft(false);
    setParams(null);  // очистити попередній результат при повторному пошуку
    try {
      const walletParam = address ? `&wallet=${address}` : '';
      // Якщо OFT вихідної мережі вже відомий (ручний ввід або збережений токен) —
      // передаємо його: бекенд шукає одразу за ним, без важкого сканування логів.
      const savedSrcOft = customToken?.chains?.[fromChain]?.oftContract;
      const knownSrcOft = [manualOft, savedSrcOft]
        .find((v) => v && v.toLowerCase() !== activeTokenAddress.toLowerCase());
      const manualOftParam = knownSrcOft ? `&oftContract=${knownSrcOft}` : '';
      // Якщо токен збережений як customToken і знаємо OFT на toChain — передаємо для reverse-search fallback
      const savedDstOft = customToken?.chains?.[toChain]?.oftContract;
      const dstOftParam = savedDstOft ? `&dstOft=${savedDstOft}` : '';
      const j = await fetchJson(`/api/find-params?fromChain=${fromChain}&toChain=${toChain}&token=${activeTokenAddress}${walletParam}${manualOftParam}${dstOftParam}`);
      if (!j.ok) {
        setError(j.error || 'Failed to find bridge parameters');
        setNeedsManualOft(!!j.needsManualOft);
        return;
      }
      setParams(j);
      setDebugData({ step: 'find-params', result: j });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const bridge = async () => {
    if (!params) return;
    if (!isConnected) return document.querySelector('.wallet')?.click();
    setError('');
    setBridging(true);
    try {
      if (currentChainId !== fromMeta.chainId) await switchChainAsync({ chainId: fromMeta.chainId });
      const decimals = balance?.decimals || 18;
      const normalized = (amount || '0').replace(',', '.');
      const [whole, frac = ''] = normalized.split('.');
      const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
      let amountWei = BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(fracPadded);

      // Balance check — уникаємо ERC20InsufficientBalance.
      // balance.balanceWei — точне значення з контракту (raw wei).
      const balanceWei = balance?.balanceWei != null ? BigInt(balance.balanceWei) : null;
      if (balanceWei !== null && amountWei > balanceWei) {
        setError(`Insufficient balance: you have ${balance?.balanceFormatted || '0'} ${balance?.symbol || ''}`);
        setBridging(false);
        return;
      }
      if (!params.tokenIsOft) {
        const ownerPadded = address.slice(2).toLowerCase().padStart(64, '0');
        const spenderPadded = params.oftContract.slice(2).toLowerCase().padStart(64, '0');
        const allowanceData = '0xdd62ed3e' + ownerPadded + spenderPadded;
        const allowanceRes = await fetch(`/api/rpc-call?chain=${fromChain}&to=${params.tokenAddress}&data=${allowanceData}`).then(r => r.json());
        const allowance = allowanceRes.ok ? BigInt(allowanceRes.result || '0x0') : 0n;

        if (allowance < amountWei) {
          setStatus({ status: 'APPROVING' });
          const ERC20_ABI = [
            { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
          ];
          await writeContractAsync({
            address: params.tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [params.oftContract, amountWei],
          });
          setStatus({ status: 'APPROVED' });
        }
      }
      setStatus({ status: 'PENDING' });

      const calldata = encodeSendCalldata({
        selector: params.selector,
        pointer: params.pointer,
        dstEid: params.dstEid,
        walletAddress: address,
        amountBN: amountWei,
        nativeFee: params.nativeFee || '0',
      });
      setDebugData((d) => ({
        ...d,
        calldata,
        calldataDecoded: {
          to: params.oftContract,
          selector: params.selector,
          pointer: params.pointer,
          value: params.nativeFee,
          dstEid: params.dstEid,
          recipient: address,
          amountWei: amountWei.toString(),
          nativeFee: params.nativeFee,
        },
      }));
      const hash = await sendTransactionAsync({ to: params.oftContract, data: calldata, value: BigInt(params.nativeFee || '0') });
      setTxHash(hash);
      setStatus({ status: 'INFLIGHT', poll: hash });
      // Оновити баланс одразу після відправлення tx (не чекати 30s інтервал)
      setTimeout(() => fetchBalance(), 2000);
      setTimeout(() => fetchBalance(), 8000);
    } catch (e) {
      const msg = e.message || '';
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('user denied')) {
        setToast('Transaction cancelled');
        setTimeout(() => setToast(''), 3000);
      } else {
        setError(msg);
      }
      setStatus(null);
    } finally {
      setBridging(false);
    }
  };

  const balanceText = balance ? `${fmt(balance.balanceFormatted, 4)} ${balance.symbol}` : '—';
  const feeText = params ? `${fmt(Number(params.nativeFee) / 1e18, 8)} ${fromMeta.nativeSym}` : '—';
  const sourceTxHref = params?.foundTxHash ? explorerTxUrl(fromChain, params.foundTxHash) : '';
  const customTokenName = customToken?.name || 'Custom Token';

  return (
    <div className={`shell theme-${theme}`}>
      {theme === 'galactic' && <BackgroundOrbitsAnimated2 />}
      {theme === 'starfield' && <StarfieldAnimated />}
      <header className="page-header">
        <div className="brand"><Logo /> <span>Galactic Bridge</span></div>
        <div className="header-right">
          <ThemeSwitcher theme={theme} setTheme={setTheme} />
          <WalletButton />
        </div>
      </header>

      <main className="page-main">
      <div className="stack">
      <div className="card">

        <div className="section">
          <div className="label">01 — ROUTE</div>
          <div className="row">
            <ChainSelect chains={visibleChains} value={fromChain} excludeKey={toChain} onChange={(v) => {
              setFromChain(v); setParams(null); setStatus(null); setDebugData(null); setNeedsManualOft(false); setError(''); setAmount('');
              // Контракт відображається у блоці "02 — ROUTE INFO" — поле TOKEN CONTRACT тримає тікер
            }} />
            <button className="swap" onClick={() => {
              const a = fromChain; setFromChain(toChain); setToChain(a);
              setParams(null); setStatus(null); setDebugData(null); setNeedsManualOft(false); setError(''); setAmount('');
              // НЕ підставляємо контракт — у полі TOKEN CONTRACT лишається тікер
            }}>⇄</button>
            <ChainSelect chains={visibleChains} value={toChain} excludeKey={fromChain} onChange={(v) => { setToChain(v); setParams(null); setStatus(null); setDebugData(null); setNeedsManualOft(false); setError(''); setAmount(''); }} />
          </div>
        </div>

        <div className="section">
          <div className="label">TOKEN CONTRACT</div>
          <div className="row">
            <input
              className="input"
              placeholder="0x... or ticker"
              value={token}
              onChange={(e) => {
                const v = e.target.value.trim();
                setParams(null); setStatus(null); setDebugData(null); setBalance(null); setNeedsManualOft(false); setError(''); setAmount('');
                // Auto-detect збереженого токена ТІЛЬКИ на повному збігу тікера або повному контракті.
                // На частковому вводі — просто оновлюємо поле без втручання.
                try {
                  const saved = JSON.parse(localStorage.getItem('lz-custom-tokens') || '{}');
                  const q = v.toLowerCase();
                  let exact = null;
                  for (const r of Object.values(saved)) {
                    // повний збіг тікера (case-insensitive)
                    if (r.meta?.symbol && r.meta.symbol.toLowerCase() === q) { exact = r; break; }
                    // повний контракт основного токена
                    if (r.tokenAddress === q) { exact = r; break; }
                    // повний контракт на будь-якому чейні (token або OFT)
                    for (const info of Object.values(r.chains || {})) {
                      if (info.tokenAddress?.toLowerCase() === q || info.oftContract?.toLowerCase() === q) {
                        exact = r;
                        break;
                      }
                    }
                    if (exact) break;
                  }
                  if (exact) {
                    // Замінюємо input на тікер у верхньому регістрі (або як юзер ввів якщо вже uppercase)
                    const ticker = exact.meta?.symbol || exact.name || v;
                    setToken(ticker.toUpperCase());
                    setCustomToken(exact);
                  } else {
                    setToken(v);
                    setCustomToken(null);
                  }
                } catch { setToken(v); setCustomToken(null); }
              }}
            />
            <button className="mini" onClick={() => setCustomTokenOpen(true)} title="Add custom token">+</button>
          </div>
          <div className="meta meta-row"><span className="meta-text">SYMBOL: {balance?.symbol || '—'} &nbsp; BALANCE: {balanceText}</span>{customToken && (
            <span className="saved-wrap"><svg className="saved-badge" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" title="Saved token"><path d="M6 2h12a2 2 0 0 1 2 2v17a1 1 0 0 1-1.55.83L12 18.2l-6.45 3.63A1 1 0 0 1 4 21V4a2 2 0 0 1 2-2z" /></svg></span>
          )}</div>
        </div>

        {scanError && <div className="meta" style={{ color: 'var(--red)', marginTop: 8 }}>{scanError}</div>}
        {error && !needsManualOft && <div className="meta" style={{ color: 'var(--red)', margin: '10px 0 14px' }}>{error}</div>}

        {customToken && fromChain && toChain && customToken.chains?.[fromChain] && !params && (
          <div className="section box params-box">
            <div className="label params-head" onClick={() => setRouteInfoOpen((o) => !o)}>
              <span>02 — ROUTE INFO</span>
              <svg className={`chev${routeInfoOpen ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </div>
            {routeInfoOpen && (
              <>
                <div className="line compact">From: {CHAINS[fromChain]?.name} → To: {CHAINS[toChain]?.name}</div>
                <div className="line compact">
                  Token: <span>{shortHash(customToken.chains[fromChain].tokenAddress)}</span>
                  <CopyButton value={customToken.chains[fromChain].tokenAddress} />
                </div>
                <div className="line compact">
                  OFT Contract: <span>{shortHash(customToken.chains[fromChain].oftContract)}</span>
                  <CopyButton value={customToken.chains[fromChain].oftContract} />
                </div>
              </>
            )}
          </div>
        )}

        <div className="row">
          <button className="btn btn-secondary" onClick={search} disabled={(!token && !customToken) || !fromChain || !toChain || loading}>
            {loading ? <><span className="spinner">↻</span> SEARCHING...</> : 'SEARCH LAYERZERO TRANSACTIONS →'}
          </button>
        </div>

        {needsManualOft && (
          <div className="section box">
            <div className="label" style={{ color: 'var(--red)' }}>BRIDGE ROUTE NOT FOUND</div>
            <div className="meta">Rare route — no bridge transactions in recent history.</div>
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn btn-primary" onClick={() => setRareRouteOpen(true)}>
                ENTER MANUALLY
              </button>
              <button className="mini" onClick={search} disabled={loading}>RETRY</button>
            </div>
          </div>
        )}

        {params && (
          <>
            <div className="section box params-box">
              <div className="label params-head" onClick={() => setParamsOpen((o) => !o)}>
                <span>02 — BRIDGE DETAILS</span>
                <svg className={`chev${paramsOpen ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </div>
              {paramsOpen && (
                <>
                  {!params.tokenIsOft && (
                    <>
                      <div className="line compact">Token: <span>{shortHash(params.tokenAddress)}</span> <CopyButton value={params.tokenAddress} /></div>
                      <div className="line compact">OFT Contract: <span>{shortHash(params.oftContract)}</span> <CopyButton value={params.oftContract} /></div>
                    </>
                  )}
                  {params.tokenIsOft && (
                    <div className="line compact">OFT Contract: <span>{shortHash(params.oftContract)}</span> <CopyButton value={params.oftContract} /></div>
                  )}
                  <div className="line compact">dstEid: {params.dstEid} — {toMeta.name}</div>
                  <div className="line compact">
                    Source TX:&nbsp;
                    {params.foundTxHash
                      ? <a href={sourceTxHref} target="_blank" rel="noreferrer">{shortHash(params.foundTxHash)} ↗</a>
                      : <span style={{ color: 'var(--red)' }}>not found</span>}
                  </div>
                </>
              )}
            </div>

            <div className="section">
              <div className="label">03 — AMOUNT</div>
              <div className="row">
                <input className="input" placeholder="1000.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className="mini" disabled={balanceLoading || !balance} onClick={() => {
                  const formatted = balance?.balanceFormatted || '0';
                  const [w, f = ''] = formatted.split('.');
                  setAmount(f ? `${w}.${f.slice(0, 6)}` : w);
                }}>{balanceLoading ? '…' : 'MAX'}</button>
              </div>
              <div className="meta">Balance: {balanceLoading ? 'loading…' : balanceText}</div>
              <div className="meta">Bridge fee: {feeText}</div>
              <div className="meta">You receive: ~{amount || '0'} {balance?.symbol || ''} on {toMeta.name}</div>
              <button className="btn btn-primary" onClick={bridge} disabled={!amount || amount === '0' || bridging}>
                {bridging ? <><span className="spinner">↻</span> BRIDGING...</> : 'BRIDGE →'}
              </button>
            </div>
          </>
        )}
      </div>

        {status?.status && (
          <div className="section box tx-status">
            <span className="tx-label">TX STATUS</span>
            <span className="tx-sep">·</span>
            <span className="tx-msg">
              <TxIcon status={status.status} />
              {status.status === 'APPROVING' && 'Approving token...'}
              {status.status === 'APPROVED' && 'Token approved — preparing bridge transaction...'}
              {status.status === 'PENDING' && 'Sending bridge transaction...'}
              {status.status === 'INFLIGHT' && 'Transaction sent, waiting for confirmation...'}
              {status.status === 'CONFIRMING' && 'Confirming on destination chain...'}
              {status.status === 'DELIVERED' && `Transaction successful — delivered to ${status.dstChainName || 'destination'}`}
              {status.status === 'FAILED' && 'Transaction failed on destination'}
              {!['APPROVING','APPROVED','PENDING','INFLIGHT','CONFIRMING','DELIVERED','FAILED'].includes(status.status) && `Status: ${status.status}`}
            </span>
            {status.poll && (
              <>
                <span className="tx-sep">·</span>
                <a className="tx-link" href={`${lzScanUrl}/tx/${status.poll}`} target="_blank" rel="noreferrer">LZScan ↗</a>
              </>
            )}
          </div>
        )}

      </div>
      </main>

      {toast && <div className="toast">{toast}</div>}

      <Footer />

      <CustomTokenModal
        open={customTokenOpen}
        onClose={() => setCustomTokenOpen(false)}
        fromChain={fromChain}
        onSelect={(record) => {
          setCustomToken(record);
          // Підставляємо тікер (а не контракт) — контракт показано в "02 — ROUTE INFO" нижче
          const ticker = record.meta?.symbol || record.name || record.tokenAddress;
          setToken(ticker.toUpperCase());
          // Скидаємо стан попереднього пошуку щоб старі дані не лишались видимими
          setParams(null);
          setStatus(null);
          setDebugData(null);
          setBalance(null);
          setNeedsManualOft(false);
          setError('');
          // Скидаємо fromChain/toChain якщо вони НЕ в нових supported chains
          // (попередній пошук міг бути на чейні якого нема у saved customToken)
          const supportedKeys = Object.keys(record.chains || {});
          if (fromChain && !supportedKeys.includes(fromChain)) setFromChain('');
          if (toChain && !supportedKeys.includes(toChain)) setToChain('');
        }}
      />

      <RareRouteModal
        open={rareRouteOpen}
        onClose={() => setRareRouteOpen(false)}
        fromChain={fromChain}
        toChain={toChain}
        token={activeTokenAddress}
        wallet={address}
        onResolved={(j) => {
          // Зберігаємо знайдені params напряму
          setParams(j);
          setNeedsManualOft(false);
          setError('');
          // Якщо backend повернув learnedDstOft — мерджимо в customToken
          if (j.learnedDstOft && customToken) {
            const next = {
              ...customToken,
              chains: {
                ...customToken.chains,
                [toChain]: {
                  ...(customToken.chains?.[toChain] || {}),
                  oftContract: j.learnedDstOft,
                  tokenAddress: customToken.chains?.[toChain]?.tokenAddress || j.learnedDstOft,
                  source: 'manual',
                },
              },
            };
            setCustomToken(next);
            try {
              const STORAGE_KEY = 'lz-custom-tokens';
              const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
              saved[customToken.tokenAddress] = next;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
            } catch {}
          }
        }}
      />
    </div>
  );
}
