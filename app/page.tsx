'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { generateStrategySignals, classifyVixRegime } from '@/lib/signals';

interface QuoteData {
  symbol: string; ltp: number; open: number; high: number; low: number;
  close: number; change: number; changePct: number; volume: number;
  bid: number; ask: number; oi?: number; timestamp: number;
}
interface ThetaSignal {
  id: string; strategy: string; symbol: string; type: string;
  action: string; reason: string; legs: StrategyLeg[];
  netCredit: number; maxRisk: number; maxProfit: number;
  probability: number; urgency: string; regime: string; timestamp: number;
}
interface StrategyLeg {
  action: string; optionType: string; strike: number; expiry: string;
  lotSize: number; quantity: number; premium: number;
}
interface PaperPosition {
  id: string; strategy: string; symbol: string; type: string;
  legs: PaperLeg[]; entryDate: string; entryTime: string; expiry: string;
  netCredit: number; maxRisk: number; maxProfit: number; probability: number;
  status: string; currentValue: number; unrealizedPnl: number;
  realizedPnl: number; stopLossLevel: number; targetLevel: number;
  adjustmentCount: number; notes: string[]; regime: string;
}
interface PaperLeg {
  action: string; optionType: string; strike: number; expiry: string;
  lotSize: number; quantity: number; entryPremium: number;
  currentPremium: number; legPnl: number;
}
interface PaperTrade {
  id: string; positionId: string; action: string; strategy: string;
  symbol: string; netCredit: number; pnl: number; timestamp: string;
  reason: string; regime: string;
}
interface PortfolioStats {
  capital: number; deployed: number; cash: number; totalPnl: number;
  unrealizedPnl: number; realizedPnl: number; openPositions: number;
  winCount: number; lossCount: number; winRate: number;
  avgWin: number; avgLoss: number; expectancy: number; maxDrawdown: number;
  dailyTheta: number; monthlyReturn: number; sharpeEstimate: number;
  portfolioHeat: number;
}
interface ApiResponse {
  success: boolean; quotes: QuoteData[]; signals: ThetaSignal[];
  regime: string; vix: number; portfolioStats: PortfolioStats;
  isSimulated: boolean; timestamp: string; error?: string;
}


const safe = (n: number | undefined | null): number => (n == null || isNaN(n as number) ? 0 : n as number);
const fmt = (n: number | undefined | null, dec = 0) =>
  n == null ? '—' : safe(n).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtRs = (n: number | undefined | null) => `${fmt(Math.abs(safe(n)))}`;
const pct = (n: number | undefined | null) => { const v = safe(n); return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; };

const RC: Record<string, { color: string; bg: string; border: string; label: string }> = {
  NORMAL:   { color: '#4ade80', bg: 'rgba(74,222,128,0.07)',  border: 'rgba(74,222,128,0.25)',  label: 'NORMAL' },
  ELEVATED: { color: '#fbbf24', bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.25)',  label: 'ELEVATED' },
  EXTREME:  { color: '#f87171', bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.25)', label: 'EXTREME!' },
  CRUSHED:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.07)', border: 'rgba(148,163,184,0.25)', label: 'CRUSHED' },
};

const SYM: Record<string, string> = {
  'NSE:NIFTY50-INDEX': 'NIFTY 50',
  'NSE:NIFTYBANK-INDEX': 'BANKNIFTY',
  'NSE:INDIA VIX-INDEX': 'INDIA VIX',
  'NSE:FINNIFTY-INDEX': 'FINNIFTY',
};

