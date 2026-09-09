import React, { useEffect, useMemo, useState } from 'react';
import { CHAINS, CHAIN_LIST } from '../lib/chains';
import { fetchJson } from '../lib/fetchJson';

const STORAGE_KEY = 'lz-custom-tokens';
const normalize = (v) => (v || '').trim().toLowerCase();
const short = (v) => (v ? `${v.slice(0, 10)}...${v.slice(-4)}` : '');

function readSavedTokens() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function CopyBtn({ value, title = 'Copy' }) {
  const [done, setDone] = useState(false);
  const copy = () => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); };
  return <button type="button" className="copy" title={title} onClick={copy}>{done ? '✓' : '⧉'}</button>;
}

export default function CustomTokenModal({ open, onClose, onSelect, fromChain }) {
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('idle');
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState({});
  const [saved, setSaved] = useState(() => readSavedTokens());

  useEffect(() => {
    if (open) setSaved(readSavedTokens());
  }, [open]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [saved]);

  const cached = useMemo(() => saved[normalize(token)], [saved, token]);
  const activeChains = useMemo(() => {
    if (!results?.chains) return [];
    return Object.entries(results.chains).map(([chainKey, info]) => ({ chainKey, ...info }));
  }, [results]);

  const close = () => {
    setToken('');
    setName('');
    setStep('idle');
    setError('');
    setResults(null);
    setSelected({});
    onClose?.();
  };

  const search = async () => {
    const tokenAddress = normalize(token);
    if (!tokenAddress || tokenAddress.length < 42) return;
    setLoading(true);
    setError('');
    setStep('searching');
    setResults(null);
    try {
      const j = await fetchJson(`/api/scan-token?token=${tokenAddress}`);
      if (j.meta?.symbol || j.meta?.name) setName([j.meta?.symbol, j.meta?.name].filter(Boolean).join(' · '));
      if (!j.ok) {
        setError(j.error || 'Failed to scan token');
        setStep('idle');
        return;
      }
      setResults(j);
      const next = {};
      Object.keys(j.chains || {}).forEach((k) => { next[k] = true; });
      setSelected(next);
      setName(j.meta?.name || cached?.name || 'Custom Token');
      setStep('results');
    } catch (e) {
      setError(e.message);
      setStep('idle');
    } finally {
      setLoading(false);
    }
  };

  const addToken = () => {
    if (!results) return;
    const key = normalize(token);
    const picked = Object.fromEntries(Object.entries(results.chains || {}).filter(([chainKey]) => selected[chainKey]));
    if (!Object.keys(picked).length) return;
    const record = {
      tokenAddress: key,
      name: name.trim() || results?.meta?.symbol || results?.meta?.name || cached?.name || key.slice(0, 10),
      chains: picked,
      meta: results?.meta || cached?.meta || null,
    };
    setSaved((prev) => ({ ...prev, [key]: record }));
    onSelect?.(record);
    close();
  };

  const deleteToken = (key) => {
    setSaved((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const chooseSaved = (record) => { onSelect?.(record); close(); };

  const findSavedByAnyAddress = (addr) => {
    const a = normalize(addr);
    if (!a) return null;
    if (saved[a]) return saved[a];
    for (const record of Object.values(saved)) {
      for (const info of Object.values(record.chains || {})) {
        if (normalize(info.tokenAddress) === a || normalize(info.oftContract) === a) {
          return record;
        }
      }
    }
    return null;
  };

  const handleTokenChange = (val) => {
    const normalized = normalize(val);
    setToken(normalized);
    setError('');
    setResults(null);
    setSelected({});
    const existing = findSavedByAnyAddress(normalized);
    if (existing) {
      setName(existing.name || '');
      setResults({ chains: existing.chains, meta: existing.meta });
      const next = {};
      Object.keys(existing.chains || {}).forEach((k) => { next[k] = true; });
      setSelected(next);
      setStep('results');
    } else {
      setStep('idle');
      setName('');
    }
  };

  const savedList = Object.values(saved);
  const filteredSaved = useMemo(() => {
    const q = (token || '').trim().toLowerCase();
    if (!q) return savedList;
    return savedList.filter((r) => {
      if (r.tokenAddress?.includes(q)) return true;
      if (r.name?.toLowerCase().includes(q)) return true;
      if (r.meta?.symbol?.toLowerCase().includes(q)) return true;
      if (r.meta?.name?.toLowerCase().includes(q)) return true;
      for (const info of Object.values(r.chains || {})) {
        if (info.tokenAddress?.toLowerCase().includes(q)) return true;
        if (info.oftContract?.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [savedList, token]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">CUSTOM TOKEN</div>
          <button type="button" className="mini modal-close" onClick={close}>×</button>
        </div>

        <div className="section">
          <div className="label">TOKEN CONTRACT</div>
          <div className="row">
            <input
              className="input"
              placeholder="0x..."
              value={token}
              onChange={(e) => handleTokenChange(e.target.value)}
            />
            <button className="mini" onClick={search} disabled={loading || token.length < 42}>
              {loading ? <span className="spinner">↻</span> : 'SEARCH'}
            </button>
          </div>
          <div className="small-muted" style={{ marginTop: 8 }}>
            {cached?.name
              ? `Known: ${cached.name}`
              : results?.meta?.symbol
                ? `Found: ${results.meta.symbol} — ${results.meta.name}`
                : 'Search across all chains and save the networks you want to reuse.'}
          </div>
        </div>

        {savedList.length > 0 && (
          <div className="section">
            <div className="label">SAVED TOKENS{token && filteredSaved.length !== savedList.length ? ` (${filteredSaved.length}/${savedList.length})` : ''}</div>
            {filteredSaved.length === 0 && (
              <div className="small-muted">No saved tokens match "{token}"</div>
            )}
            {filteredSaved.map((item) => (
              <div key={item.tokenAddress} className="box" style={{ padding: 8, marginTop: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {item.meta?.symbol ? `${item.meta.symbol} · ` : ''}
                      {item.name && item.name !== 'Custom Token' ? item.name : short(item.tokenAddress)}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {Object.entries(item.chains || {}).map(([chainKey, info]) => (
                        <div key={chainKey} className="small-muted" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0', fontSize: 12 }}>
                          <span style={{ minWidth: 70 }}>{CHAINS[chainKey]?.name || chainKey}:</span>
                          <span>{short(info.tokenAddress)}</span>
                          <CopyBtn value={info.tokenAddress} title={`Copy ${CHAINS[chainKey]?.name} contract`} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <button type="button" className="mini token-act" title="Use this saved token" onClick={() => chooseSaved(item)}>USE</button>
                    <button type="button" className="mini token-act token-del" title="Delete saved token" onClick={() => deleteToken(item.tokenAddress)}>DEL</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 'searching' && (
          <div className="section box" style={{ textAlign: 'center' }}>
            <div className="label">SEARCHING TOKEN ACROSS ALL CHAINS...</div>
            <div className="small-muted">Please wait</div>
          </div>
        )}

        {error && <div className="meta" style={{ color: 'var(--red)' }}>{error}</div>}

        {results?.chains && step === 'results' && (
          <div className="section box">
            <div className="label">FOUND NETWORKS</div>
            {activeChains.length ? activeChains.map((entry) => {
              const chain = CHAINS[entry.chainKey];
              return (
                <div className="token-row" key={entry.chainKey}>
                  <div className="left">
                    <input
                      type="checkbox"
                      checked={!!selected[entry.chainKey]}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [entry.chainKey]: e.target.checked }))}
                    />
                    <div>
                      <div>{chain?.name || entry.chainKey}</div>
                      <div className="small-muted">{short(entry.tokenAddress)}</div>
                    </div>
                  </div>
                  <CopyBtn value={entry.tokenAddress} />
                </div>
              );
            }) : <div className="small-muted">No networks found.</div>}

            <ManualChainAdder
              existing={results?.chains || {}}
              onAdded={(chainKey, info) => {
                setResults((prev) => ({
                  ...prev,
                  chains: { ...(prev?.chains || {}), [chainKey]: info },
                }));
                setSelected((prev) => ({ ...prev, [chainKey]: true }));
              }}
            />
          </div>
        )}

        {results?.chains && step === 'results' && (
          <button className="btn btn-primary" onClick={addToken} style={{ marginTop: 12 }}>
            ADD CUSTOM TOKEN
          </button>
        )}
      </div>
    </div>
  );
}

function ManualChainAdder({ existing, onAdded }) {
  const [open, setOpen] = useState(false);
  const [chainKey, setChainKey] = useState('');
  const [oft, setOft] = useState('');
  const [tokenAddr, setTokenAddr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const availableChains = CHAIN_LIST.filter((c) => !existing[c.key]);

  useEffect(() => {
    if (!chainKey && availableChains.length > 0) setChainKey(availableChains[0].key);
  }, [availableChains, chainKey]);

  const verifyAndAdd = async () => {
    setErr('');
    const oftLower = (oft || '').trim().toLowerCase();
    if (!chainKey || !oftLower || oftLower.length < 42) {
      setErr('Select chain and enter valid OFT contract');
      return;
    }
    setBusy(true);
    try {
      const j = await fetchJson(`/api/verify-oft?chain=${chainKey}&oft=${oftLower}`);
      if (!j.ok || !j.verified) {
        setErr(j.error || 'OFT not verified');
        return;
      }
      const info = {
        tokenAddress: (tokenAddr || '').trim().toLowerCase() || oftLower,
        oftContract: oftLower,
        tokenIsOft: !tokenAddr || tokenAddr.trim().toLowerCase() === oftLower,
        source: 'manual',
        foundTxHash: null,
      };
      onAdded(chainKey, info);
      setOpen(false);
      setOft('');
      setTokenAddr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (availableChains.length === 0) return null;

  if (!open) {
    return (
      <button type="button" className="mini" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        + Add another chain
      </button>
    );
  }

  return (
    <div className="section" style={{ marginTop: 8, padding: 8, border: '1px dashed var(--border, #444)' }}>
      <div className="label">ADD CHAIN MANUALLY</div>
      <div className="row" style={{ gap: 6 }}>
        <select className="select" value={chainKey} onChange={(e) => setChainKey(e.target.value)}>
          {availableChains.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
      </div>
      <input
        className="input"
        style={{ marginTop: 6 }}
        placeholder="OFT contract 0x..."
        value={oft}
        onChange={(e) => setOft(e.target.value)}
      />
      <input
        className="input"
        style={{ marginTop: 6 }}
        placeholder="Token contract (optional, leave empty if token == OFT)"
        value={tokenAddr}
        onChange={(e) => setTokenAddr(e.target.value)}
      />
      {err && <div className="meta" style={{ color: 'var(--red)', marginTop: 6 }}>{err}</div>}
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        <button type="button" className="mini" title="Verify OFT and add to list" onClick={verifyAndAdd} disabled={busy}>
          {busy ? <><span className="spinner">↻</span> VERIFYING...</> : 'VERIFY & ADD'}
        </button>
        <button type="button" className="mini" title="Cancel" onClick={() => { setOpen(false); setErr(''); }}>
          CANCEL
        </button>
      </div>
    </div>
   );
}
