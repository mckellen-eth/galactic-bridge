import React, { useState } from 'react';
import { fetchJson } from '../lib/fetchJson';

const normalize = (v) => (v || '').trim().toLowerCase();

export default function RareRouteModal({ open, onClose, onResolved, fromChain, toChain, token, wallet }) {
  const [mode, setMode] = useState('dstOft'); // 'dstOft' | 'txHash'
  const [dstOft, setDstOft] = useState('');
  const [txHash, setTxHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  const close = () => {
    setMode('dstOft');
    setDstOft('');
    setTxHash('');
    setErr('');
    onClose?.();
  };

  const apply = async () => {
    setErr('');
    const params = new URLSearchParams({
      fromChain,
      toChain,
      token,
    });
    if (wallet) params.set('wallet', wallet);

    if (mode === 'dstOft') {
      const v = normalize(dstOft);
      if (v.length < 42) { setErr('Enter valid OFT contract address (0x...)'); return; }
      params.set('dstOft', v);
    } else {
      const v = normalize(txHash);
      if (v.length < 66) { setErr('Enter valid txHash (0x... 32 bytes)'); return; }
      params.set('txHash', v);
    }

    setBusy(true);
    try {
      const j = await fetchJson(`/api/bridge-params-manual?${params.toString()}`);
      if (!j.ok) {
        setErr(j.error || 'Manual lookup failed');
        return;
      }
      onResolved?.(j);
      close();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">RARE ROUTE — {fromChain} → {toChain}</div>
          <button type="button" className="mini modal-close" onClick={close}>×</button>
        </div>

        <div className="section">
          <div className="small-muted">
            Bridge not found in recent messages. Provide one of:
          </div>

          <div className="row" style={{ marginTop: 12, gap: 6 }}>
            <button
              type="button"
              className="mini"
              style={{ borderColor: mode === 'dstOft' ? 'var(--accent)' : undefined }}
              onClick={() => { setMode('dstOft'); setErr(''); }}
            >
              OFT contract on {toChain}
            </button>
            <button
              type="button"
              className="mini"
              style={{ borderColor: mode === 'txHash' ? 'var(--accent)' : undefined }}
              onClick={() => { setMode('txHash'); setErr(''); }}
            >
              txHash of any bridge
            </button>
          </div>

          {mode === 'dstOft' && (
            <input
              className="input"
              style={{ marginTop: 8 }}
              placeholder="0x... (OFT contract address on destination chain)"
              value={dstOft}
              onChange={(e) => setDstOft(e.target.value)}
            />
          )}

          {mode === 'txHash' && (
            <input
              className="input"
              style={{ marginTop: 8 }}
              placeholder={`0x... (txHash of any ${fromChain}→${toChain} bridge)`}
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
            />
          )}

          {err && <div className="meta" style={{ color: 'var(--red)', marginTop: 8 }}>{err}</div>}

          <div className="row" style={{ marginTop: 12, gap: 6 }}>
            <button type="button" className="btn btn-primary" onClick={apply} disabled={busy}>
              {busy ? <><span className="spinner">↻</span> APPLYING...</> : 'APPLY'}
            </button>
            <button type="button" className="mini" onClick={close}>CANCEL</button>
          </div>
        </div>
      </div>
    </div>
  );
}
