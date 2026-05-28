// lib/fyers.ts
// Fyers API v3 wrapper for server-side use
// IMPORTANT: credentials are read at call-time (not module load)
// so .env changes / Vercel re-deployments are picked up correctly.

import { QuoteData, generateSimulatedQuote } from './signals';

// Re-export everything from signals to maintain server compatibility
export * from './signals';

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
