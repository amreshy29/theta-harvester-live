// app/api/fyers/screener/route.ts
// Breakout-radar screener: scans NSE equities for stocks that are
// 20-50% below their 52-week high, forming a tight price base, and
// now showing unusual volume — classic breakout-setup criteria.

import { NextRequest, NextResponse } from 'next/server';
import { getFyersHeaders, isLive } from '@/lib/fyers';
import { SCREENER_UNIVERSE, ScreenerStock, generateMockScreenerData } from '@/lib/screener';

export const dynamic = 'force-dynamic';

const BASE = 'https://api-t1.fyers.in/data';

// Fyers daily candle: [timestamp, open, high, low, close, volume]
type Candle = [number, number, number, number, number, number];

async function fetchHistory(symbol: string, days: number): Promise<Candle[]> {
  const now   = Math.floor(Date.now() / 1000);
  const from  = now - (days + 70) * 86_400; // buffer for holidays/weekends
  try {
    const res = await fetch(
      `${BASE}/history?symbol=${encodeURIComponent(symbol)}&resolution=D&date_format=1&range_from=${from}&range_to=${now}`,
      { headers: getFyersHeaders(), cache: 'no-store' }
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (json.s !== 'ok' || !Array.isArray(json.candles)) return [];
    return json.candles as Candle[];
  } catch {
    return [];
  }
}

async function fetchQuotesBatch(symbols: string[]): Promise<any[]> {
  try {
    const res = await fetch(
      `${BASE}/quotes?symbols=${encodeURIComponent(symbols.join(','))}`,
      { headers: getFyersHeaders(), cache: 'no-store' }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.s === 'ok' ? (json.d || []) : [];
  } catch {
    return [];
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function runInBatches<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(t => t()));
    results.push(...batchResults);
  }
  return results;
}

function computeStock(
  symbol: string,
  name: string,
  sector: string,
  ltp: number,
  todayVolume: number,
  change: number,
  changePct: number,
  candles: Candle[],
  minVolRatio: number,
  minDepth: number,
  maxDepth: number
): ScreenerStock | null {
  if (candles.length < 25) return null;

  // Derive 52-week window (up to 252 trading days)
  const last252 = candles.slice(-252);
  const last20  = candles.slice(-20);
  const last5   = candles.slice(-5);

  const weekHigh52 = Math.max(...last252.map(c => c[2]));
  const weekLow52  = Math.min(...last252.map(c => c[3]));

  if (weekHigh52 <= 0) return null;

  const pctFromHigh = ((weekHigh52 - ltp) / weekHigh52) * 100;
  if (pctFromHigh < minDepth || pctFromHigh > maxDepth) return null;

  // 20-day average volume from history (exclude today which is in live quote)
  const avgVolume20d = last20.reduce((s, c) => s + c[5], 0) / last20.length;
  const volumeRatio  = avgVolume20d > 0 ? todayVolume / avgVolume20d : 1;
  if (volumeRatio < minVolRatio) return null;

  // Consolidation: % price range over last 20 days
  const high20d = Math.max(...last20.map(c => c[2]));
  const low20d  = Math.min(...last20.map(c => c[3]));
  const avg20d  = last20.reduce((s, c) => s + c[4], 0) / last20.length;
  const consolidationRange = avg20d > 0 ? ((high20d - low20d) / avg20d) * 100 : 100;

  // Breakout line = 20-day high (resistance)
  const breakoutLine  = high20d;
  const isBreakingOut = ltp > breakoutLine;

  // 5-day trend
  const price5dAgo = last5[0]?.[4] ?? ltp;
  const trend5d    = price5dAgo > 0 ? ((ltp - price5dAgo) / price5dAgo) * 100 : 0;

  // Base length: consecutive days within ±12% of current price (counted backward)
  const baseHigh = ltp * 1.12;
  const baseLow  = ltp * 0.88;
  let baseLength = 0;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i][4] >= baseLow && candles[i][4] <= baseHigh) baseLength++;
    else break;
  }

  // Composite score (0-100):
  // Volume surge    up to 40 pts — ratio 1.5→0, 2.0→10, 3.5→40
  // Tight base      up to 25 pts — range 5%→22, 10%→14, 17%+→0
  // Ideal depth     up to 20 pts — sweet-spot 35% below high
  // Momentum        up to 15 pts — 5d positive trend
  const volScore    = Math.max(0, Math.min(40, (volumeRatio - 1.5) * 20));
  const baseScore   = Math.max(0, 25 - consolidationRange * 1.4);
  const depthScore  = Math.max(0, 20 - Math.abs(pctFromHigh - 35) * 0.8);
  const trendScore  = Math.min(15, Math.max(0, trend5d * 4));
  const score       = Math.round(volScore + baseScore + depthScore + trendScore);

  return {
    symbol, name, sector,
    ltp, change, changePct,
    weekHigh52, weekLow52,
    pctFromHigh,
    todayVolume, avgVolume20d, volumeRatio,
    consolidationRange, breakoutLine, isBreakingOut,
    trend5d, baseLength, score,
  };
}

export async function GET(req: NextRequest) {
  const sp         = req.nextUrl.searchParams;
  const minVolRatio = parseFloat(sp.get('minVol') || '1.5');
  const minDepth    = parseFloat(sp.get('minDepth') || '20');
  const maxDepth    = parseFloat(sp.get('maxDepth') || '50');

  // Demo mode: return mock data
  if (!isLive() || sp.get('demo') === 'true') {
    const mock = generateMockScreenerData().filter(
      s => s.pctFromHigh >= minDepth && s.pctFromHigh <= maxDepth && s.volumeRatio >= minVolRatio
    );
    return NextResponse.json({
      success:     true,
      stocks:      mock,
      scannedAt:   new Date().toISOString(),
      isSimulated: true,
      total:       SCREENER_UNIVERSE.length,
    });
  }

  try {
    // 1. Fetch all quotes in batches of 50
    const allSymbols = SCREENER_UNIVERSE.map(s => s.symbol);
    const quoteBatches = await Promise.all(
      chunk(allSymbols, 50).map(b => fetchQuotesBatch(b))
    );
    const allQuotes = quoteBatches.flat();
    const quoteMap  = new Map(allQuotes.map((q: any) => [q.n, q.v as any]));

    // 2. Fetch 300-day history for each stock (parallel, 8 at a time)
    const tasks = SCREENER_UNIVERSE.map(stock => async () => {
      const qv = quoteMap.get(stock.symbol);
      if (!qv) return null;

      const ltp         = qv.lp   ?? 0;
      const todayVolume = qv.volume ?? 0;
      const change      = qv.ch   ?? 0;
      const changePct   = qv.chp  ?? 0;

      if (ltp <= 0) return null;

      const candles = await fetchHistory(stock.symbol, 300);
      return computeStock(
        stock.symbol, stock.name, stock.sector,
        ltp, todayVolume, change, changePct,
        candles, minVolRatio, minDepth, maxDepth
      );
    });

    const results = await runInBatches(tasks, 8);
    const stocks  = (results.filter(Boolean) as ScreenerStock[])
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      success:     true,
      stocks,
      scannedAt:   new Date().toISOString(),
      isSimulated: false,
      total:       SCREENER_UNIVERSE.length,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