export default function ThetaDash() {
  const [tab, setTab] = useState<'live'|'signals'|'positions'|'journal'>('live');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [loading, setLoading]     = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [lastTick, setLastTick]   = useState('');
  const [executing, setExecuting] = useState<string | null>(null);
  const [expandedPos, setExpandedPos] = useState<string | null>(null);
  const [toasts, setToasts]       = useState<{id:string;msg:string;type:'ok'|'err'}[]>([]);
  const [streamStatus, setStreamStatus] = useState<'connecting'|'live'|'error'>('connecting');
  const esRef  = useRef<EventSource | null>(null);
  const posRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addToast = (msg: string, type: 'ok'|'err' = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, {id, msg, type}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };

  const fetchPos = useCallback(async () => {
    try {
      const r    = await fetch('/api/paper/trade');
      const json = await r.json();
      if (json.success) { setPositions(json.positions); setTrades(json.trades); }
    } catch { /**/ }
  }, []);

  // Initial quote fetch (signals + portfolioStats on first load, re-used on SSE error)
  const fetchLive = useCallback(async () => {
    try {
      const r    = await fetch('/api/fyers/quote', { cache: 'no-store' });
      const json: ApiResponse = await r.json();
      if (json.success) {
        setData(json);
        setLastTick(new Date().toLocaleTimeString('en-IN'));
        setAuthError(null);
      } else {
        const errStr = json.error || '';
        if (errStr.includes('credentials') || errStr.includes('not configured')) {
          setAuthError('FYERS_NOT_CONNECTED');
        } else {
          setAuthError(errStr || 'Failed to fetch market data.');
        }
      }
    } catch (err) {
      setAuthError(String(err) || 'Failed to fetch market data.');
    } finally { setLoading(false); }
  }, []);

  const execSignal = async (sig: ThetaSignal) => {
    if (!sig.legs.length) return;
    setExecuting(sig.id);
    try {
      const r = await fetch('/api/paper/trade', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'OPEN', signal: sig}),
      });
      const json = await r.json();
      if (json.success) { addToast(`Paper trade opened: ${sig.strategy} on ${sig.symbol}`); fetchPos(); setTab('positions'); }
      else addToast(`Error: ${json.error}`, 'err');
    } finally { setExecuting(null); }
  };

  const closePos = async (id: string) => {
    const r = await fetch('/api/paper/trade', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({action:'CLOSE', positionId:id, reason:'Manual close'}),
    });
    const json = await r.json();
    if (json.success) { addToast(`Closed. P&L: ${json.position.realizedPnl>=0?'+':''}${fmtRs(json.position.realizedPnl)}`); fetchPos(); }
  };

  const resetAcct = async () => {
    if (!confirm('Reset paper account to 5,00,000?')) return;
    await fetch('/api/paper/reset', {method:'POST'});
    fetchPos(); addToast('Account reset to 5,00,000');
  };

  // ── SSE stream: real-time ticks from Fyers WebSocket (or simulated) ──────
  useEffect(() => {
    fetchLive();
    fetchPos();

    // Positions refresh every 5s (paper engine doesn't need sub-second)
    posRef.current = setInterval(fetchPos, 5000);

    // SSE connection
    const es = new EventSource('/api/fyers/stream');
    esRef.current = es;

    es.addEventListener('status', (e) => {
      const s = JSON.parse(e.data);
      if (s.live && s.connected) {
        setStreamStatus('live');
        setAuthError(null);
      } else if (s.error) {
        setStreamStatus('error');
        if (s.error.includes('credentials') || s.error.includes('not configured')) {
          setAuthError('FYERS_NOT_CONNECTED');
        }
      }
    });

    es.addEventListener('tick', (e) => {
      const tick = JSON.parse(e.data) as QuoteData;
      setLastTick(new Date().toLocaleTimeString('en-IN'));
      setLoading(false);
      // Merge incoming tick into quotes, recalculate signals
      setData(prev => {
        if (!prev) return prev;
        const quotes = prev.quotes.map(q =>
          q.symbol === tick.symbol ? { ...q, ...tick } : q
        );
        const nextSignals = generateStrategySignals(quotes);
        const nextVix = quotes.find(q => q.symbol === 'NSE:INDIA VIX-INDEX')?.ltp || 15;
        const nextRegime = classifyVixRegime(nextVix);
        return {
          ...prev,
          quotes,
          signals: nextSignals,
          vix: nextVix,
          regime: nextRegime,
          timestamp: new Date().toISOString(),
        };
      });
    });

    es.onerror = () => {
      setStreamStatus('error');
      // Reconnect after 3s
      setTimeout(() => {
        es.close();
        fetchLive();
      }, 3000);
    };

    return () => {
      es.close();
      if (posRef.current) clearInterval(posRef.current);
    };
  }, [fetchLive, fetchPos]);

  const stats = data?.portfolioStats;
  const regime = data?.regime || 'NORMAL';
  const rc = RC[regime] || RC.NORMAL;
  const openCount = positions.filter(p=>p.status==='OPEN').length;

  return (
    <div style={{minHeight:'100vh',background:'#070c10',color:'#c8d8e8',fontFamily:"'JetBrains Mono','Fira Mono',monospace",fontSize:13}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#070c10}
        ::-webkit-scrollbar-thumb{background:#1e2d3d}
        .tb{background:transparent;border:none;font-family:inherit;font-size:11px;cursor:pointer;padding:9px 18px;letter-spacing:.1em;text-transform:uppercase;transition:all .18s;border-bottom:2px solid transparent;color:#4a6070}
        .tb:hover{color:#8aa4b8}
        .tb.a{color:#e8b86d;border-bottom-color:#e8b86d}
        .card{background:#0d1219;border:1px solid #1e2d3d;padding:16px}
        .btn{background:#0d1219;border:1px solid #1e2d3d;color:#8aa4b8;font-family:inherit;font-size:11px;padding:7px 14px;cursor:pointer;text-transform:uppercase;letter-spacing:.07em;transition:all .15s}
        .btn:hover{border-color:#e8b86d;color:#e8b86d}
        .btng{border-color:rgba(74,222,128,.4);color:#4ade80}
        .btng:hover{background:rgba(74,222,128,.08)}
        .btnr{border-color:rgba(248,113,113,.4);color:#f87171}
        .btnr:hover{background:rgba(248,113,113,.08)}
        .pill{display:inline-block;padding:2px 8px;font-size:9px;letter-spacing:.08em;text-transform:uppercase}
        @keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        .pulse{animation:pulse 2s infinite}
        .fi{animation:fi .3s ease both}
        tr:hover td{background:rgba(232,184,109,.02)}
      `}</style>

      {/* TOASTS */}
      <div style={{position:'fixed',top:16,right:16,zIndex:9999,display:'flex',flexDirection:'column',gap:8}}>
        {toasts.map(t=>(
          <div key={t.id} className="fi" style={{background:t.type==='ok'?'rgba(74,222,128,.12)':'rgba(248,113,113,.12)',border:`1px solid ${t.type==='ok'?'rgba(74,222,128,.3)':'rgba(248,113,113,.3)'}`,color:t.type==='ok'?'#4ade80':'#f87171',padding:'10px 16px',fontSize:12,maxWidth:340}}>{t.msg}</div>
        ))}
      </div>

      {/* HEADER */}
      <div style={{borderBottom:'1px solid #1e2d3d',padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div>
            <div style={{fontFamily:'Syne',fontSize:20,fontWeight:800,color:'#e8b86d',letterSpacing:'-0.3px'}}>THETA HARVESTER</div>
            <div style={{fontSize:10,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.1em',marginTop:2}}>
              <span className="pulse" style={{display:'inline-block',width:6,height:6,borderRadius:'50%',marginRight:6,
                background: streamStatus==='live' ? '#4ade80' : streamStatus==='error' ? '#f87171' : '#4a6070',
              }}></span>
              {streamStatus==='live'    ? 'FYERS LIVE · WebSocket'
               : streamStatus==='error' ? 'STREAM ERROR · Retrying'
               :                         'CONNECTING…'}
              {' · NSE F&O · 5L Capital'}
            </div>

          </div>
          <div style={{padding:'6px 14px',background:rc.bg,border:`1px solid ${rc.border}`,color:rc.color,fontSize:11,letterSpacing:'.1em',textTransform:'uppercase'}}>
            VIX {data?.vix?.toFixed(1)||'—'} · {rc.label}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          {stats && (
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:10,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.08em'}}>Portfolio P&L</div>
              <div style={{fontFamily:'Syne',fontSize:18,fontWeight:700,color:stats.totalPnl>=0?'#4ade80':'#f87171'}}>
                {stats.totalPnl>=0?'+':''}{stats.totalPnl>=0?'':'−'}₹{fmtRs(stats.totalPnl)}
              </div>
            </div>
          )}
          <a href="/fyers-login" style={{textDecoration:'none'}}>
            <button style={{
              background: 'transparent',
              border: `1px solid ${streamStatus === 'live' ? 'rgba(74,222,128,.4)' : 'rgba(251,191,36,.4)'}`,
              color: streamStatus === 'live' ? '#4ade80' : '#fbbf24',
              fontFamily: 'inherit',
              fontSize: 10,
              padding: '6px 12px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              transition: 'all .15s'
            }}
              onMouseEnter={e=>(e.currentTarget.style.background = streamStatus === 'live' ? 'rgba(74,222,128,.08)' : 'rgba(251,191,36,.08)')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
            >⚡ Connect Fyers</button>
          </a>
          <div style={{fontSize:10,color:'#4a6070'}}>↻ {lastTick||'—'}</div>
        </div>
      </div>

      {/* TABS */}
      <div style={{borderBottom:'1px solid #1e2d3d',padding:'0 24px',display:'flex',gap:4}}>
        <button className={`tb ${tab==='live'?'a':''}`} onClick={()=>setTab('live')}>📡 Live Market</button>
        <button className={`tb ${tab==='signals'?'a':''}`} onClick={()=>setTab('signals')}>⚡ Signals {data?.signals?.length?`(${data.signals.length})`:''}</button>
        <button className={`tb ${tab==='positions'?'a':''}`} onClick={()=>setTab('positions')}>📂 Positions {openCount?`(${openCount})`:''}</button>
        <button className={`tb ${tab==='journal'?'a':''}`} onClick={()=>setTab('journal')}>📒 Journal</button>
      </div>

      {/* MAIN CONTENT */}
      <div style={{padding:'20px 24px',maxWidth:1400,margin:'0 auto'}}>
        {authError ? (
          <div className="fi" style={{maxWidth:600,margin:'40px auto',padding:40,background:'#0d1219',border:'1px solid #1e2d3d',textAlign:'center'}}>
            <div style={{fontSize:32,marginBottom:16}}>🔑</div>
            <div style={{fontFamily:'Syne',fontSize:20,fontWeight:800,color:'#e8b86d',marginBottom:12}}>Fyers Authentication Required</div>
            <p style={{color:'#8aa4b8',fontSize:13,lineHeight:1.7,marginBottom:24}}>
              Theta Harvester operates in <strong>Live Mode only</strong>. To fetch real-time quotes, recalculate strategy signals, and manage paper positions, you must authorize the application with your Fyers account.
            </p>
            {authError !== 'FYERS_NOT_CONNECTED' && (
              <div style={{padding:'10px 14px',background:'rgba(248,113,113,0.05)',border:'1px solid rgba(248,113,113,0.15)',color:'#f87171',fontSize:11,fontFamily:'monospace',marginBottom:24,textAlign:'left',wordBreak:'break-all'}}>
                System Error: {authError}
              </div>
            )}
            <a href="/fyers-login" style={{textDecoration:'none'}}>
              <button className="btn btng" style={{fontSize:12,padding:'12px 24px',fontWeight:600}}>
                ⚡ Connect Fyers Account
              </button>
            </a>
          </div>
        ) : loading ? (
          <div style={{textAlign:'center',padding:80,color:'#4a6070'}}>Loading market data…</div>
        ) : tab==='live' ? (
          <div>
            {/* Stats Bar */}
            {stats && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:12,marginBottom:20}}>
                {[
                  {l:'Capital',v:`₹${fmt(stats.capital)}`,c:'#e8b86d'},
                  {l:'Cash Available',v:`₹${fmt(stats.cash)}`,c:'#60a5fa'},
                  {l:'Portfolio Heat',v:`${safe(stats.portfolioHeat).toFixed(1)}%`,c:safe(stats.portfolioHeat)>60?'#f87171':'#fbbf24'},
                  {l:'Daily Theta',v:`₹${fmt(stats.dailyTheta,0)}`,c:'#4ade80'},
                  {l:'Monthly Return',v:pct(stats.monthlyReturn),c:safe(stats.monthlyReturn)>=0?'#4ade80':'#f87171'},
                  {l:'Win Rate',v:`${safe(stats.winRate).toFixed(0)}%`,c:safe(stats.winRate)>=60?'#4ade80':'#fbbf24'},
                  {l:'Max Drawdown',v:`${safe(stats.maxDrawdown).toFixed(1)}%`,c:safe(stats.maxDrawdown)>10?'#f87171':'#8aa4b8'},
                  {l:'Expectancy',v:`₹${fmt(stats.expectancy,0)}`,c:safe(stats.expectancy)>=0?'#4ade80':'#f87171'},
                ].map(s=>(
                  <div key={s.l} className="card" style={{position:'relative',overflow:'hidden'}}>
                    <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:s.c,opacity:.6}}></div>
                    <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.1em',color:'#4a6070',marginBottom:6}}>{s.l}</div>
                    <div style={{fontFamily:'Syne',fontSize:18,fontWeight:700,color:s.c}}>{s.v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Quote Cards */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12,marginBottom:20}}>
              {data?.quotes.map(q=>{
                const isVix=q.symbol.includes('VIX');
                const cc=q.changePct>=0?'#4ade80':'#f87171';
                return (
                  <div key={q.symbol} className="card">
                    <div style={{display:'flex',justifyContent:'space-between'}}>
                      <div>
                        <div style={{fontSize:10,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.1em'}}>{SYM[q.symbol]||q.symbol}</div>
                        <div style={{fontFamily:'Syne',fontSize:26,fontWeight:800,color:'#f0f4f8',lineHeight:1.1,marginTop:4}}>
                          {isVix ? safe(q.ltp).toFixed(2) : fmt(q.ltp,2)}
                        </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{color:cc,fontSize:14,fontWeight:600}}>{pct(q.changePct)}</div>
                        <div style={{color:cc,fontSize:11}}>{q.change>=0?'+':''}{fmt(q.change,2)}</div>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginTop:10,paddingTop:10,borderTop:'1px solid #1e2d3d',fontSize:10}}>
                      <div><div style={{color:'#4a6070'}}>OPEN</div><div style={{color:'#8aa4b8'}}>{fmt(q.open,2)}</div></div>
                      <div><div style={{color:'#4a6070'}}>HIGH</div><div style={{color:'#4ade80'}}>{fmt(q.high,2)}</div></div>
                      <div><div style={{color:'#4a6070'}}>LOW</div><div style={{color:'#f87171'}}>{fmt(q.low,2)}</div></div>
                    </div>
                    {!isVix&&safe(q.volume)>0&&<div style={{marginTop:8,fontSize:10,color:'#4a6070'}}>Vol: {(safe(q.volume)/1e6).toFixed(2)}M</div>}
                  </div>
                );
              })}
            </div>

            {/* VIX Gauge */}
            {data && (
              <div className="card">
                <div style={{fontFamily:'Syne',fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:14}}>India VIX Regime Gauge</div>
                <div style={{position:'relative',marginBottom:8}}>
                  <div style={{height:14,background:'linear-gradient(90deg,#1a3a1a 0%,#2d6a2d 20%,#4a9a4a 35%,#6aca6a 50%,#d4a030 65%,#e85030 80%,#c01020 100%)',borderRadius:2}}></div>
                  <div style={{position:'absolute',top:-3,left:`${Math.min(95,Math.max(2,((data.vix-8)/42)*100))}%`,width:4,height:20,background:'white',transform:'translateX(-50%)',transition:'left .6s ease'}}></div>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#4a6070',marginBottom:14}}>
                  {['8','12','18','25','35','50+'].map(v=><span key={v}>{v}</span>)}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,fontSize:10}}>
                  {[
                    {r:'8–12',l:'CRUSHED',a:'Premium thin · wait',c:'#94a3b8'},
                    {r:'12–18',l:'IDEAL',a:'Full deploy · all strats',c:'#4ade80'},
                    {r:'18–25',l:'ELEVATED',a:'Defined risk · ½ size',c:'#fbbf24'},
                    {r:'25–35',l:'DANGER',a:'25% size · hedge heavy',c:'#f87171'},
                    {r:'35+',l:'SURVIVAL',a:'STOP selling · buy puts',c:'#ef4444'},
                  ].map(z=>(
                    <div key={z.r} style={{padding:'8px 10px',border:`1px solid ${z.c}30`,background:`${z.c}07`,textAlign:'center'}}>
                      <div style={{fontFamily:'Syne',fontWeight:700,color:z.c,fontSize:13}}>{z.r}</div>
                      <div style={{color:z.c,fontSize:9,letterSpacing:'.06em',margin:'3px 0'}}>{z.l}</div>
                      <div style={{color:'#4a6070',fontSize:9}}>{z.a}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        ) : tab==='signals' ? (
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {!data?.signals?.length ? (
              <div style={{textAlign:'center',padding:60,color:'#4a6070'}}>No signals. Market may be closed or check credentials.</div>
            ) : data.signals.map(sig=>{
              const isAlert=!sig.legs.length;
              const isExec=executing===sig.id;
              const rc2=RC[sig.regime]||RC.NORMAL;
              return (
                <div key={sig.id} className="card fi" style={{borderColor:sig.urgency==='HIGH'?'#f8717140':sig.urgency==='MEDIUM'?'#e8b86d40':'#1e2d3d'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:8}}>
                        <span style={{fontFamily:'Syne',fontSize:15,fontWeight:700,color:'#f0f4f8'}}>{sig.strategy}</span>
                        <span style={{fontSize:11,color:'#8aa4b8'}}>· {sig.symbol}</span>
                        <span className="pill" style={{background:rc2.bg,border:`1px solid ${rc2.border}`,color:rc2.color}}>{sig.regime}</span>
                        {sig.action==='ENTER'&&<span className="pill" style={{background:'rgba(74,222,128,.1)',border:'1px solid rgba(74,222,128,.2)',color:'#4ade80'}}>ENTER</span>}
                        {sig.action==='EXIT'&&<span className="pill" style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.2)',color:'#f87171'}}>EXIT</span>}
                        {sig.urgency==='HIGH'&&<span className="pill" style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.2)',color:'#f87171'}}>⚠ URGENT</span>}
                      </div>
                      <div style={{fontSize:12,color:'#8aa4b8',marginBottom:12,maxWidth:640}}>{sig.reason}</div>
                      {!!sig.legs.length&&(
                        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
                          {sig.legs.map((leg,i)=>(
                            <div key={i} style={{padding:'4px 10px',border:'1px solid #1e2d3d',fontSize:10,color:leg.action==='SELL'?'#f87171':'#4ade80'}}>
                              {leg.action} {leg.optionType} {leg.strike} · ₹{safe(leg.premium).toFixed(0)}
                            </div>
                          ))}
                        </div>
                      )}
                      {!isAlert&&(
                        <div style={{display:'flex',gap:20,flexWrap:'wrap',fontSize:11}}>
                          <span><span style={{color:'#4a6070'}}>Credit: </span><span style={{color:'#4ade80'}}>₹{safe(sig.netCredit).toFixed(0)}</span></span>
                          <span><span style={{color:'#4a6070'}}>Max Risk: </span><span style={{color:'#f87171'}}>₹{safe(sig.maxRisk).toFixed(0)}</span></span>
                          <span><span style={{color:'#4a6070'}}>Max Profit: </span><span style={{color:'#e8b86d'}}>₹{safe(sig.maxProfit).toFixed(0)}</span></span>
                          <span><span style={{color:'#4a6070'}}>Win Prob: </span><span style={{color:'#60a5fa'}}>{sig.probability}%</span></span>
                        </div>
                      )}
                    </div>
                    {!isAlert&&sig.action==='ENTER'&&(
                      <button className="btn btng" style={{minWidth:130,opacity:isExec?.5:1}} disabled={isExec} onClick={()=>execSignal(sig)}>
                        {isExec?'Executing…':'⚡ Paper Trade'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        ) : tab==='positions' ? (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
              <div style={{fontFamily:'Syne',fontSize:14,fontWeight:700,color:'#e8b86d'}}>Paper Positions</div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn" onClick={fetchPos}>↻ Refresh</button>
                <button className="btn btnr" onClick={resetAcct}>⟳ Reset Account</button>
              </div>
            </div>
            {!positions.length ? (
              <div style={{textAlign:'center',padding:60,color:'#4a6070'}}>No positions yet. Execute a signal to start paper trading.</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {positions.map(pos=>{
                  const isOpen=pos.status==='OPEN';
                  const pnl=isOpen?pos.unrealizedPnl:pos.realizedPnl;
                  const pc=pnl>=0?'#4ade80':'#f87171';
                  const exp=expandedPos===pos.id;
                  const pnlPct=pos.maxProfit>0?(pos.unrealizedPnl/pos.maxProfit)*100:0;
                  return (
                    <div key={pos.id} className="card" style={{borderColor:isOpen?'#1e2d3d':'#111820'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,cursor:'pointer'}} onClick={()=>setExpandedPos(exp?null:pos.id)}>
                        <div style={{display:'flex',alignItems:'center',gap:12}}>
                          <div>
                            <div style={{fontFamily:'Syne',fontSize:14,fontWeight:700,color:isOpen?'#f0f4f8':'#4a6070'}}>{pos.strategy}</div>
                            <div style={{fontSize:10,color:'#4a6070',marginTop:2}}>{pos.symbol} · {pos.entryDate} {pos.entryTime} · Exp: {pos.expiry}</div>
                          </div>
                          <span className="pill" style={{background:isOpen?'rgba(74,222,128,.1)':'rgba(74,86,128,.1)',border:`1px solid ${isOpen?'rgba(74,222,128,.2)':'rgba(74,86,128,.2)'}`,color:isOpen?'#4ade80':'#4a6070'}}>{pos.status}</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:16}}>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:9,color:'#4a6070',textTransform:'uppercase'}}>{isOpen?'Unrealized':'Realized'} P&L</div>
                            <div style={{fontFamily:'Syne',fontSize:16,fontWeight:700,color:pc}}>{pnl>=0?'+':'−'}₹{fmtRs(pnl)}</div>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:9,color:'#4a6070',textTransform:'uppercase'}}>Net Credit</div>
                            <div style={{fontSize:12,color:'#e8b86d'}}>₹{safe(pos.netCredit).toFixed(0)}</div>
                          </div>
                          {isOpen&&<button className="btn btnr" style={{fontSize:10,padding:'5px 10px'}} onClick={e=>{e.stopPropagation();closePos(pos.id);}}>Close</button>}
                          <span style={{color:'#4a6070'}}>{exp?'▲':'▼'}</span>
                        </div>
                      </div>
                      {isOpen&&pos.maxProfit>0&&(
                        <div style={{marginTop:10}}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#4a6070',marginBottom:3}}>
                            <span>SL: −₹{safe(pos.stopLossLevel).toFixed(0)}</span>
                            <span style={{color:'#4ade80'}}>Target: +₹{safe(pos.targetLevel).toFixed(0)}</span>
                          </div>
                          <div style={{height:4,background:'#111820',borderRadius:2,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${Math.min(100,Math.max(0,50+pnlPct/2))}%`,background:pnlPct>=0?'#4ade80':'#f87171',transition:'width .4s ease',borderRadius:2}}></div>
                          </div>
                        </div>
                      )}
                      {exp&&(
                        <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid #1e2d3d',display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                          <div>
                            <div style={{fontSize:10,color:'#4a6070',textTransform:'uppercase',marginBottom:8}}>Legs</div>
                            {pos.legs.map((leg,i)=>(
                              <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,padding:'4px 0',borderBottom:'1px solid #111820'}}>
                                <span style={{color:leg.action==='SELL'?'#f87171':'#4ade80'}}>{leg.action} {leg.optionType} {leg.strike}</span>
                                <span style={{color:'#8aa4b8'}}>₹{safe(leg.entryPremium).toFixed(1)}→₹{safe(leg.currentPremium).toFixed(1)}</span>
                                <span style={{color:safe(leg.legPnl)>=0?'#4ade80':'#f87171'}}>{safe(leg.legPnl)>=0?'+':'−'}₹{Math.abs(safe(leg.legPnl)).toFixed(0)}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <div style={{fontSize:10,color:'#4a6070',textTransform:'uppercase',marginBottom:8}}>Trade Notes</div>
                            {pos.notes.map((n,i)=><div key={i} style={{fontSize:10,color:'#8aa4b8',padding:'3px 0',borderBottom:'1px solid #0d1219'}}>{n}</div>)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        ) : (
          <div>
            <div style={{fontFamily:'Syne',fontSize:14,fontWeight:700,color:'#e8b86d',marginBottom:16}}>Trade Journal</div>
            {!trades.length ? (
              <div style={{textAlign:'center',padding:60,color:'#4a6070'}}>No trades yet.</div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #1e2d3d'}}>
                      {['Time','Action','Strategy','Symbol','Credit','P&L','Regime','Reason'].map(h=>(
                        <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9,textTransform:'uppercase',letterSpacing:'.1em',color:'#4a6070',fontWeight:400}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map(t=>(
                      <tr key={t.id} style={{borderBottom:'1px solid rgba(30,45,61,.4)'}}>
                        <td style={{padding:'9px 12px',fontSize:10,color:'#4a6070'}}>{new Date(t.timestamp).toLocaleTimeString('en-IN')}</td>
                        <td style={{padding:'9px 12px'}}>
                          <span className="pill" style={{background:t.action==='OPEN'?'rgba(74,222,128,.1)':'rgba(248,113,113,.1)',border:`1px solid ${t.action==='OPEN'?'rgba(74,222,128,.2)':'rgba(248,113,113,.2)'}`,color:t.action==='OPEN'?'#4ade80':'#f87171'}}>{t.action}</span>
                        </td>
                        <td style={{padding:'9px 12px',color:'#c8d8e8'}}>{t.strategy}</td>
                        <td style={{padding:'9px 12px',color:'#8aa4b8'}}>{t.symbol}</td>
                        <td style={{padding:'9px 12px',color:'#e8b86d'}}>₹{safe(t.netCredit).toFixed(0)}</td>
                        <td style={{padding:'9px 12px',color:safe(t.pnl)>=0?'#4ade80':'#f87171'}}>{t.pnl!==0?`${safe(t.pnl)>=0?'+':'−'}₹${Math.abs(safe(t.pnl)).toFixed(0)}`:'—'}</td>
                        <td style={{padding:'9px 12px'}}>
                          <span className="pill" style={{background:RC[t.regime]?.bg,border:`1px solid ${RC[t.regime]?.border}`,color:RC[t.regime]?.color}}>{t.regime}</span>
                        </td>
                        <td style={{padding:'9px 12px',fontSize:10,color:'#4a6070',maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
