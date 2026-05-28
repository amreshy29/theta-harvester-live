// lib/fyers.ts
// Fyers API v3 wrapper for server-side use
// IMPORTANT: credentials are read at call-time (not module load)
// so .env changes / Vercel re-deployments are picked up correctly.

const FYERS_BASE_URL = 'https://api-t1.fyers.in/data';
export const FYERS_ORDER_URL = 'https://api-t2.fyers.in/api/v3';

/** Read credentials fresh on every call (works with Vercel env var updates). */
export function getFyersCreds() {
  return {
    appId:       process.env.FYERS_APP_ID       || '',
    accessToken: process.env.FYERS_ACCESS_TOKEN  || '',
    appSecret:   process.env.FYERS_APP_SECRET    || '',
  };
}

export function getFyersHeaders() {
  const { appId, accessToken } = getFyersCreds();
  return {
    'Authorization': `${appId}:${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export function isLive(): boolean {
  const { appId, accessToken } = getFyersCreds();
  return !!(appId && accessToken && accessToken !== 'your_access_token_here');
}

export interface QuoteData {
  symbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePct: number;
  volume: number;
  bid: number;
  ask: number;
  oi?: number;
  iv?: number;
  timestamp: number;
}

export interface MarketQuoteResponse {
  s: string;
  d: {
    n: string;
    v: {
      lp: number;
      open_price: number;
      high_price: number;
      low_price: number;
      prev_close_price: number;
      volume: number;
      bid: number;
      ask: number;
      oi?: number;
      iv?: number;
      ch: number;
      chp: number;
      tt: number;
    };
  }[];
}

// Default watchlist: NIFTY, BANKNIFTY index + key options symbols
export const DEFAULT_WATCHLIST = [
  'NSE:NIFTY50-INDEX',
  'NSE:NIFTYBANK-INDEX',
  'NSE:INDIA VIX-INDEX',
  'NSE:FINNIFTY-INDEX',
];

// Strategy symbols for iron condor / credit spread paper trading
export const STRATEGY_UNIVERSE = [
  { symbol: 'NSE:NIFTY50-INDEX', name: 'NIFTY 50', lotSize: 50 },
  { symbol: 'NSE:NIFTYBANK-INDEX', name: 'BANKNIFTY', lotSize: 15 },
  { symbol: 'NSE:FINNIFTY-INDEX', name: 'FINNIFTY', lotSize: 40 },
];

export async function fetchQuotes(symbols: string[]): Promise<QuoteData[]> {
  if (!isLive()) {
    // Return simulated data for demo/testing
    return symbols.map(sym => generateSimulatedQuote(sym));
  }

  try {
    const symbolStr = symbols.join(',');
    const res = await fetch(
      `${FYERS_BASE_URL}/quotes?symbols=${encodeURIComponent(symbolStr)}`,
      { headers: getFyersHeaders(), cache: 'no-store' }
    );
    const json: MarketQuoteResponse = await res.json();
    if (json.s !== 'ok') throw new Error('Fyers API error');

    return json.d.map(item => ({
      symbol: item.n,
      ltp: item.v.lp,
      open: item.v.open_price,
      high: item.v.high_price,
      low: item.v.low_price,
      close: item.v.prev_close_price,
      change: item.v.ch,
      changePct: item.v.chp,
      volume: item.v.volume,
      bid: item.v.bid,
      ask: item.v.ask,
      oi: item.v.oi,
      iv: item.v.iv,
      timestamp: item.v.tt,
    }));
  } catch {
    // Fallback to simulated
    return symbols.map(sym => generateSimulatedQuote(sym));
  }
}

// Simulated quote generator (realistic NSE prices with random walk)
const simulatedBase: Record<string, number> = {
  'NSE:NIFTY50-INDEX': 24850,
  'NSE:NIFTYBANK-INDEX': 53200,
  'NSE:INDIA VIX-INDEX': 14.8,
  'NSE:FINNIFTY-INDEX': 23640,
};

const simulatedDrift: Record<string, number> = {};

export function generateSimulatedQuote(symbol: string): QuoteData {
  const base = simulatedBase[symbol] || 100;
  if (!simulatedDrift[symbol]) simulatedDrift[symbol] = 0;

  // Random walk with mean reversion
  const drift = simulatedDrift[symbol];
  const change = (Math.random() - 0.5) * base * 0.002 - drift * 0.1;
  simulatedDrift[symbol] = drift + change;

  const ltp = Math.round((base + simulatedDrift[symbol]) * 100) / 100;
  const changePct = (change / base) * 100;

  return {
    symbol,
    ltp,
    open: base * (1 + (Math.random() - 0.5) * 0.005),
    high: ltp * (1 + Math.random() * 0.008),
    low: ltp * (1 - Math.random() * 0.008),
    close: base,
    change,
    changePct,
    volume: Math.floor(Math.random() * 5000000) + 500000,
    bid: ltp - 0.05,
    ask: ltp + 0.05,
    oi: symbol.includes('VIX') ? undefined : Math.floor(Math.random() * 1000000),
    timestamp: Date.now(),
  };
}

// Strategy signal engine
export interface ThetaSignal {
  id: string;
  strategy: string;
  symbol: string;
  type: 'IRON_CONDOR' | 'BULL_PUT_SPREAD' | 'BEAR_CALL_SPREAD' | 'IRON_FLY' | 'STRANGLE';
  action: 'ENTER' | 'EXIT' | 'ADJUST' | 'HOLD';
  reason: string;
  legs: StrategyLeg[];
  netCredit: number;
  maxRisk: number;
  maxProfit: number;
  probability: number;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  regime: 'NORMAL' | 'ELEVATED' | 'EXTREME' | 'CRUSHED';
  timestamp: number;
}

export interface StrategyLeg {
  action: 'BUY' | 'SELL';
  optionType: 'CE' | 'PE';
  strike: number;
  expiry: string;
  lotSize: number;
  quantity: number;
  premium: number;
}

export function classifyVixRegime(vix: number): 'CRUSHED' | 'NORMAL' | 'ELEVATED' | 'EXTREME' {
  if (vix < 12) return 'CRUSHED';
  if (vix <= 18) return 'NORMAL';
  if (vix <= 25) return 'ELEVATED';
  return 'EXTREME';
}

export function generateStrategySignals(quotes: QuoteData[]): ThetaSignal[] {
  const signals: ThetaSignal[] = [];
  const nifty = quotes.find(q => q.symbol === 'NSE:NIFTY50-INDEX');
  const banknifty = quotes.find(q => q.symbol === 'NSE:NIFTYBANK-INDEX');
  const vixData = quotes.find(q => q.symbol === 'NSE:INDIA VIX-INDEX');
  const vix = vixData?.ltp || 15;
  const regime = classifyVixRegime(vix);

  if (nifty && (regime === 'NORMAL' || regime === 'CRUSHED')) {
    const spot = nifty.ltp;
    const roundedSpot = Math.round(spot / 50) * 50;
    const sellCallStrike = roundedSpot + 250;
    const buyCallStrike = roundedSpot + 350;
    const sellPutStrike = roundedSpot - 250;
    const buyPutStrike = roundedSpot - 350;

    // Simulate option premiums
    const callPremium = Math.max(20, (350 - (sellCallStrike - spot)) * 0.4);
    const putPremium = Math.max(20, (350 - (spot - sellPutStrike)) * 0.4);
    const netCredit = (callPremium + putPremium) * 0.8;

    signals.push({
      id: `IC-NIFTY-${Date.now()}`,
      strategy: 'Iron Condor',
      symbol: 'NIFTY',
      type: 'IRON_CONDOR',
      action: 'ENTER',
      reason: `VIX at ${vix.toFixed(1)} — ideal premium selling zone. NIFTY range-bound near ${spot.toFixed(0)}`,
      legs: [
        { action: 'SELL', optionType: 'CE', strike: sellCallStrike, expiry: getNextThursday(), lotSize: 50, quantity: 1, premium: callPremium },
        { action: 'BUY', optionType: 'CE', strike: buyCallStrike, expiry: getNextThursday(), lotSize: 50, quantity: 1, premium: callPremium * 0.3 },
        { action: 'SELL', optionType: 'PE', strike: sellPutStrike, expiry: getNextThursday(), lotSize: 50, quantity: 1, premium: putPremium },
        { action: 'BUY', optionType: 'PE', strike: buyPutStrike, expiry: getNextThursday(), lotSize: 50, quantity: 1, premium: putPremium * 0.3 },
      ],
      netCredit: netCredit * 50,
      maxRisk: (100 - netCredit) * 50,
      maxProfit: netCredit * 50,
      probability: regime === 'NORMAL' ? 68 : 62,
      urgency: 'MEDIUM',
      regime,
      timestamp: Date.now(),
    });
  }

  if (banknifty && regime === 'NORMAL') {
    const spot = banknifty.ltp;
    const roundedSpot = Math.round(spot / 100) * 100;
    const sellPutStrike = roundedSpot - 500;
    const buyPutStrike = roundedSpot - 700;
    const putPremium = Math.max(40, (700 - (spot - sellPutStrike)) * 0.5);
    const netCredit = putPremium * 0.7;

    signals.push({
      id: `BPS-BNK-${Date.now()}`,
      strategy: 'Bull Put Spread',
      symbol: 'BANKNIFTY',
      type: 'BULL_PUT_SPREAD',
      action: 'ENTER',
      reason: `BankNifty at ${spot.toFixed(0)} — OTM put spread with ${((netCredit / 200) * 100).toFixed(1)}% return on risk`,
      legs: [
        { action: 'SELL', optionType: 'PE', strike: sellPutStrike, expiry: getNextThursday(), lotSize: 15, quantity: 1, premium: putPremium },
        { action: 'BUY', optionType: 'PE', strike: buyPutStrike, expiry: getNextThursday(), lotSize: 15, quantity: 1, premium: putPremium * 0.35 },
      ],
      netCredit: netCredit * 15,
      maxRisk: (200 - netCredit) * 15,
      maxProfit: netCredit * 15,
      probability: 72,
      urgency: 'LOW',
      regime,
      timestamp: Date.now(),
    });
  }

  if (regime === 'ELEVATED' || regime === 'EXTREME') {
    signals.push({
      id: `WARN-${Date.now()}`,
      strategy: 'Risk Alert',
      symbol: 'NIFTY/BANKNIFTY',
      type: 'IRON_CONDOR',
      action: regime === 'EXTREME' ? 'EXIT' : 'ADJUST',
      reason: `⚠ VIX at ${vix.toFixed(1)} — ${regime === 'EXTREME' ? 'STOP all selling. Move to cash.' : 'Reduce size by 50%. Defined risk only.'}`,
      legs: [],
      netCredit: 0,
      maxRisk: 0,
      maxProfit: 0,
      probability: 0,
      urgency: 'HIGH',
      regime,
      timestamp: Date.now(),
    });
  }

  return signals;
}

function getNextThursday(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilThursday = (4 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilThursday);
  return d.toISOString().split('T')[0];
}
