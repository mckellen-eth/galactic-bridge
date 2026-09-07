import React, { useState } from 'react';

const DONATE_EVM = '0x084a4bbd53d11a486f643201b448250839e0e000';
const TG_DEV = 'https://t.me/mckellen_eth';
const X_DEV = 'https://x.com/mckellen_eth';
const DOCS_URL = 'https://galactic-bridge.gitbook.io/galactic-bridge-docs/';

// Рік у копірайті — авто: до кінця 2026 показує "2026", далі діапазон "2026–поточний рік".
const YEAR_START = 2026;
const yearLabel = (() => {
  const now = new Date().getFullYear();
  return now > YEAR_START ? `${YEAR_START}–${now}` : String(YEAR_START);
})();

// Розділи футера — назви в одному стилі (білий текст + жовтий маркер ▸).
// Documentation — єдиний пункт-посилання (відкриває GitBook), решта відкривають модалку.
const SECTIONS = ['Why this bridge', 'How it works', 'Feedback', 'Donate', 'Disclaimer'];
const DOCS_AFTER = 'How it works'; // після якого пункту вставляємо посилання на доки

export default function Footer() {
  const [open, setOpen] = useState(null); // назва активного розділу або null
  const [copied, setCopied] = useState(false);

  const copyDonate = async () => {
    try {
      await navigator.clipboard.writeText(DONATE_EVM);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  const close = () => setOpen(null);

  return (
    <>
      <footer className="foot">
        <div className="foot-links">
          {SECTIONS.map((name) => (
            <React.Fragment key={name}>
              <button type="button" className="foot-link" onClick={() => setOpen(name)}>
                <span className="foot-mark">▸</span> {name}
              </button>
              {name === DOCS_AFTER && (
                <a className="foot-link foot-doc" href={DOCS_URL} target="_blank" rel="noreferrer">
                  <span className="foot-mark">▸</span> Documentation
                </a>
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="foot-copy">© {yearLabel} Galactic Bridge · Powered by LayerZero</div>
      </footer>

      {open && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="modal" style={{ width: 'min(560px, 100%)' }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{open.toUpperCase()}</div>
              <button type="button" className="mini modal-close" onClick={close}>×</button>
            </div>

            {open === 'Why this bridge' && (
              <div className="section">
                <p>
                  Galactic Bridge is a universal cross-chain bridge for LayerZero V2 OFT (Omnichain Fungible Token) tokens.
                  Bridge any OFT token between Ethereum, Base, BNB Chain and other supported EVM networks —
                  including tokens that are not listed on Stargate.
                </p>
                <p>
                  Many projects never add their token to Stargate. When that happens, moving the token between networks
                  has to be done manually: locating the OFT contract on a block explorer and entering dozens of transaction
                  parameters by hand. It is slow and easy to get wrong. Galactic Bridge automates all of it. It finds the
                  OFT contract — including the separate bridge adapter used by tokens that are not OFTs themselves — asks
                  the contract directly which networks it is connected to, and builds a ready-to-sign transaction in
                  seconds. It copies the call format from a real transaction where one exists, or builds it from the
                  LayerZero V2 standard where none does — so routes work even if nobody has used them before.
                </p>
              </div>
            )}

            {open === 'How it works' && (
              <div className="section">
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>Connect your wallet</li>
                  <li>Select the source and destination networks</li>
                  <li>Enter the token contract address — or just the ticker if the token was previously saved</li>
                  <li>The bridge finds the route and parameters automatically</li>
                  <li>Confirm the transaction in your wallet</li>
                </ol>
              </div>
            )}

            {open === 'Feedback' && (
              <div className="section">
                <p>Questions, suggestions or found a bug? Reach out:</p>
                <div className="foot-modal-row feedback-links">
                  <span className="foot-key">Contact the dev:</span>
                  <a href={TG_DEV} target="_blank" rel="noreferrer">Telegram</a>
                  <span className="foot-key">·</span>
                  <a href={X_DEV} target="_blank" rel="noreferrer">X</a>
                </div>
              </div>
            )}

            {open === 'Donate' && (
              <div className="section">
                <p>If the bridge was useful, you can support it with a donation on any EVM network.</p>
                <div className="foot-modal-row">
                  <span className="foot-key">EVM address:</span>
                  <span className="foot-addr">{DONATE_EVM}</span>
                  <button type="button" className="copy" title="Copy address" onClick={copyDonate}>
                    {copied ? '✓' : '⧉'}
                  </button>
                </div>
              </div>
            )}

            {open === 'Disclaimer' && (
              <div className="section">
                <p style={{ lineHeight: 1.6 }}>
                  Galactic Bridge is a non-custodial interface. It never holds your funds or private keys — you sign every
                  transaction in your own wallet, and no account or personal data is required.
                </p>
                <p style={{ lineHeight: 1.6 }}>
                  Always verify the token contract address yourself. Anyone can deploy a token using a familiar name or
                  ticker, and the bridge does not review, endorse or vouch for any token you enter.
                </p>
                <p style={{ lineHeight: 1.6 }}>
                  Crypto transactions are irreversible — check the destination network and the amount before confirming.
                  The service is provided as is, without guarantees of availability or accuracy. Use at your own risk.
                  This is not financial advice.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
