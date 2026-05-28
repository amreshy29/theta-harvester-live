'use client';
import { useState, useEffect, useCallback } from 'react';

type Step = 'init' | 'waiting' | 'exchange' | 'done' | 'error';

export default function FyersLoginPage() {
  const [step, setStep]           = useState<Step>('init');
  const [authUrl, setAuthUrl]     = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [authCode, setAuthCode]   = useState('');
  const [token, setToken]         = useState('');
  const [appId, setAppId]         = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [copied, setCopied]       = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);

  // Auto-capture auth_code when Fyers redirects back here
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('auth_code');
    if (code) {
      setAuthCode(code);
      setStep('exchange');
      // Clean URL so a page refresh doesn't re-trigger
      window.history.replaceState({}, '', '/fyers-login');
    }
  }, []);

  const loadAuthUrl = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/fyers/auth');
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setAuthUrl(j.authUrl);
      setAppId(j.appId);
      setRedirectUri(j.redirectUri);
      setStep('waiting');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const exchangeToken = useCallback(async () => {
    if (!authCode.trim()) { setError('auth_code is empty.'); return; }
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/fyers/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ auth_code: authCode.trim() }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error + (j.raw ? ' · ' + JSON.stringify(j.raw) : ''));
      setToken(j.access_token);
      setStep('done');
    } catch (e) {
      setError(String(e));
      setStep('error');
    } finally {
      setLoading(false);
    }
  }, [authCode]);

  // Auto-exchange when auth_code arrives via redirect
  useEffect(() => {
    if (step === 'exchange' && authCode && !token && !loading) {
      exchangeToken();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, authCode]);

  const copy = (text: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  const S = {
    page: {
      minHeight: '100vh',
      background: '#070c10',
      color: '#c8d8e8',
      fontFamily: "'JetBrains Mono','Fira Mono',monospace",
      display: 'flex' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      padding: 24,
    } as React.CSSProperties,
  };

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        .card { background: #0d1219; border: 1px solid #1e2d3d; padding: 28px 32px; }
        .btn {
          background: transparent; border: 1px solid #e8b86d; color: #e8b86d;
          font-family: inherit; font-size: 12px; padding: 10px 22px; cursor: pointer;
          text-transform: uppercase; letter-spacing: .08em; transition: all .15s;
        }
        .btn:hover:not(:disabled) { background: rgba(232,184,109,.09); }
        .btn:disabled { opacity: .4; cursor: not-allowed; }
        .btn-g { border-color: #4ade80; color: #4ade80; }
        .btn-g:hover:not(:disabled) { background: rgba(74,222,128,.08); }
        .btn-r { border-color: #f87171; color: #f87171; }
        .inp {
          background: #070c10; border: 1px solid #1e2d3d; color: #c8d8e8;
          font-family: inherit; font-size: 12px; padding: 10px 14px; width: 100%;
          outline: none; transition: border-color .15s;
        }
        .inp:focus { border-color: #e8b86d; }
        .badge {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(232,184,109,.1); border: 1px solid rgba(232,184,109,.3);
          color: #e8b86d; font-size: 10px; flex-shrink: 0;
        }
        .mono { font-family: inherit; font-size: 11px; word-break: break-all; }
        .uri-box {
          background: #070c10; border: 1px solid rgba(96,165,250,.25);
          color: #60a5fa; padding: 10px 14px; font-size: 11px; word-break: break-all;
          line-height: 1.6;
        }
        @keyframes fi { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
        .fi { animation: fi .3s ease both; }
        a { color: #60a5fa; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .sep { border: none; border-top: 1px solid #1e2d3d; margin: 20px 0; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 580 }} className="fi">

        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, color: '#e8b86d' }}>
            THETA HARVESTER
          </div>
          <div style={{ fontSize: 10, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '.1em', marginTop: 3 }}>
            Fyers API · Access Token Setup
          </div>
        </div>

        <div className="card">
          <div style={{ fontFamily: 'Syne', fontSize: 15, fontWeight: 700, color: '#f0f4f8', marginBottom: 20 }}>
            Connect Your Fyers Account
          </div>

          {/* ── Steps ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
            {[
              { n: 1, label: 'Register the Redirect URI in Fyers API dashboard', done: step !== 'init' },
              { n: 2, label: 'Click the login button → authorize in browser', done: step === 'exchange' || step === 'done' },
              { n: 3, label: 'Fyers redirects back → token generated automatically', done: step === 'done' },
              { n: 4, label: 'Copy token → set FYERS_ACCESS_TOKEN in .env', done: false },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: s.done ? 1 : (step === 'init' && s.n === 1 ? 1 : 0.4) }}>
                <span className="badge" style={s.done ? { background: 'rgba(74,222,128,.1)', borderColor: 'rgba(74,222,128,.3)', color: '#4ade80' } : {}}>
                  {s.done ? '✓' : s.n}
                </span>
                <span style={{ fontSize: 12, paddingTop: 2, color: s.done ? '#c8d8e8' : '#8aa4b8' }}>{s.label}</span>
              </div>
            ))}
          </div>

          <hr className="sep" />

          {/* ══ STEP: init ══ */}
          {step === 'init' && (
            <div className="fi" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 12, color: '#8aa4b8', margin: 0, lineHeight: 1.7 }}>
                Before clicking the button below, you need to register the redirect URI in your{' '}
                <a href="https://myapi.fyers.in/dashboard/" target="_blank" rel="noopener noreferrer">
                  Fyers API Dashboard
                </a>.
                <br />Click <strong style={{ color: '#e8b86d' }}>→ Get My Redirect URI</strong> first to see the exact URL.
              </p>
              <button className="btn" onClick={loadAuthUrl} disabled={loading}>
                {loading ? 'Loading…' : '→ Get My Redirect URI'}
              </button>
            </div>
          )}

          {/* ══ STEP: waiting — show redirect URI + login button ══ */}
          {step === 'waiting' && (
            <div className="fi" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* ── Redirect URI box — most important ── */}
              <div>
                <div style={{ fontSize: 10, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                  ① Register this Redirect URI in Fyers API Dashboard
                </div>
                <div className="uri-box" style={{ marginBottom: 8 }}>{redirectUri}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-g" style={{ fontSize: 10, padding: '6px 14px' }}
                    onClick={() => copy(redirectUri, setCopiedUri)}>
                    {copiedUri ? '✓ Copied!' : '⎘ Copy URI'}
                  </button>
                  <a href="https://myapi.fyers.in/dashboard/" target="_blank" rel="noopener noreferrer">
                    <button className="btn" style={{ fontSize: 10, padding: '6px 14px' }}>↗ Fyers Dashboard</button>
                  </a>
                </div>
                <p style={{ fontSize: 11, color: '#4a6070', margin: '10px 0 0', lineHeight: 1.7 }}>
                  In Fyers Dashboard → Your App → <strong style={{ color: '#8aa4b8' }}>Edit App</strong> →{' '}
                  <strong style={{ color: '#8aa4b8' }}>Redirect URL</strong> → paste the URI above → Save.
                </p>
              </div>

              <hr className="sep" style={{ margin: '4px 0' }} />

              {/* ── Login button ── */}
              <div>
                <div style={{ fontSize: 10, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                  ② After registering, open Fyers login
                </div>
                <p style={{ fontSize: 11, color: '#4a6070', margin: '0 0 12px', lineHeight: 1.7 }}>
                  App ID: <span style={{ color: '#e8b86d' }}>{appId}</span>
                  <br />Fyers will redirect back here automatically after you log in.
                </p>
                <a href={authUrl} target="_blank" rel="noopener noreferrer">
                  <button className="btn btn-g">↗ Open Fyers Login</button>
                </a>
              </div>

              <hr className="sep" style={{ margin: '4px 0' }} />

              {/* Manual fallback */}
              <div>
                <div style={{ fontSize: 10, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                  ③ If redirect fails — paste auth_code manually
                </div>
                <input
                  className="inp"
                  placeholder="Paste auth_code here…"
                  value={authCode}
                  onChange={e => setAuthCode(e.target.value)}
                  style={{ marginBottom: 10 }}
                />
                <button className="btn btn-g" onClick={exchangeToken} disabled={!authCode.trim() || loading}>
                  {loading ? 'Exchanging…' : '⚡ Get Token'}
                </button>
              </div>
            </div>
          )}

          {/* ══ STEP: exchange (auto) ══ */}
          {step === 'exchange' && (
            <div className="fi" style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>⚡</div>
              <div style={{ color: '#e8b86d', fontSize: 13 }}>Exchanging auth code for access token…</div>
              <div style={{ color: '#4a6070', fontSize: 11, marginTop: 8 }}>Please wait</div>
            </div>
          )}

          {/* ══ STEP: done ══ */}
          {step === 'done' && (
            <div className="fi" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '10px 14px', background: 'rgba(74,222,128,.07)', border: '1px solid rgba(74,222,128,.25)', color: '#4ade80', fontSize: 12 }}>
                ✅ Access token generated successfully!
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                  Your Access Token (valid for 1 day)
                </div>
                <div className="mono uri-box" style={{ borderColor: 'rgba(232,184,109,.25)', color: '#c8d8e8', marginBottom: 10, userSelect: 'all' as const }}>
                  {token}
                </div>
                <button className="btn btn-g" onClick={() => copy(token, setCopied)}>
                  {copied ? '✓ Copied!' : '⎘ Copy Token'}
                </button>
              </div>

              <div style={{ padding: '14px 16px', background: '#070c10', border: '1px solid #1e2d3d', fontSize: 11, lineHeight: 1.9 }}>
                <div style={{ color: '#e8b86d', marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                  Now set the token:
                </div>
                <div style={{ color: '#4a6070' }}>Local (.env file):</div>
                <code style={{ color: '#8aa4b8' }}>FYERS_ACCESS_TOKEN={token.slice(0, 30)}…</code>
                <br />
                <div style={{ color: '#4a6070', marginTop: 6 }}>Vercel: Settings → Environment Variables → FYERS_ACCESS_TOKEN</div>
                <div style={{ color: '#fbbf24', marginTop: 6, fontSize: 10 }}>⚠ Tokens expire daily. Repeat this flow each morning.</div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <a href="/"><button className="btn btn-g">→ Go to Dashboard</button></a>
                <button className="btn" onClick={() => { setStep('init'); setToken(''); setAuthCode(''); setAuthUrl(''); }}>
                  ↺ New Token
                </button>
              </div>
            </div>
          )}

          {/* ══ Error ══ */}
          {(step === 'error' || error) && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(248,113,113,.07)', border: '1px solid rgba(248,113,113,.25)', color: '#f87171', fontSize: 11, lineHeight: 1.7 }}>
              ⚠ {error}
              <br />
              <button className="btn btn-r" style={{ marginTop: 10, fontSize: 10 }}
                onClick={() => { setError(''); setStep('waiting'); }}>
                ← Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 14, fontSize: 10, color: '#4a6070', textAlign: 'center' }}>
          <a href="/" style={{ color: '#4a6070' }}>← Dashboard</a>
          {' · '}
          <a href="https://myapi.fyers.in/dashboard/" target="_blank" rel="noopener noreferrer" style={{ color: '#4a6070' }}>
            Fyers API Dashboard ↗
          </a>
          {' · '}
          <a href="https://myapi.fyers.in/docs/" target="_blank" rel="noopener noreferrer" style={{ color: '#4a6070' }}>
            Docs ↗
          </a>
        </div>
      </div>
    </div>
  );
}
