'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { generateStrategySignals, classifyVixRegime } from '@/lib/signals';
import { SCREENER_UNIVERSE, SECTOR_COLORS } from '@/lib/screener';
import type { ScreenerStock } from '@/lib/screener';
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

interface ATMCandle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}
interface ATMTrade {
  id: string; direction: 'LONG'|'SHORT'; entryPrice: number; entryTime: string;
  atmStrike: number; target: number; stopLoss: number;
  exitPrice?: number; exitTime?: string; pnlPts?: number; pnlRs?: number;
  status: 'OPEN'|'TARGET'|'SL'|'MANUAL';
}

const ATM_CFG: Record<string, {name:string; step:number; lotSize:number; sym:string}> = {
  'NSE:NIFTY50-INDEX':   {name:'NIFTY',     step:50,  lotSize:25, sym:'NIFTY 50'},
  'NSE:NIFTYBANK-INDEX': {name:'BANKNIFTY', step:100, lotSize:15, sym:'BANKNIFTY'},
  'NSE:FINNIFTY-INDEX':  {name:'FINNIFTY',  step:50,  lotSize:40, sym:'FINNIFTY'},
};


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
  const [tab, setTab] = useState<'live'|'signals'|'positions'|'journal'|'indices'|'radar'|'atm'>('live');
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
  const [screenerStocks, setScreenerStocks] = useState<ScreenerStock[] | null>(null);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerScannedAt, setScreenerScannedAt] = useState<string | null>(null);
  const [screenerIsDemo, setScreenerIsDemo] = useState(false);
  const [screenerFilter, setScreenerFilter] = useState({ minVol: 1.5, minDepth: 20, maxDepth: 50 });

  // ATM Analysis tab — 1-minute candle engine + paper trade manager
  const [atmIdxState, _setAtmIdx]     = useState('NSE:NIFTY50-INDEX');
  const [atmAutoTrade, _setAtmAuto]   = useState(true);
  const [atmTargetPts, _setAtmTarget] = useState(20);
  const [atmSlPts, _setAtmSl]         = useState(10);
  const [atmCurrentCandle, setAtmCurrentCandle] = useState<ATMCandle | null>(null);
  const [atmCandleHistory, setAtmCandleHistory] = useState<ATMCandle[]>([]);
  const [atmActiveTrade,   setAtmActiveTrade]   = useState<ATMTrade | null>(null);
  const [atmTradeLog,      setAtmTradeLog]       = useState<ATMTrade[]>([]);
  const [atmSignal, setAtmSignal] = useState<{dir:'LONG'|'SHORT';price:number;candleHigh:number;candleLow:number;time:string}|null>(null);

  // Refs — always-fresh values readable inside stable callbacks
  const atmIdxRef     = useRef('NSE:NIFTY50-INDEX');
  const atmAutoRef    = useRef(true);
  const atmTargetRef  = useRef(20);
  const atmSlRef      = useRef(10);
  const atmCandleRef  = useRef<ATMCandle | null>(null);
  const atmCandlesRef = useRef<ATMCandle[]>([]);
  const atmActiveRef  = useRef<ATMTrade | null>(null);
  const atmLastBrkRef = useRef<number>(0);

  // Wrapper setters that keep state + ref in sync
  const setAtmIdx    = (v: string)  => { _setAtmIdx(v);    atmIdxRef.current    = v;  };
  const setAtmAuto   = (v: boolean) => { _setAtmAuto(v);   atmAutoRef.current   = v;  };
  const setAtmTarget = (v: number)  => { _setAtmTarget(v); atmTargetRef.current = v;  };
  const setAtmSl     = (v: number)  => { _setAtmSl(v);     atmSlRef.current     = v;  };

  // Function refs — reassigned every render so stable callbacks get fresh closures
  const atmOpenRef  = useRef<(dir:'LONG'|'SHORT', price:number)=>void>(() => {});
  const atmCloseRef = useRef<(price:number, reason:'TARGET'|'SL'|'MANUAL')=>void>(() => {});

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

  // Reassign every render → fresh access to addToast, setters, etc.
  atmOpenRef.current = (dir, entryPrice) => {
    const cfg = ATM_CFG[atmIdxRef.current];
    const atmStrike = Math.round(entryPrice / cfg.step) * cfg.step;
    const target  = dir === 'LONG' ? entryPrice + atmTargetRef.current : entryPrice - atmTargetRef.current;
    const stopLoss = dir === 'LONG' ? entryPrice - atmSlRef.current    : entryPrice + atmSlRef.current;
    const trade: ATMTrade = {
      id: Date.now().toString(), direction: dir, entryPrice,
      entryTime: new Date().toLocaleTimeString('en-IN'),
      atmStrike, target, stopLoss, status: 'OPEN',
    };
    atmActiveRef.current = trade;
    setAtmActiveTrade(trade);
    addToast(`ATM ${dir === 'LONG' ? '↑ CE BUY' : '↓ PE BUY'} @ ₹${entryPrice.toFixed(1)} · T:+${atmTargetRef.current} SL:-${atmSlRef.current} pts`);
  };

  atmCloseRef.current = (exitPrice, reason) => {
    const trade = atmActiveRef.current;
    if (!trade) return;
    const cfg     = ATM_CFG[atmIdxRef.current];
    const pnlPts  = trade.direction === 'LONG' ? exitPrice - trade.entryPrice : trade.entryPrice - exitPrice;
    const pnlRs   = pnlPts * cfg.lotSize;
    const closed: ATMTrade = { ...trade, exitPrice, exitTime: new Date().toLocaleTimeString('en-IN'), pnlPts, pnlRs, status: reason };
    atmActiveRef.current = null;
    setAtmActiveTrade(null);
    setAtmTradeLog(prev => [closed, ...prev]);
    const icon = reason === 'TARGET' ? '✅ Target' : reason === 'SL' ? '🛑 SL' : '⏹ Closed';
    addToast(`${icon}: ${pnlPts >= 0 ? '+' : ''}${pnlPts.toFixed(1)} pts · ₹${pnlRs >= 0 ? '+' : ''}${pnlRs.toFixed(0)}`, reason === 'TARGET' || reason === 'MANUAL' ? 'ok' : 'err');
  };

  // Stable 1-minute candle builder + breakout detector (reads only refs, writes via stable setters)
  const processATMTick = useCallback((ltp: number, ts: number, vol: number) => {
    const minuteMs = Math.floor(((ts > 0 ? ts : Date.now())) / 60000) * 60000;

    // 1. Check active trade exit on every tick
    const active = atmActiveRef.current;
    if (active) {
      const hitTarget = active.direction === 'LONG' ? ltp >= active.target  : ltp <= active.target;
      const hitSL     = active.direction === 'LONG' ? ltp <= active.stopLoss : ltp >= active.stopLoss;
      if (hitTarget) { atmCloseRef.current(ltp, 'TARGET'); return; }
      if (hitSL)     { atmCloseRef.current(ltp, 'SL');     return; }
    }

    // 2. Candle building
    const prev = atmCandleRef.current;
    if (!prev || minuteMs > prev.time) {
      if (prev) {
        const closed = { ...prev };
        atmCandlesRef.current = [...atmCandlesRef.current.slice(-29), closed];
        setAtmCandleHistory([...atmCandlesRef.current]);
        // Breakout check against the just-closed candle
        if (!atmActiveRef.current && atmLastBrkRef.current !== closed.time) {
          if (ltp > closed.high) {
            atmLastBrkRef.current = closed.time;
            setAtmSignal({ dir: 'LONG',  price: ltp, candleHigh: closed.high, candleLow: closed.low, time: new Date().toLocaleTimeString('en-IN') });
            if (atmAutoRef.current) atmOpenRef.current('LONG',  ltp);
          } else if (ltp < closed.low) {
            atmLastBrkRef.current = closed.time;
            setAtmSignal({ dir: 'SHORT', price: ltp, candleHigh: closed.high, candleLow: closed.low, time: new Date().toLocaleTimeString('en-IN') });
            if (atmAutoRef.current) atmOpenRef.current('SHORT', ltp);
          }
        }
      }
      const nc: ATMCandle = { time: minuteMs, open: ltp, high: ltp, low: ltp, close: ltp, volume: vol };
      atmCandleRef.current = nc;
      setAtmCurrentCandle({ ...nc });
    } else {
      const nc: ATMCandle = { ...prev, high: Math.max(prev.high, ltp), low: Math.min(prev.low, ltp), close: ltp };
      atmCandleRef.current = nc;
      setAtmCurrentCandle({ ...nc });
    }
  }, []); // empty deps: reads refs, writes stable setters

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

  const runScreener = useCallback(async (filter = screenerFilter) => {
    setScreenerLoading(true);
    try {
      const params = new URLSearchParams({
        minVol:   String(filter.minVol),
        minDepth: String(filter.minDepth),
        maxDepth: String(filter.maxDepth),
        ...(isDemo ? { demo: 'true' } : {}),
      });
      const r    = await fetch(`/api/fyers/screener?${params}`);
      const json = await r.json();
      if (json.success) {
        setScreenerStocks(json.stocks);
        setScreenerScannedAt(json.scannedAt);
        setScreenerIsDemo(json.isSimulated);
      } else {
        addToast(`Screener error: ${json.error}`, 'err');
      }
    } catch (err) {
      addToast(`Screener failed: ${String(err)}`, 'err');
    } finally {
      setScreenerLoading(false);
    }
  }, [isDemo, screenerFilter]);

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

  useEffect(() => {
    if (tab === 'journal') fetchAnalytics();
    if (tab === 'radar' && !screenerStocks && !screenerLoading) runScreener();
  }, [tab, fetchAnalytics, screenerStocks, screenerLoading, runScreener]);

  // Feed live NIFTY ticks into the 1-min candle engine whenever data updates
  useEffect(() => {
    const q = data?.quotes.find(q => q.symbol === atmIdxRef.current);
    if (q && q.ltp > 0) processATMTick(q.ltp, q.timestamp ?? 0, q.volume ?? 0);
  }, [data, processATMTick]);

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
        <button className={`tb ${tab==='radar'?'a':''}`} onClick={()=>setTab('radar')}>🔍 Breakout Radar {screenerStocks?.length?`(${screenerStocks.length})`:''}</button>
        <button className={`tb ${tab==='atm'?'a':''}`} onClick={()=>setTab('atm')}>🎯 ATM Analysis {atmActiveTrade?'●':''}</button>
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

        ) : tab==='atm' ? (
          (() => {
            const cfg = ATM_CFG[atmIdxState];
            const currentPrice = data?.quotes.find(q => q.symbol === atmIdxState)?.ltp ?? 0;
            const atmStrike    = currentPrice > 0 ? Math.round(currentPrice / cfg.step) * cfg.step : 0;
            const allCandles   = [...atmCandleHistory, ...(atmCurrentCandle ? [atmCurrentCandle] : [])];
            const visible      = allCandles.slice(-25);

            // Live P&L of active trade (computed from current price, no extra state)
            const livePnlPts = atmActiveTrade && currentPrice > 0
              ? (atmActiveTrade.direction === 'LONG' ? currentPrice - atmActiveTrade.entryPrice : atmActiveTrade.entryPrice - currentPrice)
              : 0;
            const livePnlRs  = livePnlPts * cfg.lotSize;
            const targetPts  = atmActiveTrade ? Math.abs(atmActiveTrade.target - atmActiveTrade.entryPrice) : 0;
            const progress   = targetPts > 0 ? Math.max(0, Math.min(100, (livePnlPts / targetPts) * 100)) : 0;

            // SVG chart helper
            const VW = 580, VH = 210;
            const PAD = { L: 52, R: 16, T: 10, B: 26 };
            const IW = VW - PAD.L - PAD.R, IH = VH - PAD.T - PAD.B;
            const N = Math.max(visible.length, 1);
            const slotW = IW / N;
            const bodyW = Math.max(2, slotW * 0.62);
            const pricesToScale = visible.flatMap(c => [c.high, c.low]);
            if (atmActiveTrade) pricesToScale.push(atmActiveTrade.entryPrice, atmActiveTrade.target, atmActiveTrade.stopLoss);
            if (currentPrice > 0) pricesToScale.push(currentPrice);
            const minP = Math.min(...pricesToScale, currentPrice > 0 ? currentPrice : Infinity);
            const maxP = Math.max(...pricesToScale, 0);
            const pr   = Math.max(maxP - minP, 1);
            const lo   = minP - pr * 0.1;
            const hi   = maxP + pr * 0.1;
            const tr   = hi - lo;
            const toY  = (p: number) => PAD.T + IH - ((p - lo) / tr) * IH;
            const toX  = (i: number) => PAD.L + i * slotW + slotW / 2;
            const lastClosed = atmCandleHistory.at(-1);

            const winTrades  = atmTradeLog.filter(t => (t.pnlPts ?? 0) > 0).length;
            const totalTrades = atmTradeLog.length;
            const totalPnlPts = atmTradeLog.reduce((s, t) => s + (t.pnlPts ?? 0), 0);
            const totalPnlRs  = atmTradeLog.reduce((s, t) => s + (t.pnlRs  ?? 0), 0);

            return (
              <div>
                {/* Header row */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12,marginBottom:16}}>
                  <div>
                    <div style={{fontFamily:'Syne',fontSize:14,fontWeight:700,color:'#e8b86d',marginBottom:4}}>ATM Analysis — 1-Min Breakout</div>
                    <div style={{fontSize:10,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.08em'}}>
                      {currentPrice > 0
                        ? `${cfg.sym}  ₹${currentPrice.toLocaleString('en-IN',{maximumFractionDigits:1})}  ·  ATM ${atmStrike} CE / PE  ·  ${atmCandleHistory.length} candles built`
                        : 'Connect Fyers to start receiving live ticks'}
                    </div>
                  </div>
                  {/* Controls */}
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                    <select value={atmIdxState} onChange={e=>{setAtmIdx(e.target.value); atmCandleRef.current=null; atmCandlesRef.current=[]; setAtmCurrentCandle(null); setAtmCandleHistory([]); setAtmSignal(null);}}
                      style={{background:'#0d1219',border:'1px solid #1e2d3d',color:'#c8d8e8',fontFamily:'inherit',fontSize:10,padding:'5px 8px',cursor:'pointer'}}>
                      <option value="NSE:NIFTY50-INDEX">NIFTY 50</option>
                      <option value="NSE:NIFTYBANK-INDEX">BANKNIFTY</option>
                      <option value="NSE:FINNIFTY-INDEX">FINNIFTY</option>
                    </select>
                    <div style={{display:'flex',alignItems:'center',gap:6,fontSize:10}}>
                      <span style={{color:'#4a6070'}}>Target</span>
                      <input type="number" value={atmTargetPts} min={5} max={100} step={5}
                        onChange={e=>setAtmTarget(Math.max(5,parseInt(e.target.value)||20))}
                        style={{width:44,background:'#0d1219',border:'1px solid #1e2d3d',color:'#4ade80',fontFamily:'inherit',fontSize:10,padding:'4px 6px',textAlign:'center'}} />
                      <span style={{color:'#4a6070'}}>pts</span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:6,fontSize:10}}>
                      <span style={{color:'#4a6070'}}>SL</span>
                      <input type="number" value={atmSlPts} min={5} max={100} step={5}
                        onChange={e=>setAtmSl(Math.max(5,parseInt(e.target.value)||10))}
                        style={{width:44,background:'#0d1219',border:'1px solid #1e2d3d',color:'#f87171',fontFamily:'inherit',fontSize:10,padding:'4px 6px',textAlign:'center'}} />
                      <span style={{color:'#4a6070'}}>pts</span>
                    </div>
                    <button
                      onClick={()=>setAtmAuto(!atmAutoTrade)}
                      style={{background:atmAutoTrade?'rgba(74,222,128,.1)':'#0d1219',border:`1px solid ${atmAutoTrade?'rgba(74,222,128,.4)':'#1e2d3d'}`,color:atmAutoTrade?'#4ade80':'#4a6070',fontFamily:'inherit',fontSize:10,padding:'5px 12px',cursor:'pointer',letterSpacing:'.07em',textTransform:'uppercase'}}>
                      {atmAutoTrade ? '⚡ Auto ON' : 'Auto OFF'}
                    </button>
                    {atmActiveTrade && (
                      <button className="btn btnr" style={{fontSize:10,padding:'5px 12px'}}
                        onClick={()=>atmCloseRef.current(currentPrice || atmActiveTrade.entryPrice, 'MANUAL')}>
                        ⏹ Exit Trade
                      </button>
                    )}
                  </div>
                </div>

                {/* Signal banner */}
                {atmSignal && (
                  <div style={{marginBottom:12,padding:'10px 16px',background:atmSignal.dir==='LONG'?'rgba(74,222,128,.08)':'rgba(248,113,113,.08)',border:`1px solid ${atmSignal.dir==='LONG'?'rgba(74,222,128,.3)':'rgba(248,113,113,.3)'}`,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <span style={{fontFamily:'Syne',fontWeight:700,fontSize:16,color:atmSignal.dir==='LONG'?'#4ade80':'#f87171'}}>{atmSignal.dir==='LONG'?'↑ LONG SIGNAL':'↓ SHORT SIGNAL'}</span>
                      <span style={{fontSize:11,color:'#8aa4b8'}}>{atmSignal.dir==='LONG'?`Broke above ${cfg.sym} high ₹${atmSignal.candleHigh.toFixed(1)}`:`Broke below ${cfg.sym} low ₹${atmSignal.candleLow.toFixed(1)}`}</span>
                    </div>
                    <div style={{display:'flex',gap:16,fontSize:10,color:'#4a6070'}}>
                      <span>Entry: <b style={{color:'#f0f4f8'}}>₹{atmSignal.price.toFixed(1)}</b></span>
                      <span>ATM Strike: <b style={{color:'#e8b86d'}}>{Math.round(atmSignal.price / cfg.step) * cfg.step} {atmSignal.dir==='LONG'?'CE':'PE'}</b></span>
                      <span style={{color:'#4a6070'}}>{atmSignal.time}</span>
                    </div>
                  </div>
                )}

                {/* Current 1-min candle stats */}
                {atmCurrentCandle && (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:14}}>
                    {[
                      {l:'1-Min Open',  v:atmCurrentCandle.open.toFixed(1),  c:'#8aa4b8'},
                      {l:'1-Min High',  v:atmCurrentCandle.high.toFixed(1),  c:'#4ade80'},
                      {l:'1-Min Low',   v:atmCurrentCandle.low.toFixed(1),   c:'#f87171'},
                      {l:'1-Min Close', v:atmCurrentCandle.close.toFixed(1), c:(atmCurrentCandle.close>=atmCurrentCandle.open?'#4ade80':'#f87171')},
                      {l:'Range',       v:`${(atmCurrentCandle.high-atmCurrentCandle.low).toFixed(1)} pts`, c:'#fbbf24'},
                      {l:'ATM Strike',  v:`${atmStrike > 0 ? atmStrike : '—'}`,  c:'#a78bfa'},
                      ...(lastClosed ? [{l:'Prev High', v:lastClosed.high.toFixed(1), c:'rgba(74,222,128,.7)'}, {l:'Prev Low', v:lastClosed.low.toFixed(1), c:'rgba(248,113,113,.7)'}] : []),
                    ].map(s=>(
                      <div key={s.l} className="card" style={{padding:'10px 12px',position:'relative',overflow:'hidden'}}>
                        <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:s.c,opacity:.5}}></div>
                        <div style={{fontSize:8,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:4}}>{s.l}</div>
                        <div style={{fontFamily:'Syne',fontSize:16,fontWeight:700,color:s.c}}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 1-minute candlestick chart */}
                <div className="card" style={{marginBottom:14,padding:'14px 12px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <div style={{fontFamily:'Syne',fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d'}}>1-Minute Chart · {cfg.sym}</div>
                    <div style={{display:'flex',gap:16,fontSize:9,color:'#4a6070'}}>
                      <span><span style={{color:'rgba(74,222,128,.7)'}}>—·—</span> Prev High</span>
                      <span><span style={{color:'rgba(248,113,113,.7)'}}>—·—</span> Prev Low</span>
                      {atmActiveTrade && <><span><span style={{color:'#e8b86d'}}>——</span> Entry</span><span><span style={{color:'#4ade80'}}>——</span> Target</span><span><span style={{color:'#f87171'}}>——</span> SL</span></>}
                    </div>
                  </div>
                  {visible.length === 0 ? (
                    <div style={{height:170,display:'flex',alignItems:'center',justifyContent:'center',color:'#4a6070',fontSize:11}}>
                      Waiting for live price ticks to build 1-min candles…
                    </div>
                  ) : (
                    <svg viewBox={`0 0 ${VW} ${VH}`} style={{width:'100%',height:180}} aria-hidden="true">
                      {/* Y grid */}
                      {[0,.25,.5,.75,1].map(t => {
                        const y = PAD.T + IH * t;
                        const p = hi - tr * t;
                        return (
                          <g key={t}>
                            <line x1={PAD.L} x2={VW-PAD.R} y1={y} y2={y} stroke="#111d28" strokeWidth={t===0||t===1?0.8:0.4} />
                            <text x={PAD.L-3} y={y+3} textAnchor="end" fill="#3a5060" fontSize={7.5} fontFamily="monospace">{Math.round(p).toLocaleString('en-IN')}</text>
                          </g>
                        );
                      })}
                      {/* Prev candle breakout reference lines */}
                      {lastClosed && lo < lastClosed.high && lastClosed.high < hi && (
                        <line x1={PAD.L} x2={VW-PAD.R} y1={toY(lastClosed.high)} y2={toY(lastClosed.high)} stroke="rgba(74,222,128,.55)" strokeWidth={0.9} strokeDasharray="5,3" />
                      )}
                      {lastClosed && lo < lastClosed.low && lastClosed.low < hi && (
                        <line x1={PAD.L} x2={VW-PAD.R} y1={toY(lastClosed.low)} y2={toY(lastClosed.low)} stroke="rgba(248,113,113,.55)" strokeWidth={0.9} strokeDasharray="5,3" />
                      )}
                      {/* Active trade levels */}
                      {atmActiveTrade && lo < atmActiveTrade.entryPrice && atmActiveTrade.entryPrice < hi && (
                        <line x1={PAD.L} x2={VW-PAD.R} y1={toY(atmActiveTrade.entryPrice)} y2={toY(atmActiveTrade.entryPrice)} stroke="rgba(232,184,109,.9)" strokeWidth={1.1} strokeDasharray="8,3" />
                      )}
                      {atmActiveTrade && lo < atmActiveTrade.target && atmActiveTrade.target < hi && (
                        <line x1={PAD.L} x2={VW-PAD.R} y1={toY(atmActiveTrade.target)} y2={toY(atmActiveTrade.target)} stroke="rgba(74,222,128,.9)" strokeWidth={1.1} strokeDasharray="8,3" />
                      )}
                      {atmActiveTrade && lo < atmActiveTrade.stopLoss && atmActiveTrade.stopLoss < hi && (
                        <line x1={PAD.L} x2={VW-PAD.R} y1={toY(atmActiveTrade.stopLoss)} y2={toY(atmActiveTrade.stopLoss)} stroke="rgba(248,113,113,.9)" strokeWidth={1.1} strokeDasharray="8,3" />
                      )}
                      {/* Candles */}
                      {visible.map((c, i) => {
                        const x = toX(i);
                        const isGreen  = c.close >= c.open;
                        const col      = isGreen ? '#4ade80' : '#f87171';
                        const isCur    = i === N - 1;
                        const bTop     = toY(Math.max(c.open, c.close));
                        const bBot     = toY(Math.min(c.open, c.close));
                        const bH       = Math.max(1, bBot - bTop);
                        return (
                          <g key={c.time} opacity={isCur ? 1 : 0.82}>
                            <line x1={x} x2={x} y1={toY(c.high)} y2={toY(c.low)} stroke={col} strokeWidth={1} />
                            <rect x={x - bodyW/2} y={bTop} width={bodyW} height={bH}
                              fill={isCur ? `${col}40` : col} stroke={col} strokeWidth={0.5} rx={0.5} />
                          </g>
                        );
                      })}
                      {/* Time axis */}
                      {visible.map((c, i) => {
                        if (i % 5 !== 0 && i !== N-1) return null;
                        const d = new Date(c.time);
                        const lbl = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
                        return (
                          <text key={c.time} x={toX(i)} y={VH-5} textAnchor="middle" fill="#3a5060" fontSize={7} fontFamily="monospace">{lbl}</text>
                        );
                      })}
                      {/* Live price dot */}
                      {currentPrice > 0 && lo < currentPrice && currentPrice < hi && (
                        <circle cx={VW-PAD.R-4} cy={toY(currentPrice)} r={3} fill="#fbbf24" className="pulse" />
                      )}
                    </svg>
                  )}
                </div>

                {/* Active trade card */}
                {atmActiveTrade ? (
                  <div className="card fi" style={{marginBottom:14,borderColor:livePnlPts>=0?'rgba(74,222,128,.3)':'rgba(248,113,113,.3)',background:livePnlPts>=0?'rgba(74,222,128,.03)':'rgba(248,113,113,.03)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
                      <div>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                          <span style={{fontFamily:'Syne',fontWeight:700,fontSize:15,color:atmActiveTrade.direction==='LONG'?'#4ade80':'#f87171'}}>
                            {atmActiveTrade.direction==='LONG'?'↑ LONG CE':'↓ SHORT PE'}
                          </span>
                          <span style={{fontSize:11,color:'#8aa4b8'}}>· Strike {atmActiveTrade.atmStrike} · {cfg.sym}</span>
                          <span style={{fontSize:9,padding:'1px 7px',background:'rgba(74,222,128,.1)',border:'1px solid rgba(74,222,128,.2)',color:'#4ade80',letterSpacing:'.06em'}}>OPEN</span>
                        </div>
                        <div style={{display:'flex',gap:20,fontSize:11,flexWrap:'wrap'}}>
                          <span><span style={{color:'#4a6070'}}>Entry </span><b style={{color:'#e8b86d'}}>₹{atmActiveTrade.entryPrice.toFixed(1)}</b></span>
                          <span><span style={{color:'#4a6070'}}>Target </span><b style={{color:'#4ade80'}}>₹{atmActiveTrade.target.toFixed(1)} (+{atmTargetPts}pts)</b></span>
                          <span><span style={{color:'#4a6070'}}>SL </span><b style={{color:'#f87171'}}>₹{atmActiveTrade.stopLoss.toFixed(1)} (-{atmSlPts}pts)</b></span>
                          <span style={{color:'#4a6070'}}>{atmActiveTrade.entryTime}</span>
                        </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:9,color:'#4a6070',textTransform:'uppercase',marginBottom:2}}>Live P&L</div>
                        <div style={{fontFamily:'Syne',fontSize:22,fontWeight:800,color:livePnlPts>=0?'#4ade80':'#f87171'}}>
                          {livePnlPts>=0?'+':''}{livePnlPts.toFixed(1)} <span style={{fontSize:13}}>pts</span>
                        </div>
                        <div style={{fontSize:11,color:livePnlPts>=0?'#4ade80':'#f87171'}}>₹{livePnlRs>=0?'+':''}{livePnlRs.toFixed(0)}</div>
                      </div>
                    </div>
                    {/* Target progress bar */}
                    <div style={{marginTop:12}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#4a6070',marginBottom:4}}>
                        <span>Progress to target</span>
                        <span style={{color:livePnlPts>=0?'#4ade80':'#f87171'}}>{progress.toFixed(0)}%</span>
                      </div>
                      <div style={{height:5,background:'#111820',borderRadius:2,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${Math.max(0,progress)}%`,background:livePnlPts>=0?'#4ade80':'#f87171',borderRadius:2,transition:'width .3s ease'}}></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="card" style={{marginBottom:14,padding:'16px',display:'flex',alignItems:'center',gap:12}}>
                    <span style={{fontSize:20}}>⏳</span>
                    <div>
                      <div style={{fontSize:11,color:'#8aa4b8'}}>{atmAutoTrade ? 'Watching for 1-min candle breakout…' : 'Auto-trade is OFF — signals will be shown but no trade will be entered.'}</div>
                      <div style={{fontSize:10,color:'#4a6070',marginTop:3}}>Entry triggers when current price breaks above prev candle high (LONG) or below prev candle low (SHORT)</div>
                    </div>
                  </div>
                )}

                {/* Session stats */}
                {totalTrades > 0 && (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:10,marginBottom:14}}>
                    {[
                      {l:'Trades',  v:String(totalTrades),  c:'#8aa4b8'},
                      {l:'Wins',    v:`${winTrades} (${totalTrades>0?Math.round(winTrades/totalTrades*100):0}%)`, c:'#4ade80'},
                      {l:'Total Pts',v:`${totalPnlPts>=0?'+':''}${totalPnlPts.toFixed(1)}`, c:totalPnlPts>=0?'#4ade80':'#f87171'},
                      {l:'Total P&L',v:`₹${totalPnlRs>=0?'+':''}${totalPnlRs.toFixed(0)}`,  c:totalPnlRs>=0?'#4ade80':'#f87171'},
                    ].map(s=>(
                      <div key={s.l} className="card" style={{padding:'10px 12px'}}>
                        <div style={{fontSize:8,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:4}}>{s.l}</div>
                        <div style={{fontFamily:'Syne',fontSize:16,fontWeight:700,color:s.c}}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Trade log */}
                {atmTradeLog.length > 0 && (
                  <div className="card" style={{overflowX:'auto'}}>
                    <div style={{fontFamily:'Syne',fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:12}}>Trade Log</div>
                    <table style={{width:'100%',borderCollapse:'collapse',minWidth:540}}>
                      <thead>
                        <tr style={{borderBottom:'1px solid #1e2d3d'}}>
                          {['#','Dir','Strike','Entry ₹','Exit ₹','P&L pts','P&L ₹','Exit','Time'].map(h=>(
                            <th key={h} style={{padding:'6px 10px',textAlign:h==='Dir'?'left':'right',fontSize:9,textTransform:'uppercase',letterSpacing:'.08em',color:'#4a6070',fontWeight:400,whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {atmTradeLog.map((t, i) => {
                          const pts = t.pnlPts ?? 0;
                          const rs  = t.pnlRs  ?? 0;
                          const pc  = pts >= 0 ? '#4ade80' : '#f87171';
                          return (
                            <tr key={t.id} style={{borderBottom:'1px solid rgba(30,45,61,.4)'}}>
                              <td style={{padding:'7px 10px',textAlign:'right',color:'#4a6070',fontSize:10}}>{atmTradeLog.length - i}</td>
                              <td style={{padding:'7px 10px',color:t.direction==='LONG'?'#4ade80':'#f87171',fontWeight:600,fontSize:11}}>{t.direction==='LONG'?'↑ CE':'↓ PE'}</td>
                              <td style={{padding:'7px 10px',textAlign:'right',color:'#a78bfa'}}>{t.atmStrike}</td>
                              <td style={{padding:'7px 10px',textAlign:'right',color:'#e8b86d'}}>{t.entryPrice.toFixed(1)}</td>
                              <td style={{padding:'7px 10px',textAlign:'right',color:'#8aa4b8'}}>{t.exitPrice?.toFixed(1)??'—'}</td>
                              <td style={{padding:'7px 10px',textAlign:'right',color:pc,fontWeight:600}}>{pts>=0?'+':''}{pts.toFixed(1)}</td>
                              <td style={{padding:'7px 10px',textAlign:'right',color:pc}}>₹{rs>=0?'+':''}{rs.toFixed(0)}</td>
                              <td style={{padding:'7px 10px',textAlign:'right'}}>
                                <span className="pill" style={{
                                  background:t.status==='TARGET'?'rgba(74,222,128,.1)':t.status==='SL'?'rgba(248,113,113,.1)':'rgba(148,163,184,.1)',
                                  border:`1px solid ${t.status==='TARGET'?'rgba(74,222,128,.2)':t.status==='SL'?'rgba(248,113,113,.2)':'rgba(148,163,184,.2)'}`,
                                  color:t.status==='TARGET'?'#4ade80':t.status==='SL'?'#f87171':'#94a3b8',
                                }}>{t.status}</span>
                              </td>
                              <td style={{padding:'7px 10px',textAlign:'right',color:'#4a6070',fontSize:10}}>{t.entryTime}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()

        ) : tab==='radar' ? (
          <div>
            {/* Header row */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12,marginBottom:16}}>
              <div>
                <div style={{fontFamily:'Syne',fontSize:14,fontWeight:700,color:'#e8b86d',marginBottom:4}}>Breakout Radar</div>
                <div style={{fontSize:10,color:'#4a6070',textTransform:'uppercase',letterSpacing:'.08em'}}>
                  {screenerLoading
                    ? `Scanning ${SCREENER_UNIVERSE.length} stocks…`
                    : screenerScannedAt
                      ? `${SCREENER_UNIVERSE.length} stocks scanned · ${screenerStocks?.length ?? 0} setups found · ${new Date(screenerScannedAt).toLocaleTimeString('en-IN')}${screenerIsDemo?' · DEMO DATA':''}`
                      : `${SCREENER_UNIVERSE.length} stocks in universe · click Scan to start`
                  }
                </div>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                {/* Filter chips */}
                <select
                  value={screenerFilter.minVol}
                  onChange={e=>{
                    const v={...screenerFilter,minVol:parseFloat(e.target.value)};
                    setScreenerFilter(v);
                  }}
                  style={{background:'#0d1219',border:'1px solid #1e2d3d',color:'#8aa4b8',fontFamily:'inherit',fontSize:10,padding:'5px 8px',cursor:'pointer'}}
                >
                  <option value="1.5">Vol ≥ 1.5×</option>
                  <option value="2">Vol ≥ 2×</option>
                  <option value="3">Vol ≥ 3×</option>
                </select>
                <select
                  value={`${screenerFilter.minDepth}-${screenerFilter.maxDepth}`}
                  onChange={e=>{
                    const [mn,mx]=e.target.value.split('-').map(Number);
                    setScreenerFilter(f=>({...f,minDepth:mn,maxDepth:mx}));
                  }}
                  style={{background:'#0d1219',border:'1px solid #1e2d3d',color:'#8aa4b8',fontFamily:'inherit',fontSize:10,padding:'5px 8px',cursor:'pointer'}}
                >
                  <option value="20-50">Depth 20–50%</option>
                  <option value="20-30">Depth 20–30%</option>
                  <option value="30-40">Depth 30–40%</option>
                  <option value="40-50">Depth 40–50%</option>
                </select>
                <button
                  className="btn btng"
                  disabled={screenerLoading}
                  style={{opacity:screenerLoading?.5:1}}
                  onClick={()=>runScreener(screenerFilter)}
                >
                  {screenerLoading ? '⏳ Scanning…' : '🔍 Scan Now'}
                </button>
              </div>
            </div>

            {/* Criteria legend */}
            <div className="card" style={{marginBottom:16,padding:'10px 14px'}}>
              <div style={{display:'flex',gap:24,flexWrap:'wrap',fontSize:10,color:'#4a6070'}}>
                {[
                  {icon:'📉',label:'Down 20–50% from 52-wk high',c:'#60a5fa'},
                  {icon:'📦',label:'Tight price base (low volatility)',c:'#4ade80'},
                  {icon:'🔊',label:'Unusual volume surge today',c:'#fbbf24'},
                  {icon:'⚡',label:'Momentum turning positive',c:'#f87171'},
                ].map(x=>(
                  <div key={x.label} style={{display:'flex',alignItems:'center',gap:6}}>
                    <span>{x.icon}</span>
                    <span style={{color:x.c}}>{x.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Loading skeleton */}
            {screenerLoading && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12}}>
                {Array.from({length:6}).map((_,i)=>(
                  <div key={i} className="card" style={{height:200,opacity:.3,animation:'pulse 1.5s infinite',animationDelay:`${i*0.1}s`}}>
                    <div style={{height:12,background:'#1e2d3d',borderRadius:2,marginBottom:10,width:'60%'}}></div>
                    <div style={{height:28,background:'#1e2d3d',borderRadius:2,marginBottom:16,width:'40%'}}></div>
                    <div style={{height:8,background:'#1e2d3d',borderRadius:2,marginBottom:8,width:'100%'}}></div>
                    <div style={{height:8,background:'#1e2d3d',borderRadius:2,marginBottom:8,width:'80%'}}></div>
                    <div style={{height:8,background:'#1e2d3d',borderRadius:2,marginBottom:8,width:'90%'}}></div>
                  </div>
                ))}
              </div>
            )}

            {/* No results */}
            {!screenerLoading && screenerStocks?.length === 0 && (
              <div style={{textAlign:'center',padding:60,color:'#4a6070'}}>
                <div style={{fontSize:32,marginBottom:12}}>🎯</div>
                <div>No stocks match the current criteria.</div>
                <div style={{fontSize:11,marginTop:8}}>Try lowering the volume threshold or widening the depth range.</div>
              </div>
            )}

            {/* Not scanned yet */}
            {!screenerLoading && screenerStocks === null && (
              <div style={{textAlign:'center',padding:60,color:'#4a6070'}}>
                <div style={{fontSize:32,marginBottom:12}}>🔍</div>
                <div>Click <span style={{color:'#4ade80'}}>Scan Now</span> to find breakout setups</div>
              </div>
            )}

            {/* Results */}
            {!screenerLoading && screenerStocks && screenerStocks.length > 0 && (
              <div>
                {/* Cards grid */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12,marginBottom:20}}>
                  {screenerStocks.map(s => {
                    const sc = SECTOR_COLORS[s.sector] || SECTOR_COLORS['Banking'];
                    const scoreColor = s.score >= 70 ? '#4ade80' : s.score >= 50 ? '#fbbf24' : '#f87171';
                    const scoreBg    = s.score >= 70 ? 'rgba(74,222,128,.08)' : s.score >= 50 ? 'rgba(251,191,36,.08)' : 'rgba(248,113,113,.08)';
                    const scoreBdr   = s.score >= 70 ? 'rgba(74,222,128,.25)' : s.score >= 50 ? 'rgba(251,191,36,.25)' : 'rgba(248,113,113,.25)';
                    const changeCc   = s.changePct >= 0 ? '#4ade80' : '#f87171';
                    const depthPos   = Math.min(95, Math.max(3, ((s.pctFromHigh - 20) / 30) * 100));
                    const volBarW    = Math.min(100, ((s.volumeRatio - 1) / 3) * 100);
                    return (
                      <div key={s.symbol} className="card fi" style={{borderColor:s.isBreakingOut?'rgba(74,222,128,.35)':scoreBdr,position:'relative',overflow:'hidden'}}>
                        {/* Score accent bar */}
                        <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:scoreColor,opacity:.7}}></div>

                        {/* Header */}
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                          <div>
                            <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
                              <span style={{fontFamily:'Syne',fontSize:15,fontWeight:700,color:'#f0f4f8'}}>{s.name}</span>
                              {s.isBreakingOut && <span style={{fontSize:9,padding:'1px 6px',background:'rgba(74,222,128,.12)',border:'1px solid rgba(74,222,128,.3)',color:'#4ade80',letterSpacing:'.06em'}}>BREAKING OUT</span>}
                            </div>
                            <div style={{display:'flex',gap:6,alignItems:'center'}}>
                              <span style={{fontSize:9,padding:'2px 7px',background:sc.bg,border:`1px solid ${sc.border}`,color:sc.color,letterSpacing:'.06em',textTransform:'uppercase'}}>{s.sector}</span>
                              <span style={{fontSize:10,color:'#4a6070'}}>{s.symbol.replace('NSE:','').replace('-EQ','')}</span>
                            </div>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontFamily:'Syne',fontSize:22,fontWeight:800,color:'#f0f4f8',lineHeight:1}}>₹{s.ltp.toLocaleString('en-IN',{maximumFractionDigits:1})}</div>
                            <div style={{fontSize:11,color:changeCc,marginTop:2}}>{s.changePct>=0?'+':''}{s.changePct.toFixed(2)}%</div>
                          </div>
                        </div>

                        {/* Depth from 52-week high bar */}
                        <div style={{marginBottom:10}}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#4a6070',marginBottom:3}}>
                            <span>52-wk High ₹{s.weekHigh52.toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
                            <span style={{color:'#f87171',fontWeight:600}}>{s.pctFromHigh.toFixed(1)}% below high</span>
                          </div>
                          <div style={{height:6,background:'#111820',borderRadius:3,overflow:'hidden',position:'relative'}}>
                            <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${100-depthPos}%`,background:'rgba(248,113,113,.25)'}}></div>
                            <div style={{position:'absolute',left:`${100-depthPos}%`,top:0,height:'100%',width:`${depthPos}%`,background:'rgba(30,45,61,.8)'}}></div>
                            <div style={{position:'absolute',left:`${100-depthPos-2}%`,top:-2,width:4,height:10,background:'#f87171',borderRadius:1}}></div>
                          </div>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#4a6070',marginTop:2}}>
                            <span>52-wk Low ₹{s.weekLow52.toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
                            <span>Current</span>
                          </div>
                        </div>

                        {/* Volume bar */}
                        <div style={{marginBottom:10}}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#4a6070',marginBottom:3}}>
                            <span>Volume vs 20d avg</span>
                            <span style={{color:'#fbbf24',fontWeight:600}}>{s.volumeRatio.toFixed(2)}× surge</span>
                          </div>
                          <div style={{height:5,background:'#111820',borderRadius:2,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${volBarW}%`,background:'linear-gradient(90deg,#4a6070,#fbbf24)',borderRadius:2,transition:'width .4s ease'}}></div>
                          </div>
                          <div style={{fontSize:9,color:'#4a6070',marginTop:2}}>
                            Today: {(s.todayVolume/1e6).toFixed(1)}M &nbsp;·&nbsp; Avg: {(s.avgVolume20d/1e6).toFixed(1)}M
                          </div>
                        </div>

                        {/* Stats grid */}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,paddingTop:10,borderTop:'1px solid #1e2d3d',marginBottom:10}}>
                          <div>
                            <div style={{fontSize:8,color:'#4a6070',textTransform:'uppercase',marginBottom:2}}>Base Length</div>
                            <div style={{fontSize:12,color:'#8aa4b8',fontWeight:600}}>{s.baseLength}d</div>
                          </div>
                          <div>
                            <div style={{fontSize:8,color:'#4a6070',textTransform:'uppercase',marginBottom:2}}>Consolidation</div>
                            <div style={{fontSize:12,color:s.consolidationRange<10?'#4ade80':'#fbbf24',fontWeight:600}}>{s.consolidationRange.toFixed(1)}%</div>
                          </div>
                          <div>
                            <div style={{fontSize:8,color:'#4a6070',textTransform:'uppercase',marginBottom:2}}>5d Trend</div>
                            <div style={{fontSize:12,color:s.trend5d>=0?'#4ade80':'#f87171',fontWeight:600}}>{s.trend5d>=0?'+':''}{s.trend5d.toFixed(1)}%</div>
                          </div>
                        </div>

                        {/* Breakout line + score */}
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div>
                            <div style={{fontSize:8,color:'#4a6070',textTransform:'uppercase',marginBottom:2}}>Break above</div>
                            <div style={{fontSize:12,color:'#e8b86d',fontWeight:600}}>₹{s.breakoutLine.toLocaleString('en-IN',{maximumFractionDigits:1})}</div>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:8,color:'#4a6070',textTransform:'uppercase',marginBottom:2}}>Setup Score</div>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <div style={{width:60,height:6,background:'#111820',borderRadius:3,overflow:'hidden'}}>
                                <div style={{height:'100%',width:`${s.score}%`,background:scoreColor,borderRadius:3,transition:'width .4s ease'}}></div>
                              </div>
                              <div style={{fontFamily:'Syne',fontSize:14,fontWeight:700,color:scoreColor,minWidth:28,textAlign:'right'}}>{s.score}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Comparison table */}
                <div className="card" style={{overflowX:'auto'}}>
                  <div style={{fontFamily:'Syne',fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.1em',color:'#e8b86d',marginBottom:14}}>All Setups — Detail View</div>
                  <table style={{width:'100%',borderCollapse:'collapse',minWidth:800}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid #1e2d3d'}}>
                        {['Score','Stock','Sector','LTP','Day Chg','52wk High','Below High','Vol Ratio','Base','Consolidation','Break Level','Trend 5d'].map(h=>(
                          <th key={h} style={{padding:'7px 10px',textAlign:h==='Stock'||h==='Sector'?'left':'right',fontSize:9,textTransform:'uppercase',letterSpacing:'.08em',color:'#4a6070',fontWeight:400,whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {screenerStocks.map(s => {
                        const sc = SECTOR_COLORS[s.sector] || SECTOR_COLORS['Banking'];
                        const scoreColor = s.score >= 70 ? '#4ade80' : s.score >= 50 ? '#fbbf24' : '#f87171';
                        const cc = s.changePct >= 0 ? '#4ade80' : '#f87171';
                        return (
                          <tr key={s.symbol} style={{borderBottom:'1px solid rgba(30,45,61,.4)'}}>
                            <td style={{padding:'8px 10px',textAlign:'right'}}>
                              <span style={{fontFamily:'Syne',fontWeight:700,fontSize:13,color:scoreColor}}>{s.score}</span>
                            </td>
                            <td style={{padding:'8px 10px'}}>
                              <div style={{fontFamily:'Syne',fontWeight:700,color:'#f0f4f8',fontSize:12}}>{s.name}</div>
                              <div style={{fontSize:9,color:'#4a6070'}}>{s.symbol.replace('NSE:','').replace('-EQ','')}</div>
                            </td>
                            <td style={{padding:'8px 10px'}}>
                              <span style={{fontSize:9,padding:'2px 6px',background:sc.bg,border:`1px solid ${sc.border}`,color:sc.color,textTransform:'uppercase',letterSpacing:'.05em'}}>{s.sector}</span>
                            </td>
                            <td style={{padding:'8px 10px',textAlign:'right',color:'#f0f4f8',fontWeight:600}}>₹{s.ltp.toLocaleString('en-IN',{maximumFractionDigits:1})}</td>
                            <td style={{padding:'8px 10px',textAlign:'right',color:cc}}>{s.changePct>=0?'+':''}{s.changePct.toFixed(2)}%</td>
                            <td style={{padding:'8px 10px',textAlign:'right',color:'#8aa4b8'}}>₹{s.weekHigh52.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                            <td style={{padding:'8px 10px',textAlign:'right',color:'#f87171',fontWeight:600}}>{s.pctFromHigh.toFixed(1)}%</td>
                            <td style={{padding:'8px 10px',textAlign:'right'}}>
                              <span style={{color:s.volumeRatio>=2.5?'#4ade80':s.volumeRatio>=1.5?'#fbbf24':'#8aa4b8',fontWeight:600}}>{s.volumeRatio.toFixed(2)}×</span>
                            </td>
                            <td style={{padding:'8px 10px',textAlign:'right',color:'#8aa4b8'}}>{s.baseLength}d</td>
                            <td style={{padding:'8px 10px',textAlign:'right',color:s.consolidationRange<10?'#4ade80':'#fbbf24'}}>{s.consolidationRange.toFixed(1)}%</td>
                            <td style={{padding:'8px 10px',textAlign:'right',color:'#e8b86d'}}>₹{s.breakoutLine.toLocaleString('en-IN',{maximumFractionDigits:1})}</td>
                            <td style={{padding:'8px 10px',textAlign:'right',color:s.trend5d>=0?'#4ade80':'#f87171'}}>{s.trend5d>=0?'+':''}{s.trend5d.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
