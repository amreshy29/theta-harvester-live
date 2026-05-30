'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { generateStrategySignals, classifyVixRegime } from '@/lib/signals';
import dynamic from 'next/dynamic';

// Dynamically import Recharts components to disable server-side rendering for them
const ResponsiveContainer = dynamic(() => import('recharts').then(r => r.ResponsiveContainer), { ssr: false });
const AreaChart = dynamic(() => import('recharts').then(r => r.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(r => r.Area), { ssr: false });
const BarChart = dynamic(() => import('recharts').then(r => r.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(r => r.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(r => r.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(r => r.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(r => r.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(r => r.CartesianGrid), { ssr: false });
const Cell = dynamic(() => import('recharts').then(r => r.Cell), { ssr: false });

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
  'NSE:INDIAVIX-INDEX': 'INDIA VIX',
  'NSE:FINNIFTY-INDEX': 'FINNIFTY',
};

const NIFTY_INDEX_META: Record<string, {desc:string;label:string;color:string;bg:string;border:string}> = {
  'NSE:NIFTY50-INDEX':   {desc:'Top 50 large-cap stocks · NSE',      label:'LARGE CAP', color:'#60a5fa',bg:'rgba(96,165,250,.07)',  border:'rgba(96,165,250,.2)'},
  'NSE:NIFTYBANK-INDEX': {desc:'12 most liquid banking stocks · NSE', label:'BANKING',   color:'#e8b86d',bg:'rgba(232,184,109,.07)',border:'rgba(232,184,109,.2)'},
  'NSE:INDIAVIX-INDEX':  {desc:'Implied volatility of NIFTY options', label:'VOLATILITY',color:'#f87171',bg:'rgba(248,113,113,.07)',border:'rgba(248,113,113,.2)'},
  'NSE:FINNIFTY-INDEX':  {desc:'20 financial services stocks · NSE',  label:'FIN SVCS',  color:'#a78bfa',bg:'rgba(167,139,250,.07)',border:'rgba(167,139,250,.2)'},
};

export default function ThetaDash() {
  const [tab, setTab] = useState<'live'|'signals'|'positions'|'journal'|'indices'|'swing'>('live');
  const [swingReport, setSwingReport] = useState<any | null>(null);
  const [loadingSwing, setLoadingSwing] = useState(false);
  const [activeSwingTab, setActiveSwingTab] = useState<'watchlist' | 'details' | 'portfolio' | 'avoid'>('watchlist');
  const [selectedSwingStock, setSelectedSwingStock] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
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
  const [checkingConn, setCheckingConn] = useState(false);
  const [analytics, setAnalytics] = useState<{
    equityCurve: any[];
    strategyData: any[];
    regimeData: any[];
  } | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const esRef  = useRef<EventSource | null>(null);
  const posRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setIsDemo(params.get('demo') === 'true');
    }
  }, []);

  const addToast = (msg: string, type: 'ok'|'err' = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, {id, msg, type}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };

  const testConnection = async () => {
    setCheckingConn(true);
    try {
      const r = await fetch('/api/fyers/ping');
      const json = await r.json();
      if (json.success) {
        addToast(`Fyers connection valid: ${json.name || json.clientCode}`);
        setAuthError(null);
        fetchLive();
      } else {
        addToast(`Connection failed: ${json.error}`, 'err');
      }
    } catch (err) {
      addToast(`Connection failed: ${String(err)}`, 'err');
    } finally {
      setCheckingConn(false);
    }
  };

  const fetchPos = useCallback(async () => {
    try {
      const url = '/api/paper/trade' + (isDemo ? '?demo=true' : '');
      const r    = await fetch(url);
      const json = await r.json();
      if (json.success) { setPositions(json.positions); setTrades(json.trades); }
    } catch { /**/ }
  }, [isDemo]);

  const fetchAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const url = '/api/paper/analytics' + (isDemo ? '?demo=true' : '');
      const r = await fetch(url);
      const json = await r.json();
      if (json.success) {
        setAnalytics(json);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [isDemo]);

  // Initial quote fetch (signals + portfolioStats on first load, re-used on SSE error)
  const fetchLive = useCallback(async () => {
    try {
      const url = '/api/fyers/quote' + (isDemo ? '?demo=true' : '');
      const r    = await fetch(url, { cache: 'no-store' });
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
  }, [isDemo]);

  const execSignal = async (sig: ThetaSignal) => {
    if (!sig.legs.length) return;
    setExecuting(sig.id);
    try {
      const url = '/api/paper/trade' + (isDemo ? '?demo=true' : '');
      const r = await fetch(url, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'OPEN', signal: sig, demo: isDemo}),
      });
      const json = await r.json();
      if (json.success) {
        addToast(`Paper trade opened: ${sig.strategy} on ${sig.symbol}`);
        fetchPos();
        fetchAnalytics();
        setTab('positions');
      }
      else addToast(`Error: ${json.error}`, 'err');
    } finally { setExecuting(null); }
  };

  const closePos = async (id: string) => {
    const url = '/api/paper/trade' + (isDemo ? '?demo=true' : '');
    const r = await fetch(url, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({action:'CLOSE', positionId:id, reason:'Manual close', demo: isDemo}),
    });
    const json = await r.json();
    if (json.success) {
      addToast(`Closed. P&L: ${json.position.realizedPnl>=0?'+':''}${fmtRs(json.position.realizedPnl)}`);
      fetchPos();
      fetchAnalytics();
    }
  };

  const resetAcct = async () => {
    if (!confirm('Reset paper account to 5,00,000?')) return;
    const url = '/api/paper/reset' + (isDemo ? '?demo=true' : '');
    await fetch(url, {method:'POST'});
    fetchPos();
    fetchAnalytics();
    addToast('Account reset to 5,00,000');
  };

  const fetchSwingScan = useCallback(async () => {
    setLoadingSwing(true);
    try {
      const url = '/api/swing/scan' + (isDemo ? '?demo=true' : '');
      const r = await fetch(url);
      const json = await r.json();
      if (json.success) {
        setSwingReport(json);
        if (json.watchlist?.length > 0 && !selectedSwingStock) {
          setSelectedSwingStock(json.watchlist[0].symbol);
        }
      } else {
        addToast(json.error || 'Failed to fetch swing scan results', 'err');
      }
    } catch (err) {
      addToast('Failed to fetch swing scan results', 'err');
    } finally {
      setLoadingSwing(false);
    }
  }, [isDemo, selectedSwingStock]);

  const runSwingScan = async () => {
    setLoadingSwing(true);
    try {
      const url = '/api/swing/scan' + (isDemo ? '?demo=true' : '');
      const r = await fetch(url, { method: 'POST' });
      const json = await r.json();
      if (json.success) {
        setSwingReport(json);
        addToast('Quantitative swing scan completed successfully!', 'ok');
        if (json.watchlist?.length > 0) {
          setSelectedSwingStock(json.watchlist[0].symbol);
        }
      } else {
        addToast(json.error || 'Swing scan failed', 'err');
      }
    } catch (err) {
      addToast('Swing scan request failed', 'err');
    } finally {
      setLoadingSwing(false);
    }
  };

  useEffect(() => {
    if (tab === 'swing') {
      fetchSwingScan();
    }
  }, [tab, fetchSwingScan]);

  useEffect(() => {
    if (tab === 'journal') {
      fetchAnalytics();
    }
  }, [tab, fetchAnalytics]);

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
        const nextVix = quotes.find(q => q.symbol === 'NSE:INDIAVIX-INDEX')?.ltp || 15;
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
          <button style={{
            background: 'transparent',
            border: '1px solid #1e2d3d',
            color: '#8aa4b8',
            fontFamily: 'inherit',
            fontSize: 10,
            padding: '6px 12px',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            transition: 'all .15s'
          }}
            onMouseEnter={e=>(e.currentTarget.style.background='rgba(138,164,184,.08)')}
            onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
            onClick={testConnection}
            disabled={checkingConn}
          >{checkingConn ? 'Checking…' : '🔍 Test Conn'}</button>
          <div style={{fontSize:10,color:'#4a6070'}}>↻ {lastTick||'—'}</div>
        </div>
      </div>

      {/* TABS */}
      <div style={{borderBottom:'1px solid #1e2d3d',padding:'0 24px',display:'flex',gap:4}}>
        <button className={`tb ${tab==='live'?'a':''}`} onClick={()=>setTab('live')}>📡 Live Market</button>
        <button className={`tb ${tab==='signals'?'a':''}`} onClick={()=>setTab('signals')}>⚡ Signals {data?.signals?.length?`(${data.signals.length})`:''}</button>
        <button className={`tb ${tab==='positions'?'a':''}`} onClick={()=>setTab('positions')}>📂 Positions {openCount?`(${openCount})`:''}</button>
        <button className={`tb ${tab==='journal'?'a':''}`} onClick={()=>setTab('journal')}>📒 Journal</button>
        <button className={`tb ${tab==='indices'?'a':''}`} onClick={()=>setTab('indices')}>📊 Nifty Indices</button>
        <button className={`tb ${tab==='swing'?'a':''}`} onClick={()=>setTab('swing')}>📈 Swing Trade</button>
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
            <div style={{display:'flex',gap:12,justifyContent:'center'}}>
              <a href="/fyers-login" style={{textDecoration:'none'}}>
                <button className="btn btng" style={{fontSize:12,padding:'12px 24px',fontWeight:600}}>
                  ⚡ Connect Fyers Account
                </button>
              </a>
              <button className="btn" onClick={testConnection} disabled={checkingConn} style={{fontSize:12,padding:'12px 24px'}}>
                {checkingConn ? 'Checking…' : '🔍 Test Connection'}
              </button>
            </div>
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

        ) : tab==='swing' ? (
          <div>
            {loadingSwing ? (
              <div style={{textAlign:'center',padding:80,color:'#4a6070'}}>
                <div style={{fontSize:24,marginBottom:12}}>⚡</div>
                <div style={{color:'#e8b86d',fontSize:13}}>Executing Quantitative Swing Scan...</div>
                <div style={{color:'#4a6070',fontSize:11,marginTop:8}}>Scanning Nifty 200 list & calculating multi-stage indicators via Fyers API</div>
              </div>
            ) : !swingReport ? (
              <div className="card" style={{textAlign:'center',padding:60}}>
                <div style={{fontSize:32,marginBottom:16}}>📈</div>
                <div style={{fontFamily:'Syne',fontSize:18,fontWeight:700,color:'#e8b86d',marginBottom:12}}>Swing Trading Scanner & Analyst</div>
                <p style={{color:'#8aa4b8',fontSize:13,lineHeight:1.7,maxWidth:600,margin:'0 auto 24px'}}>
                  Identify high-probability weekly breakouts, volume expansions, and relative strength leaders across Nifty 200 / F&O universe.
                </p>
                <button className="btn btn-g" onClick={runSwingScan}>⚡ Run Scanner Now</button>
              </div>
            ) : (
              <div className="fi">
                {/* Scanner Header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:16}}>
                  <div>
                    <div style={{fontFamily:'Syne',fontSize:16,fontWeight:800,color:'#e8b86d'}}>Professional Swing Trading Scanner & Analyst</div>
                    <div style={{fontSize:10,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.1em',marginTop:4}}>
                      Stage 1-12 Rule-Based Model · Last Scan: {swingReport.scannedAt ? new Date(swingReport.scannedAt).toLocaleTimeString('en-IN') : 'Just now'} {swingReport.isCached ? '(Cached)' : '(Fresh)'}
                    </div>
                  </div>
                  <button className="btn btn-g" onClick={runSwingScan} disabled={loadingSwing}>
                    {loadingSwing ? 'Scanning…' : '⚡ Run Fresh Scan'}
                  </button>
                </div>

                {/* STAGE 1: Market Environment Filter */}
                <div className="card" style={{marginBottom:20,borderLeft:`3px solid ${RC[swingReport.marketSummary.status]?.color || '#60a5fa'}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:12}}>
                    <div style={{fontFamily:'Syne',fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d'}}>Stage 1: Market Environment Filter</div>
                    <span className="pill" style={{
                      background: RC[swingReport.marketSummary.status]?.bg || 'rgba(96,165,250,.07)',
                      border: `1px solid ${RC[swingReport.marketSummary.status]?.border || 'rgba(96,165,250,.2)'}`,
                      color: RC[swingReport.marketSummary.status]?.color || '#60a5fa',
                      fontWeight: 600,
                      fontSize: 11
                    }}>
                      {swingReport.marketSummary.status}
                    </span>
                  </div>
                  <p style={{fontSize:12,color:'#8aa4b8',margin:'0 0 14px 0',lineHeight:1.7}}>{swingReport.marketSummary.reasoning}</p>
                  
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,fontSize:11}}>
                    <div style={{padding:'8px 12px',background:'#070c10',border:'1px solid #1e2d3d'}}>
                      <span style={{color:'#4a6070'}}>Nifty 50 Trend: </span>
                      <span style={{color:'#c8d8e8',fontFamily:'monospace'}}>{swingReport.marketSummary.niftyStatus}</span>
                    </div>
                    <div style={{padding:'8px 12px',background:'#070c10',border:'1px solid #1e2d3d'}}>
                      <span style={{color:'#4a6070'}}>Bank Nifty Trend: </span>
                      <span style={{color:'#c8d8e8',fontFamily:'monospace'}}>{swingReport.marketSummary.bankNiftyStatus}</span>
                    </div>
                    <div style={{padding:'8px 12px',background:'#070c10',border:'1px solid #1e2d3d'}}>
                      <span style={{color:'#4a6070'}}>Market Breadth: </span>
                      <span style={{color:'#4ade80',fontWeight:600}}>{swingReport.marketSummary.breadthStatus}</span>
                    </div>
                  </div>
                </div>

                {/* Sub tabs for swing */}
                <div style={{display:'flex',gap:6,borderBottom:'1px solid #1e2d3d',marginBottom:16,paddingBottom:1,overflowX:'auto'}}>
                  {[
                    {id:'watchlist',label:'📋 Top Watchlist'},
                    {id:'details',label:'🔍 Setup Analysis'},
                    {id:'portfolio',label:'💼 Risk & Allocation'},
                    {id:'avoid',label:'⚠️ Avoid List & Rules'},
                  ].map(sb=>(
                    <button key={sb.id} className={`tb ${activeSwingTab===sb.id?'a':''}`} onClick={()=>setActiveSwingTab(sb.id as any)} style={{fontSize:11,padding:'6px 14px'}}>
                      {sb.label}
                    </button>
                  ))}
                </div>

                {/* Sub Tab contents */}
                {activeSwingTab === 'watchlist' && (
                  <div className="card fi" style={{padding:0,overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',minWidth:800}}>
                      <thead>
                        <tr style={{borderBottom:'1px solid #1e2d3d',background:'rgba(30,45,61,0.2)'}}>
                          {['Rank','Stock','Sector','Setup Type','Score','Suggested Entry','Stop Loss','Target 2R','Target 3R','Risk %','Action'].map(h=>(
                            <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:9,textTransform:'uppercase',letterSpacing:'.1em',color:'#4a6070',fontWeight:400}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {swingReport.watchlist.map((st: any, idx: number) => {
                          const isTop3 = idx < 3;
                          const highlightBorder = isTop3 ? '3px solid #e8b86d' : '1px solid rgba(30,45,61,.4)';
                          const setupBg = st.setup.includes('Weekly') ? 'rgba(74,222,128,.1)' : (st.setup.includes('VCP') ? 'rgba(167,139,250,.1)' : 'rgba(96,165,250,.1)');
                          const setupBorder = st.setup.includes('Weekly') ? 'rgba(74,222,128,.25)' : (st.setup.includes('VCP') ? 'rgba(167,139,250,.25)' : 'rgba(96,165,250,.25)');
                          const setupColor = st.setup.includes('Weekly') ? '#4ade80' : (st.setup.includes('VCP') ? '#a78bfa' : '#60a5fa');
                          
                          return (
                            <tr key={st.symbol} style={{
                              borderBottom:'1px solid rgba(30,45,61,.4)',
                              borderLeft: highlightBorder,
                              background: isTop3 ? 'rgba(232,184,109,0.02)' : 'transparent',
                              cursor: 'pointer'
                            }} onClick={() => {
                              setSelectedSwingStock(st.symbol);
                              setActiveSwingTab('details');
                            }}>
                              <td style={{padding:'12px 14px',fontFamily:'Syne',fontWeight:700,color:isTop3?'#e8b86d':'#4a6070'}}>
                                {idx + 1} {isTop3 && <span style={{fontSize:8,background:'rgba(232,184,109,.15)',color:'#e8b86d',padding:'1px 4px',borderRadius:2,marginLeft:4}}>★</span>}
                              </td>
                              <td style={{padding:'12px 14px'}}>
                                <div style={{fontFamily:'Syne',fontWeight:700,color:'#f0f4f8'}}>{st.symbol.split(':')[1]?.replace('-EQ','')}</div>
                                <div style={{fontSize:10,color:'#4a6070'}}>{st.name}</div>
                              </td>
                              <td style={{padding:'12px 14px',color:'#8aa4b8'}}>{st.sector}</td>
                              <td style={{padding:'12px 14px'}}>
                                <span className="pill" style={{background:setupBg,border:`1px solid ${setupBorder}`,color:setupColor}}>{st.setup.split(': ')[1] || st.setup}</span>
                              </td>
                              <td style={{padding:'12px 14px',fontFamily:'monospace',fontWeight:600,color:st.scoring.total>=90?'#4ade80':(st.scoring.total>=80?'#fbbf24':'#8aa4b8')}}>
                                {st.scoring.total}
                              </td>
                              <td style={{padding:'12px 14px',color:'#e8b86d',fontWeight:600}}>₹{fmt(st.atrRisk.suggestedEntry,1)}</td>
                              <td style={{padding:'12px 14px',color:'#f87171'}}>₹{fmt(st.atrRisk.stopLoss,1)}</td>
                              <td style={{padding:'12px 14px',color:'#4ade80'}}>₹{fmt(st.atrRisk.target2R,1)}</td>
                              <td style={{padding:'12px 14px',color:'#60a5fa'}}>₹{fmt(st.atrRisk.target3R,1)}</td>
                              <td style={{padding:'12px 14px',color:'#f87171',fontFamily:'monospace'}}>{st.atrRisk.riskPct.toFixed(1)}%</td>
                              <td style={{padding:'12px 14px'}}>
                                <button className="btn" style={{fontSize:8,padding:'4px 8px'}} onClick={(e)=>{
                                  e.stopPropagation();
                                  setSelectedSwingStock(st.symbol);
                                  setActiveSwingTab('details');
                                }}>View Setup</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeSwingTab === 'details' && (
                  <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:16,alignItems:'flex-start'}}>
                    {/* Left sidebar select */}
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      <div style={{fontSize:9,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.1em',paddingLeft:4,marginBottom:4}}>Scanned Leaders</div>
                      {swingReport.watchlist.map((st: any) => {
                        const isSelected = selectedSwingStock === st.symbol;
                        return (
                          <button key={st.symbol} onClick={()=>setSelectedSwingStock(st.symbol)} style={{
                            padding:'10px 12px',
                            background: isSelected ? '#1e2d3d' : '#0d1219',
                            border: `1px solid ${isSelected ? '#e8b86d' : '#1e2d3d'}`,
                            color: isSelected ? '#e8b86d' : '#8aa4b8',
                            textAlign: 'left',
                            fontFamily: 'Syne',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: 11,
                            transition: 'all .15s'
                          }}>
                            {st.symbol.split(':')[1]?.replace('-EQ','')}
                            <div style={{fontSize:9,fontWeight:400,color:'#4a6070',fontFamily:'monospace',marginTop:2}}>Score: {st.scoring.total}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Right details content */}
                    {(() => {
                      const st = swingReport.watchlist.find((x: any) => x.symbol === selectedSwingStock) || swingReport.watchlist[0];
                      if (!st) return <div className="card">No stock selected.</div>;
                      const setupBg = st.setup.includes('Weekly') ? 'rgba(74,222,128,.1)' : (st.setup.includes('VCP') ? 'rgba(167,139,250,.1)' : 'rgba(96,165,250,.1)');
                      const setupBorder = st.setup.includes('Weekly') ? 'rgba(74,222,128,.25)' : (st.setup.includes('VCP') ? 'rgba(167,139,250,.25)' : 'rgba(96,165,250,.25)');
                      const setupColor = st.setup.includes('Weekly') ? '#4ade80' : (st.setup.includes('VCP') ? '#a78bfa' : '#60a5fa');
                      
                      return (
                        <div className="card fi" style={{padding:24}}>
                          {/* Stock Header */}
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',borderBottom:'1px solid #1e2d3d',paddingBottom:16,marginBottom:20}}>
                            <div>
                              <div style={{display:'flex',alignItems:'center',gap:10}}>
                                <span style={{fontFamily:'Syne',fontSize:20,fontWeight:800,color:'#f0f4f8'}}>{st.symbol.split(':')[1]?.replace('-EQ','')}</span>
                                <span className="pill" style={{background:setupBg,border:`1px solid ${setupBorder}`,color:setupColor}}>{st.setup}</span>
                              </div>
                              <div style={{fontSize:11,color:'#8aa4b8',marginTop:4}}>{st.name} · Sector: {st.sector}</div>
                            </div>
                            <div style={{textAlign:'right'}}>
                              <div style={{fontSize:9,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.1em'}}>Technical Score</div>
                              <div style={{fontFamily:'Syne',fontSize:24,fontWeight:800,color:st.scoring.total>=90?'#4ade80':(st.scoring.total>=80?'#fbbf24':'#8aa4b8')}}>{st.scoring.total} <span style={{fontSize:12,color:'#4a6070',fontWeight:400}}>/100</span></div>
                            </div>
                          </div>

                          {/* Analysis details grids */}
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16,marginBottom:20}}>
                            {/* Scoring Model Grid */}
                            <div style={{padding:'14px 16px',background:'#070c10',border:'1px solid #1e2d3d'}}>
                              <div style={{fontFamily:'Syne',fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'#e8b86d',marginBottom:12}}>Stage 9: Scoring Breakdown</div>
                              {[
                                {label:'Weekly Breakout (25)',val:st.scoring.weeklyBreakout,max:25},
                                {label:'Trend Strength (20)',val:st.scoring.trendStrength,max:20},
                                {label:'Relative Strength (20)',val:st.scoring.relativeStrength,max:20},
                                {label:'Volume Expansion (15)',val:st.scoring.volumeExpansion,max:15},
                                {label:'Risk Reward Ratios (10)',val:st.scoring.riskReward,max:10},
                                {label:'Market Alignment (10)',val:st.scoring.marketAlignment,max:10},
                              ].map(sc => (
                                <div key={sc.label} style={{marginBottom:8}}>
                                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginBottom:2}}>
                                    <span style={{color:'#8aa4b8'}}>{sc.label}</span>
                                    <span style={{color:'#c8d8e8',fontFamily:'monospace'}}>{sc.val}</span>
                                  </div>
                                  <div style={{height:4,background:'#1e2d3d',borderRadius:2}}>
                                    <div style={{height:'100%',background:'#e8b86d',borderRadius:2,width:`${(sc.val/sc.max)*100}%`}}></div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Trend & Volume Analysis */}
                            <div style={{padding:'14px 16px',background:'#070c10',border:'1px solid #1e2d3d',display:'flex',flexDirection:'column',gap:10}}>
                              <div style={{fontFamily:'Syne',fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'#e8b86d',marginBottom:2}}>Stage 3 & 5: Trend & Volume</div>
                              
                              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,paddingBottom:6,borderBottom:'1px solid #1e2d3d'}}>
                                <span style={{color:'#4a6070'}}>Daily Moving Averages</span>
                                <span style={{color:'#4ade80',fontWeight:600}}>{"20 > 50 > 200 EMA (OK)"}</span>
                              </div>
                              
                              <div style={{display:'flex',justifyContent:'space-between',fontSize:10}}>
                                <span style={{color:'#8aa4b8'}}>Close vs 20 / 50 / 200 EMA:</span>
                                <span style={{color:'#c8d8e8'}}>₹{fmt(st.dailyTrend.ema20,0)} / ₹{fmt(st.dailyTrend.ema50,0)} / ₹{fmt(st.dailyTrend.ema200,0)}</span>
                              </div>

                              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,paddingTop:6,paddingBottom:6,borderBottom:'1px solid #1e2d3d',borderTop:'1px solid #1e2d3d'}}>
                                <span style={{color:'#4a6070'}}>Volume Ratio (20D Avg)</span>
                                <span style={{
                                  color: st.volumeAnalysis.rating==='Exceptional'?'#4ade80':(st.volumeAnalysis.rating==='Very Good'?'#fbbf24':'#60a5fa'),
                                  fontWeight:600
                                }}>
                                  {st.volumeAnalysis.volumeRatio.toFixed(2)}x ({st.volumeAnalysis.rating})
                                </span>
                              </div>

                              <p style={{fontSize:10,color:'#8aa4b8',lineHeight:1.6,margin:0}}>{st.volumeAnalysis.description}</p>
                            </div>
                          </div>

                          {/* Relative strength, ATR and Next Day execution */}
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16,marginBottom:20}}>
                            {/* Stage 4 Relative Strength */}
                            <div style={{padding:'14px 16px',background:'#070c10',border:'1px solid #1e2d3d'}}>
                              <div style={{fontFamily:'Syne',fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'#e8b86d',marginBottom:12}}>Stage 4: Relative Strength vs Nifty</div>
                              
                              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,paddingBottom:4,borderBottom:'1px solid #1e2d3d',marginBottom:8}}>
                                <span style={{color:'#4a6070'}}>Timeframe</span>
                                <span style={{color:'#4a6070'}}>Stock Return vs Nifty</span>
                                <span style={{color:'#4a6070'}}>Alpha</span>
                              </div>

                              {[
                                {tf:'5 Day',stock:st.relativeStrength.perf5D,nifty:st.relativeStrength.nifty5D,alpha:st.relativeStrength.alpha5D},
                                {tf:'20 Day',stock:st.relativeStrength.perf20D,nifty:st.relativeStrength.nifty20D,alpha:st.relativeStrength.alpha20D},
                                {tf:'60 Day',stock:st.relativeStrength.perf60D,nifty:st.relativeStrength.nifty60D,alpha:st.relativeStrength.alpha60D},
                              ].map(rs => (
                                <div key={rs.tf} style={{display:'flex',justifyContent:'space-between',fontSize:10,marginBottom:6}}>
                                  <span style={{color:'#8aa4b8'}}>{rs.tf}</span>
                                  <span style={{color:'#c8d8e8'}}>{rs.stock.toFixed(1)}% vs {rs.nifty.toFixed(1)}%</span>
                                  <span style={{color:rs.alpha>=0?'#4ade80':'#f87171',fontWeight:600}}>{rs.alpha>=0?'+':''}{rs.alpha.toFixed(1)}%</span>
                                </div>
                              ))}
                              
                              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginTop:12,paddingTop:8,borderTop:'1px solid #1e2d3d'}}>
                                <span style={{color:'#4a6070'}}>Relative Strength Rank</span>
                                <span style={{color:'#4ade80',fontWeight:700}}>{st.relativeStrength.rank}</span>
                              </div>
                            </div>

                            {/* Stage 7 ATR Risk Planning */}
                            <div style={{padding:'14px 16px',background:'#070c10',border:'1px solid #1e2d3d'}}>
                              <div style={{fontFamily:'Syne',fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'#e8b86d',marginBottom:12}}>Stage 7: ATR Risk Management</div>
                              
                              <div style={{display:'flex',flexDirection:'column',gap:8,fontSize:10}}>
                                <div style={{display:'flex',justifyContent:'space-between'}}>
                                  <span style={{color:'#8aa4b8'}}>Average True Range (ATR 14):</span>
                                  <span style={{color:'#c8d8e8',fontFamily:'monospace'}}>₹{st.atrRisk.atr.toFixed(2)}</span>
                                </div>
                                <div style={{display:'flex',justifyContent:'space-between'}}>
                                  <span style={{color:'#8aa4b8'}}>Suggested Entry:</span>
                                  <span style={{color:'#e8b86d',fontWeight:600}}>₹{st.atrRisk.suggestedEntry.toFixed(2)}</span>
                                </div>
                                <div style={{display:'flex',justifyContent:'space-between'}}>
                                  <span style={{color:'#8aa4b8'}}>ATR-Based Stop Loss (1.5 ATR):</span>
                                  <span style={{color:'#f87171',fontWeight:600}}>₹{st.atrRisk.stopLoss.toFixed(2)}</span>
                                </div>
                                <div style={{display:'flex',justifyContent:'space-between',paddingBottom:4,borderBottom:'1px solid #1e2d3d'}}>
                                  <span style={{color:'#8aa4b8'}}>1R Risk Distance:</span>
                                  <span style={{color:'#f87171'}}>₹{st.atrRisk.risk1R.toFixed(2)} ({st.atrRisk.riskPct.toFixed(1)}%)</span>
                                </div>
                                <div style={{display:'flex',justifyContent:'space-between'}}>
                                  <span style={{color:'#8aa4b8'}}>2R Target Level:</span>
                                  <span style={{color:'#4ade80'}}>₹{st.atrRisk.target2R.toFixed(2)}</span>
                                </div>
                                <div style={{display:'flex',justifyContent:'space-between'}}>
                                  <span style={{color:'#8aa4b8'}}>3R Target Level:</span>
                                  <span style={{color:'#60a5fa'}}>₹{st.atrRisk.target3R.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Next day execution blueprint */}
                          <div style={{padding:'16px 20px',background:'rgba(232,184,109,0.03)',border:'1px solid rgba(232,184,109,0.15)',marginBottom:20}}>
                            <div style={{fontFamily:'Syne',fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:12}}>Stage 8: Next-Day Execution Blueprint (9:45 AM)</div>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14,fontSize:11,marginBottom:12}}>
                              <div>
                                <div style={{color:'#4a6070',marginBottom:4}}>ENTRY TRIGGER</div>
                                <div style={{color:'#e8b86d',fontSize:14,fontWeight:700}}>₹{st.executionPlan.entryTrigger.toFixed(2)}</div>
                              </div>
                              <div>
                                <div style={{color:'#4a6070',marginBottom:4}}>ENTRY ZONE</div>
                                <div style={{color:'#c8d8e8',fontSize:13,fontWeight:600}}>{st.executionPlan.entryZone}</div>
                              </div>
                              <div>
                                <div style={{color:'#4a6070',marginBottom:4}}>STOP LOSS (ATR)</div>
                                <div style={{color:'#f87171',fontSize:13,fontWeight:600}}>₹{st.executionPlan.stopLoss.toFixed(2)}</div>
                              </div>
                              <div>
                                <div style={{color:'#4a6070',marginBottom:4}}>TARGET LEVELS (1R / 2R / 3R)</div>
                                <div style={{color:'#4ade80',fontSize:13,fontWeight:600}}>₹{st.executionPlan.target1.toFixed(0)} / ₹{st.executionPlan.target2.toFixed(0)} / ₹{st.executionPlan.target3.toFixed(0)}</div>
                              </div>
                            </div>

                            <div style={{fontSize:11,color:'#8aa4b8',lineHeight:1.7,borderTop:'1px solid rgba(232,184,109,0.15)',paddingTop:10}}>
                              <span style={{color:'#e8b86d',fontWeight:600}}>Risk Formula: </span>
                              {st.executionPlan.positionSizeFormula}
                              <br /><span style={{color:'#8aa4b8',fontWeight:600,display:'inline-block',marginTop:4}}>Execution Rules: </span> {st.executionPlan.specialNotes}
                            </div>
                          </div>

                          {/* Expectation parameters */}
                          <div style={{padding:'14px 16px',background:'#0d1219',border:'1px solid #1e2d3d'}}>
                            <div style={{fontFamily:'Syne',fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'#e8b86d',marginBottom:12}}>Stage 12: Performance Expectation & Catalyst</div>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,fontSize:10,marginBottom:10}}>
                              <div>
                                <span style={{color:'#4a6070'}}>Holding Period: </span>
                                <span style={{color:'#c8d8e8',fontWeight:600}}>{st.expectation.expectedHoldingPeriod}</span>
                              </div>
                              <div>
                                <span style={{color:'#4a6070'}}>Probability Rating: </span>
                                <span style={{color:'#4ade80',fontWeight:600}}>{st.expectation.probabilityRating}</span>
                              </div>
                              <div>
                                <span style={{color:'#4a6070'}}>Risk Rating: </span>
                                <span style={{color:'#fbbf24',fontWeight:600}}>{st.expectation.riskRating}</span>
                              </div>
                              <div>
                                <span style={{color:'#4a6070'}}>Confidence Rating: </span>
                                <span style={{color:'#4ade80',fontWeight:600}}>{st.expectation.confidenceRating}</span>
                              </div>
                            </div>
                            <div style={{fontSize:10,color:'#8aa4b8',lineHeight:1.6}}>
                              <span style={{color:'#e8b86d',fontWeight:600}}>Key Catalyst: </span>{st.expectation.catalyst}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {activeSwingTab === 'portfolio' && (
                  <div className="card fi" style={{padding:20}}>
                    <div style={{fontFamily:'Syne',fontWeight:700,fontSize:13,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:8}}>Stage 11: Portfolio Allocation & Capital Risk Planner</div>
                    <p style={{fontSize:12,color:'#8aa4b8',lineHeight:1.7,margin:'0 0 16px 0'}}>
                      Risk management calculation assuming total capital of <strong style={{color:'#e8b86d'}}>₹5,00,000</strong>. Each swing trade is restricted to a maximum risk of <strong style={{color:'#f87171'}}>1% (₹5,000)</strong> of capital. Maximum concurrent open swing positions are capped at <strong style={{color:'#60a5fa'}}>5 positions</strong>, and sector exposure is capped at <strong style={{color:'#fbbf24'}}>30% (₹1,50,000)</strong> to prevent correlated sector drawdowns.
                    </p>

                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',minWidth:760}}>
                        <thead>
                          <tr style={{borderBottom:'1px solid #1e2d3d',background:'rgba(30,45,61,0.2)'}}>
                            {['Stock Symbol','Sector','Suggested Entry','Risk Per Share','Shares to Buy','Allocated Capital','Total Trade Risk','Sector limit status'].map(h=>(
                              <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:9,textTransform:'uppercase',letterSpacing:'.1em',color:'#4a6070',fontWeight:400}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {swingReport.watchlist.map((st: any) => {
                            const riskPerShare = st.atrRisk.risk1R;
                            const positionSize = Math.floor(5000 / riskPerShare);
                            const capitalAllocation = positionSize * st.atrRisk.suggestedEntry;
                            const totalRisk = positionSize * riskPerShare;
                            const sectorAllocated = swingReport.watchlist
                              .filter((x: any) => x.sector === st.sector)
                              .slice(0, 3)
                              .reduce((s: number, x: any) => s + (Math.floor(5000 / x.atrRisk.risk1R) * x.atrRisk.suggestedEntry), 0);
                            
                            const sectorWarning = sectorAllocated > 150000;
                            
                            return (
                              <tr key={st.symbol} style={{borderBottom:'1px solid rgba(30,45,61,.4)'}}>
                                <td style={{padding:'12px 14px',fontFamily:'Syne',fontWeight:700,color:'#f0f4f8'}}>{st.symbol.split(':')[1]?.replace('-EQ','')}</td>
                                <td style={{padding:'12px 14px',color:'#8aa4b8'}}>{st.sector}</td>
                                <td style={{padding:'12px 14px',color:'#e8b86d',fontFamily:'monospace'}}>₹{fmt(st.atrRisk.suggestedEntry,1)}</td>
                                <td style={{padding:'12px 14px',color:'#f87171',fontFamily:'monospace'}}>₹{fmt(riskPerShare,1)}</td>
                                <td style={{padding:'12px 14px',fontWeight:600,color:'#c8d8e8',fontFamily:'monospace'}}>{positionSize}</td>
                                <td style={{padding:'12px 14px',color:'#60a5fa',fontFamily:'monospace'}}>₹{fmt(capitalAllocation,0)}</td>
                                <td style={{padding:'12px 14px',color:'#f87171',fontFamily:'monospace'}}>₹{fmt(totalRisk,0)}</td>
                                <td style={{padding:'12px 14px'}}>
                                  <span className="pill" style={{
                                    background: sectorWarning ? 'rgba(248,113,113,.1)' : 'rgba(74,222,128,.1)',
                                    border: `1px solid ${sectorWarning ? 'rgba(248,113,113,.25)' : 'rgba(74,222,128,.25)'}`,
                                    color: sectorWarning ? '#f87171' : '#4ade80'
                                  }}>
                                    {sectorWarning ? 'Sector limit warning' : 'Safe'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeSwingTab === 'avoid' && (
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,alignItems:'flex-start',flexWrap:'wrap'}}>
                    {/* Stocks to avoid */}
                    <div className="card fi" style={{padding:20}}>
                      <div style={{fontFamily:'Syne',fontWeight:700,fontSize:13,textTransform:'uppercase',letterSpacing:'.1em',color:'#f87171',marginBottom:12}}>Filtered: Stocks to Avoid & Reasons</div>
                      <div style={{display:'flex',flexDirection:'column',gap:12}}>
                        {swingReport.stocksToAvoid.map((av: any) => (
                          <div key={av.symbol} style={{padding:'10px 14px',background:'rgba(248,113,113,0.02)',border:'1px solid rgba(248,113,113,0.15)',display:'flex',gap:12}}>
                            <span className="badge" style={{borderColor:'rgba(248,113,113,0.3)',background:'rgba(248,113,113,0.1)',color:'#f87171'}}>✕</span>
                            <div>
                              <div style={{fontFamily:'Syne',fontWeight:700,color:'#f87171'}}>{av.symbol.split(':')[1]?.replace('-EQ','')}</div>
                              <div style={{fontSize:11,color:'#8aa4b8',lineHeight:1.5,marginTop:2}}>{av.reason}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Quantitative Swing Trading Guidelines */}
                    <div className="card fi" style={{padding:20}}>
                      <div style={{fontFamily:'Syne',fontWeight:700,fontSize:13,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:12}}>Professional Watchlist Execution Rules</div>
                      <ul style={{fontSize:12,color:'#8aa4b8',lineHeight:1.8,paddingLeft:20,margin:0}}>
                        <li><strong style={{color:'#e8b86d'}}>9:45 AM Entry Rule:</strong> Never buy a stock in the first 15 minutes of the trade day. Allow initial morning volatility to settle.</li>
                        <li><strong style={{color:'#e8b86d'}}>Minervini Trend Template:</strong> Trade only stocks with rising daily EMAs where {"20 > 50 > 200 EMA"} and price resides above 200 EMA.</li>
                        <li><strong style={{color:'#e8b86d'}}>Relative Strength Focus:</strong> Prioritize leaders outperforming the index benchmark (positive alpha score). Sell weak performers immediately.</li>
                        <li><strong style={{color:'#e8b86d'}}>1% Portfolio Risk limit:</strong> Capped trade risk at 1% of total portfolio value (₹5,000). Never override position sizes.</li>
                        <li><strong style={{color:'#e8b86d'}}>Stop Loss Discipline:</strong> Place stop loss strictly on entry trigger, and use average true range (1.5x ATR) to establish stop margins.</li>
                        <li><strong style={{color:'#e8b86d'}}>Sector Diversification:</strong> Maximum sector allocation limit is 30%. Prevent taking concentrated hits in single sectors.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        ) : tab==='indices' ? (
          <div>
            <div style={{fontFamily:'Syne',fontSize:14,fontWeight:700,color:'#e8b86d',marginBottom:4}}>Nifty Indices — Live Overview</div>
            <div style={{fontSize:10,color:'#4a6070',marginBottom:20,textTransform:'uppercase',letterSpacing:'.08em'}}>
              Real-time data · NSE · {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString('en-IN') : '—'}
            </div>

            {/* Summary comparison bar */}
            {data?.quotes && data.quotes.length > 0 && (
              <div className="card" style={{marginBottom:16}}>
                <div style={{fontFamily:'Syne',fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:14}}>Performance Snapshot (% Change)</div>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {data.quotes.map(q => {
                    const isVix = q.symbol.includes('VIX');
                    const pctVal = safe(q.changePct);
                    const isPos = pctVal >= 0;
                    const barColor = isVix
                      ? (pctVal > 0 ? '#f87171' : '#4ade80')
                      : (isPos ? '#4ade80' : '#f87171');
                    const maxPct = 3;
                    const barW = Math.min(100, (Math.abs(pctVal) / maxPct) * 50);
                    return (
                      <div key={q.symbol} style={{display:'flex',alignItems:'center',gap:12}}>
                        <div style={{width:100,fontSize:10,color:'#8aa4b8',textTransform:'uppercase',letterSpacing:'.06em',flexShrink:0}}>{SYM[q.symbol]||q.symbol}</div>
                        <div style={{flex:1,display:'flex',alignItems:'center',position:'relative',height:18}}>
                          <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,background:'#1e2d3d'}}></div>
                          {isPos ? (
                            <div style={{position:'absolute',left:'50%',height:10,top:4,width:`${barW}%`,background:barColor,opacity:.8,borderRadius:'0 2px 2px 0'}}></div>
                          ) : (
                            <div style={{position:'absolute',right:`${50}%`,height:10,top:4,width:`${barW}%`,background:barColor,opacity:.8,borderRadius:'2px 0 0 2px',transform:'translateX(100%)',marginLeft:0}}></div>
                          )}
                        </div>
                        <div style={{width:70,textAlign:'right',fontSize:11,fontWeight:600,color:barColor,flexShrink:0}}>{pct(pctVal)}</div>
                        <div style={{width:90,textAlign:'right',fontSize:11,color:'#f0f4f8',flexShrink:0}}>{isVix ? safe(q.ltp).toFixed(2) : fmt(q.ltp,2)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Full index cards grid */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14,marginBottom:20}}>
              {(data?.quotes || []).map(q => {
                const isVix = q.symbol.includes('VIX');
                const cc = q.changePct >= 0 ? '#4ade80' : '#f87171';
                const vixCC = q.changePct >= 0 ? '#f87171' : '#4ade80';
                const changeColor = isVix ? vixCC : cc;
                const range = safe(q.high) - safe(q.low);
                const rangePct = range > 0 ? ((safe(q.ltp) - safe(q.low)) / range) * 100 : 50;
                const dayChangePct = q.open > 0 ? ((safe(q.ltp) - safe(q.open)) / safe(q.open)) * 100 : 0;
                const su = NIFTY_INDEX_META[q.symbol];
                return (
                  <div key={q.symbol} className="card" style={{position:'relative',overflow:'hidden'}}>
                    {/* top accent bar */}
                    <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:changeColor,opacity:.7}}></div>

                    {/* Header */}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                      <div>
                        <div style={{fontSize:10,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.12em',marginBottom:4}}>{SYM[q.symbol]||q.symbol}</div>
                        {su && <div style={{fontSize:9,color:'#4a6070',marginBottom:6}}>{su.desc}</div>}
                        <div style={{fontFamily:'Syne',fontSize:28,fontWeight:800,color:'#f0f4f8',lineHeight:1}}>
                          {isVix ? safe(q.ltp).toFixed(2) : fmt(q.ltp,2)}
                        </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:16,fontWeight:700,color:changeColor}}>{pct(q.changePct)}</div>
                        <div style={{fontSize:11,color:changeColor}}>{q.change >= 0 ? '+' : ''}{fmt(q.change,2)}</div>
                        {su && (
                          <div style={{marginTop:6,padding:'2px 8px',background:su.bg,border:`1px solid ${su.border}`,color:su.color,fontSize:9,letterSpacing:'.06em',textTransform:'uppercase',display:'inline-block'}}>{su.label}</div>
                        )}
                      </div>
                    </div>

                    {/* OHLC grid */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginBottom:12,paddingBottom:12,borderBottom:'1px solid #1e2d3d'}}>
                      {[
                        {l:'OPEN', v:fmt(q.open,2), c:'#8aa4b8'},
                        {l:'HIGH', v:fmt(q.high,2), c:'#4ade80'},
                        {l:'LOW',  v:fmt(q.low,2),  c:'#f87171'},
                        {l:'PREV', v:fmt(q.close,2),c:'#4a6070'},
                      ].map(s=>(
                        <div key={s.l}>
                          <div style={{fontSize:8,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:2}}>{s.l}</div>
                          <div style={{fontSize:11,color:s.c}}>{s.v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Day range bar */}
                    <div style={{marginBottom:12}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#4a6070',marginBottom:4}}>
                        <span>Day Range</span>
                        <span style={{color:'#8aa4b8'}}>{fmt(q.low,2)} – {fmt(q.high,2)}</span>
                      </div>
                      <div style={{height:6,background:'#111820',borderRadius:3,overflow:'hidden',position:'relative'}}>
                        <div style={{
                          position:'absolute',
                          left:`${Math.max(0,Math.min(95,rangePct))}%`,
                          top:0,bottom:0,
                          width:4,height:6,
                          background:changeColor,
                          transform:'translateX(-50%)',
                          borderRadius:2,
                          transition:'left .5s ease'
                        }}></div>
                        <div style={{height:'100%',background:`linear-gradient(90deg,#f87171 0%,${changeColor} ${rangePct}%,#1e2d3d ${rangePct}%)`}}></div>
                      </div>
                    </div>

                    {/* Extra stats row */}
                    <div style={{display:'flex',gap:16,fontSize:10,flexWrap:'wrap'}}>
                      {!isVix && safe(q.volume) > 0 && (
                        <div>
                          <span style={{color:'#4a6070'}}>Vol </span>
                          <span style={{color:'#8aa4b8'}}>{(safe(q.volume)/1e6).toFixed(2)}M</span>
                        </div>
                      )}
                      <div>
                        <span style={{color:'#4a6070'}}>From Open </span>
                        <span style={{color:dayChangePct>=0?'#4ade80':'#f87171'}}>{dayChangePct>=0?'+':''}{dayChangePct.toFixed(2)}%</span>
                      </div>
                      {!isVix && q.oi != null && safe(q.oi) > 0 && (
                        <div>
                          <span style={{color:'#4a6070'}}>OI </span>
                          <span style={{color:'#8aa4b8'}}>{(safe(q.oi)/1e5).toFixed(1)}L</span>
                        </div>
                      )}
                      {isVix && (
                        <div>
                          <span style={{color:'#4a6070'}}>Regime </span>
                          <span style={{color:RC[data?.regime||'NORMAL']?.color}}>{data?.regime||'—'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Indices comparison table */}
            {data?.quotes && data.quotes.length > 0 && (
              <div className="card" style={{marginBottom:16,overflowX:'auto'}}>
                <div style={{fontFamily:'Syne',fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:14}}>Indices Comparison Table</div>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:560}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #1e2d3d'}}>
                      {['Index','LTP','Change','Chg %','Open','High','Low','Prev Close','Volume'].map(h=>(
                        <th key={h} style={{padding:'8px 12px',textAlign:h==='Index'?'left':'right',fontSize:9,textTransform:'uppercase',letterSpacing:'.1em',color:'#4a6070',fontWeight:400}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.quotes.map(q => {
                      const isVix = q.symbol.includes('VIX');
                      const cc = q.changePct >= 0 ? '#4ade80' : '#f87171';
                      const changeColor = isVix ? (q.changePct >= 0 ? '#f87171' : '#4ade80') : cc;
                      return (
                        <tr key={q.symbol} style={{borderBottom:'1px solid rgba(30,45,61,.4)'}}>
                          <td style={{padding:'10px 12px',fontFamily:'Syne',fontWeight:700,color:'#f0f4f8',fontSize:12}}>{SYM[q.symbol]||q.symbol}</td>
                          <td style={{padding:'10px 12px',textAlign:'right',color:'#f0f4f8',fontWeight:600}}>{isVix?safe(q.ltp).toFixed(2):fmt(q.ltp,2)}</td>
                          <td style={{padding:'10px 12px',textAlign:'right',color:changeColor}}>{q.change>=0?'+':''}{fmt(q.change,2)}</td>
                          <td style={{padding:'10px 12px',textAlign:'right',color:changeColor,fontWeight:600}}>{pct(q.changePct)}</td>
                          <td style={{padding:'10px 12px',textAlign:'right',color:'#8aa4b8'}}>{fmt(q.open,2)}</td>
                          <td style={{padding:'10px 12px',textAlign:'right',color:'#4ade80'}}>{fmt(q.high,2)}</td>
                          <td style={{padding:'10px 12px',textAlign:'right',color:'#f87171'}}>{fmt(q.low,2)}</td>
                          <td style={{padding:'10px 12px',textAlign:'right',color:'#4a6070'}}>{fmt(q.close,2)}</td>
                          <td style={{padding:'10px 12px',textAlign:'right',color:'#4a6070'}}>{isVix||safe(q.volume)===0?'—':`${(safe(q.volume)/1e6).toFixed(2)}M`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* VIX Regime trading guide */}
            {data && (
              <div className="card">
                <div style={{fontFamily:'Syne',fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:14}}>VIX Regime — Index Strategy Guide</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:10}}>
                  {[
                    {r:'CRUSHED',vix:'8–12',nifty:'Wait for IV pickup',bank:'Skip premium selling',finn:'Avoid',action:'Directional only',c:'#94a3b8'},
                    {r:'NORMAL', vix:'12–18',nifty:'Full Iron Condor',bank:'Bull Put Spread',finn:'Short Strangle',action:'Full size · All strats',c:'#4ade80'},
                    {r:'ELEVATED',vix:'18–25',nifty:'½ size Condor',bank:'Protective hedge',finn:'Half size only',action:'50% size · Defined risk',c:'#fbbf24'},
                    {r:'EXTREME', vix:'25+',nifty:'Exit / Buy Puts',bank:'Emergency hedge',finn:'Exit all',action:'No selling · Cash or hedge',c:'#f87171'},
                  ].map(z=>{
                    const isActive = data.regime === z.r;
                    return (
                      <div key={z.r} style={{padding:'12px 14px',border:`1px solid ${isActive?z.c+'60':z.c+'20'}`,background:isActive?`${z.c}08`:'transparent',position:'relative'}}>
                        {isActive && <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:z.c,opacity:.8}}></div>}
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                          <div style={{fontFamily:'Syne',fontWeight:700,fontSize:12,color:z.c}}>{z.r}</div>
                          <div style={{fontSize:9,color:z.c,opacity:.7}}>VIX {z.vix}</div>
                          {isActive && <div style={{fontSize:8,padding:'1px 5px',background:z.c+'20',border:`1px solid ${z.c}40`,color:z.c,letterSpacing:'.06em'}}>ACTIVE</div>}
                        </div>
                        <div style={{fontSize:10,color:'#4a6070',marginBottom:4}}><span style={{color:'#8aa4b8'}}>NIFTY: </span>{z.nifty}</div>
                        <div style={{fontSize:10,color:'#4a6070',marginBottom:4}}><span style={{color:'#8aa4b8'}}>BANKNIFTY: </span>{z.bank}</div>
                        <div style={{fontSize:10,color:'#4a6070',marginBottom:8}}><span style={{color:'#8aa4b8'}}>FINNIFTY: </span>{z.finn}</div>
                        <div style={{fontSize:9,padding:'4px 8px',background:'#0d1219',color:z.c,letterSpacing:'.04em'}}>{z.action}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!data && !loading && (
              <div style={{textAlign:'center',padding:60,color:'#4a6070'}}>No index data. Connect Fyers to view live Nifty indices.</div>
            )}
          </div>

        ) : (
          <div>
            <div style={{fontFamily:'Syne',fontSize:14,fontWeight:700,color:'#e8b86d',marginBottom:16}}>Trade Journal & Analytics</div>
            
            {loadingAnalytics && (
              <div style={{color:'#4a6070', fontSize:11, marginBottom:16, fontFamily:'JetBrains Mono'}}>Updating analytics…</div>
            )}

            {/* Analytics Dashboard section */}
            {analytics && (analytics.equityCurve.length > 1 || analytics.strategyData.length > 0) && (
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:16, marginBottom:24}}>
                {/* Equity Curve AreaChart */}
                <div className="card">
                  <div style={{fontFamily:'Syne',fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:14}}>Equity Curve (Capital Growth)</div>
                  <div style={{height:200, width:'100%'}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.equityCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCapital" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" />
                        <XAxis dataKey="time" stroke="#4a6070" style={{fontSize:9, fontFamily:'JetBrains Mono'}} />
                        <YAxis stroke="#4a6070" domain={['dataMin - 5000', 'dataMax + 5000']} style={{fontSize:9, fontFamily:'JetBrains Mono'}} tickFormatter={(v) => `₹${v/1000}k`} />
                        <Tooltip contentStyle={{background:'#0d1219', borderColor:'#1e2d3d', color:'#c8d8e8', fontSize:11, fontFamily:'JetBrains Mono'}} formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Portfolio Value']} />
                        <Area type="monotone" dataKey="capital" stroke="#4ade80" fillOpacity={1} fill="url(#colorCapital)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Strategy P&L Chart */}
                <div className="card">
                  <div style={{fontFamily:'Syne',fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:14}}>Strategy Performance (Net P&L)</div>
                  <div style={{height:200, width:'100%'}}>
                    {analytics.strategyData.length === 0 ? (
                      <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#4a6070', fontSize:11, fontFamily:'JetBrains Mono'}}>No strategy data yet.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.strategyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" />
                          <XAxis dataKey="name" stroke="#4a6070" style={{fontSize:9, fontFamily:'JetBrains Mono'}} />
                          <YAxis stroke="#4a6070" style={{fontSize:9, fontFamily:'JetBrains Mono'}} tickFormatter={(v) => `₹${v}`} />
                          <Tooltip contentStyle={{background:'#0d1219', borderColor:'#1e2d3d', color:'#c8d8e8', fontSize:11, fontFamily:'JetBrains Mono'}} formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Net P&L']} />
                          <Bar dataKey="pnl">
                            {analytics.strategyData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#4ade80' : '#f87171'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* VIX Regime Win Rates Chart */}
                <div className="card">
                  <div style={{fontFamily:'Syne',fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:14}}>Win Rate by VIX Regime</div>
                  <div style={{height:200, width:'100%'}}>
                    {analytics.regimeData.length === 0 ? (
                      <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#4a6070', fontSize:11, fontFamily:'JetBrains Mono'}}>No regime data yet.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.regimeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" />
                          <XAxis dataKey="regime" stroke="#4a6070" style={{fontSize:9, fontFamily:'JetBrains Mono'}} />
                          <YAxis stroke="#4a6070" domain={[0, 100]} style={{fontSize:9, fontFamily:'JetBrains Mono'}} tickFormatter={(v) => `${v}%`} />
                          <Tooltip contentStyle={{background:'#0d1219', borderColor:'#1e2d3d', color:'#c8d8e8', fontSize:11, fontFamily:'JetBrains Mono'}} formatter={(v) => [`${v}%`, 'Win Rate']} />
                          <Bar dataKey="winRate">
                            {analytics.regimeData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={RC[entry.regime]?.color || '#60a5fa'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!trades.length ? (
              <div style={{textAlign:'center',padding:60,color:'#4a6070'}}>No trades recorded yet. Open and close positions to populate the journal.</div>
            ) : (
              <div>
                <div style={{fontSize:11,color:'#8aa4b8',marginBottom:10,textTransform:'uppercase',letterSpacing:'.08em'}}>Trade Logs</div>
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
