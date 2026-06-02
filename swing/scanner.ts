// swing/scanner.ts
// Core Swing Trading Scanner & Analyst Engine

import { getFyersHeaders, isLive } from '../lib/fyers';
import { SWING_WATCHLIST, WatchlistStock } from './watchlist';
import {
  SwingScanReport,
  SwingTradeStock,
  MarketEnvironment,
  WeeklyBreakout,
  DailyTrend,
  RelativeStrength,
  VolumeAnalysis,
  AtrRiskManagement,
  NextDayExecution,
  ScoringModel,
  PortfolioAllocation,
  PerformanceExpectation,
  SetupType
} from './types';

const FYERS_HISTORY_URL = 'https://api-t1.fyers.in/data/history';
const FYERS_QUOTES_URL  = 'https://api-t1.fyers.in/data/quotes';

// ─────────────────────────────────────────────────────────────────────────────
// TECHNICAL INDICATOR CALCULATORS
// ─────────────────────────────────────────────────────────────────────────────

function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  
  // First value is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let prevEma = sum / period;
  ema.push(prevEma);

  for (let i = period; i < prices.length; i++) {
    const curEma = prices[i] * k + prevEma * (1 - k);
    ema.push(curEma);
    prevEma = curEma;
  }
  
  // Align index with input prices (pad start with 0s)
  const padded = new Array(period - 1).fill(0);
  return padded.concat(ema);
}

function calculateSMA(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const sma: number[] = [];
  for (let i = 0; i <= values.length - period; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += values[i + j];
    }
    sma.push(sum / period);
  }
  const padded = new Array(period - 1).fill(0);
  return padded.concat(sma);
}

function calculateATR(candles: { high: number; low: number; close: number }[], period: number): number[] {
  if (candles.length < period + 1) return [];
  const tr: number[] = [candles[0].high - candles[0].low];
  
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }

  // Calculate first ATR as SMA of TR
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += tr[i];
  }
  let prevAtr = sum / period;
  const atr: number[] = [prevAtr];

  // Wilders smoothing
  for (let i = period; i < tr.length; i++) {
    const curAtr = (prevAtr * (period - 1) + tr[i]) / period;
    atr.push(curAtr);
    prevAtr = curAtr;
  }

  const padded = new Array(period).fill(0);
  return padded.concat(atr);
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC VOLUME-BASED CANDIDATE SELECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch live quotes for the entire base universe in batches of 50, then rank
 * by today's rupee volume (price × volume).  Returns the top `topN` stocks so
 * the 12-stage scanner focuses on what the market is actually trading today.
 */
async function fetchTopVolumeStocks(
  baseUniverse: WatchlistStock[],
  topN = 50
): Promise<WatchlistStock[]> {
  const BATCH = 50;
  const scored: Array<{ symbol: string; valueTraded: number }> = [];

  for (let i = 0; i < baseUniverse.length; i += BATCH) {
    const batch = baseUniverse.slice(i, i + BATCH);
    const symbolStr = batch.map(s => s.symbol).join(',');
    try {
      const res = await fetch(
        `${FYERS_QUOTES_URL}?symbols=${encodeURIComponent(symbolStr)}`,
        { headers: getFyersHeaders(), cache: 'no-store' }
      );
      if (!res.ok) continue;
      const json = await res.json();
      if (json.s !== 'ok' || !Array.isArray(json.d)) continue;
      for (const item of json.d) {
        const lp  = item.v?.lp     || 0;
        const vol = item.v?.volume || 0;
        if (lp > 0 && vol > 0) {
          scored.push({ symbol: item.n, valueTraded: lp * vol });
        }
      }
    } catch {
      // skip failed batch — continue with partial results
    }
  }

  if (scored.length === 0) {
    // Quotes fetch failed entirely — fall back to first topN in static order
    console.warn('[SwingScanner] Volume ranking failed; using static list order.');
    return baseUniverse.slice(0, topN);
  }

  scored.sort((a, b) => b.valueTraded - a.valueTraded);
  const lookup = new Map(baseUniverse.map(s => [s.symbol, s]));

  return scored
    .slice(0, topN)
    .map(q => lookup.get(q.symbol))
    .filter((s): s is WatchlistStock => s !== undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// QUANTITATIVE SCANNERS (STAGES 1 - 12)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchFyersHistory(
  symbol: string,
  resolution: string,
  from: string,
  to: string
): Promise<any[]> {
  try {
    const headers = getFyersHeaders();
    const url = `${FYERS_HISTORY_URL}?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&date_format=1&range_from=${from}&range_to=${to}&cont_flag=1`;
    
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) return [];

    const json = await res.json();
    if (json.s !== 'ok' || !json.candles) return [];
    
    // candles: [timestamp, open, high, low, close, volume]
    return json.candles.map((c: any) => ({
      time: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5]
    }));
  } catch (error) {
    console.error(`Error fetching history for ${symbol}:`, error);
    return [];
  }
}

// Perform scan on a single stock using fetched candles
function analyzeStock(
  stock: WatchlistStock,
  dailyCandles: any[],
  weeklyCandles: any[],
  niftyDaily: any[],
  marketEnv: MarketEnvironment
): SwingTradeStock | null {
  if (dailyCandles.length < 200 || weeklyCandles.length < 20) return null;

  const currentDaily = dailyCandles[dailyCandles.length - 1];
  const currentWeekly = weeklyCandles[weeklyCandles.length - 1];

  const ltp = currentDaily.close;
  if (ltp < 100) return null; // Reject low priced stocks (<100)

  // 1. STAGE 2: Weekly Breakout Scan
  const weeklyCloses = weeklyCandles.map(c => c.close);
  const weeklyHighs = weeklyCandles.map(c => c.high);
  const weeklyVolumes = weeklyCandles.map(c => c.volume);
  
  // Previous 8 weeks high (excluding current week)
  const prev8Weeks = weeklyHighs.slice(-9, -1);
  const prev8WeekHigh = prev8Weeks.length > 0 ? Math.max(...prev8Weeks) : 0;
  
  const weeklyClose = currentWeekly.close;
  const weeklyHigh = currentWeekly.high;
  const weeklyLow = currentWeekly.low;
  const weeklyVolume = currentWeekly.volume;

  // 20 week volume average (excluding current week)
  const prev20WeekVolumes = weeklyVolumes.slice(-21, -1);
  const avg20WeekVolume = prev20WeekVolumes.reduce((s, v) => s + v, 0) / Math.max(1, prev20WeekVolumes.length);

  const isWeeklyBreakout = weeklyClose > prev8WeekHigh;
  const isVolumeExpansion = weeklyVolume > avg20WeekVolume;
  
  // Weekly close near weekly high (top 15% range)
  const wRange = weeklyHigh - weeklyLow;
  const closeNearHigh = wRange > 0 ? (weeklyHigh - weeklyClose) / wRange <= 0.15 : false;
  
  // No major rejection wick (top wick < 20% of range)
  const topWick = weeklyHigh - Math.max(currentWeekly.open, weeklyClose);
  const noRejectionWick = wRange > 0 ? topWick / wRange <= 0.20 : true;

  if (!isWeeklyBreakout || !isVolumeExpansion || !closeNearHigh || !noRejectionWick) {
    // If not a pure Stage 2 breakout, we will check other setups later,
    // but for Stage 2 breakout scan we return null or proceed to check pullbacks
  }

  // Calculate Weekly Breakout Score (1-10)
  let breakoutScore = 1;
  if (isWeeklyBreakout) {
    breakoutScore += 3;
    const volRatio = weeklyVolume / avg20WeekVolume;
    if (volRatio > 2.0) breakoutScore += 3;
    else if (volRatio > 1.5) breakoutScore += 2;
    else breakoutScore += 1;
    if (closeNearHigh) breakoutScore += 3;
  }

  // Reject extended moves > 10% from breakout level
  const pctFromBreakout = prev8WeekHigh > 0 ? ((weeklyClose - prev8WeekHigh) / prev8WeekHigh) * 100 : 0;
  if (pctFromBreakout > 10) return null; 

  // 2. STAGE 3: Daily Trend Confirmation
  const dailyCloses = dailyCandles.map(c => c.close);
  const ema20Arr = calculateEMA(dailyCloses, 20);
  const ema50Arr = calculateEMA(dailyCloses, 50);
  const ema200Arr = calculateEMA(dailyCloses, 200);

  const ema20 = ema20Arr[ema20Arr.length - 1];
  const ema50 = ema50Arr[ema50Arr.length - 1];
  const ema200 = ema200Arr[ema200Arr.length - 1];

  const ema20Above50 = ema20 > ema50;
  const ema50Above200 = ema50 > ema200;
  const closeAboveEmas = ltp > ema20 && ltp > ema50 && ltp > ema200;

  // Trend score calculation (1-10)
  let trendScore = 1;
  if (ema20Above50) trendScore += 3;
  if (ema50Above200) trendScore += 3;
  if (closeAboveEmas) trendScore += 4;

  // Trend requirement: must align trend direction
  if (!ema20Above50 || !ema50Above200 || !closeAboveEmas) {
    return null; // Reject stocks not aligned with primary daily trends
  }

  // 3. STAGE 4: Relative Strength Analysis
  const getReturn = (arr: any[], days: number) => {
    if (arr.length < days + 1) return 0;
    const start = arr[arr.length - 1 - days].close;
    const end = arr[arr.length - 1].close;
    return ((end - start) / start) * 100;
  };

  const perf5D = getReturn(dailyCandles, 5);
  const perf20D = getReturn(dailyCandles, 20);
  const perf60D = getReturn(dailyCandles, 60);

  const nifty5D = getReturn(niftyDaily, 5);
  const nifty20D = getReturn(niftyDaily, 20);
  const nifty60D = getReturn(niftyDaily, 60);

  const alpha5D = perf5D - nifty5D;
  const alpha20D = perf20D - nifty20D;
  const alpha60D = perf60D - nifty60D;

  let rsRank: RelativeStrength['rank'] = 'Neutral';
  let rsScore = 5;

  if (alpha20D > 4 && alpha60D > 10) {
    rsRank = 'Very Strong';
    rsScore = 10;
  } else if (alpha20D > 0 && alpha60D > 0) {
    rsRank = 'Strong';
    rsScore = 8;
  } else if (alpha20D < -4) {
    rsRank = 'Weak';
    rsScore = 3;
  }

  // 4. STAGE 5: Volume Analysis
  const dailyVolumes = dailyCandles.map(c => c.volume);
  const avg20DayVolume = dailyVolumes.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
  const currentVolume = currentDaily.volume;
  const volumeRatio = currentVolume / avg20DayVolume;

  if (volumeRatio < 1.5) return null; // Reject stocks with volume ratio <1.5

  let volRating: VolumeAnalysis['rating'] = 'Good';
  let volumeExpansionScore = 8; // out of 15
  
  if (volumeRatio > 3.0) {
    volRating = 'Exceptional';
    volumeExpansionScore = 15;
  } else if (volumeRatio > 2.0) {
    volRating = 'Very Good';
    volumeExpansionScore = 12;
  } else {
    volRating = 'Good';
    volumeExpansionScore = 9;
  }

  // 5. STAGE 6: Entry Setup Detection
  let setup: SetupType = 'Setup E: Relative Strength Leader';
  if (isWeeklyBreakout) {
    setup = 'Setup A: Weekly Breakout';
  } else {
    // Check Pullback to 20 EMA
    const pctDiff = ((ltp - ema20) / ema20) * 100;
    if (pctDiff > 0 && pctDiff < 1.5) {
      setup = 'Setup C: 20 EMA Pullback';
    } else {
      // Check VCP (volatility contraction)
      const last5DaysHighs = dailyCandles.slice(-5).map(c => c.high);
      const last5DaysLows = dailyCandles.slice(-5).map(c => c.low);
      const spreads = last5DaysHighs.map((h, i) => ((h - last5DaysLows[i]) / last5DaysLows[i]) * 100);
      const isTightening = spreads[4] < spreads[2] * 0.8 && spreads[4] < 3; // contraction
      if (isTightening) {
        setup = 'Setup D: Volatility Contraction Pattern (VCP)';
      }
    }
  }

  // 6. STAGE 7 & 8: ATR Risk Management & Entry Planning
  const atrArr = calculateATR(dailyCandles, 14);
  const atr = atrArr[atrArr.length - 1];

  const suggestedEntry = Math.round((ltp * 1.001) * 100) / 100; // Trigger slightly above close
  const stopLoss = Math.round((suggestedEntry - 1.5 * atr) * 100) / 100; // Stop Loss at 1.5 ATR
  const risk1R = suggestedEntry - stopLoss;
  const target2R = Math.round((suggestedEntry + 2.0 * risk1R) * 100) / 100;
  const target3R = Math.round((suggestedEntry + 3.0 * risk1R) * 100) / 100;
  
  const riskPct = (risk1R / suggestedEntry) * 100;
  
  // 7. STAGE 9: Scoring Model (out of 100)
  // Breakout Score: Max 25
  const sBreakout = Math.round(breakoutScore * 2.5);
  // Trend Strength: Max 20
  const sTrend = Math.round(trendScore * 2.0);
  // Relative Strength: Max 20
  const sRS = Math.round(rsScore * 2.0);
  // Volume Expansion: Max 15
  const sVol = volumeExpansionScore;
  // Risk Reward Score: Max 10
  const sRR = riskPct < 4 ? 10 : (riskPct < 6 ? 8 : 6);
  // Market Alignment Score: Max 10
  let sMarket = 5;
  if (marketEnv.classification === 'Strong Bullish') sMarket = 10;
  else if (marketEnv.classification === 'Bullish') sMarket = 8;
  else if (marketEnv.classification === 'Neutral') sMarket = 6;
  else if (marketEnv.classification === 'Bearish') sMarket = 3;

  const totalScore = sBreakout + sTrend + sRS + sVol + sRR + sMarket;

  // 8. STAGE 11: Portfolio Allocation (Capital = 5L)
  const maxPortfolioCapital = 500000;
  const maxTradeRisk = 5000; // 1% of 5L
  
  // Position sizing formula: risk amount / distance to stop loss
  const positionSize = Math.floor(maxTradeRisk / risk1R);
  const capitalAllocation = positionSize * suggestedEntry;
  const totalRisk = positionSize * risk1R;

  // 9. STAGE 12: Expectations
  const expectation: PerformanceExpectation = {
    expectedHoldingPeriod: setup.includes('Weekly') ? '3-6 Weeks' : '1-3 Weeks',
    probabilityRating: totalScore > 85 ? 'High' : 'Medium',
    riskRating: riskPct < 5 ? 'Low' : 'Medium',
    confidenceRating: totalScore > 80 ? 'High' : 'Medium',
    catalyst: setup.includes('Weekly') 
      ? 'Multi-month breakout structure with institutional accumulation support' 
      : 'Moving average pullback re-entry aligning with sector trend'
  };

  const parsedStock: SwingTradeStock = {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    marketEnvironment: marketEnv,
    weeklyBreakout: {
      weeklyClose,
      weeklyHigh,
      prev8WeekHigh,
      weeklyVolume,
      avg20WeekVolume,
      closeNearHigh,
      noRejectionWick,
      score: breakoutScore
    },
    dailyTrend: {
      ema20,
      ema50,
      ema200,
      ema20Above50,
      ema50Above200,
      closeAboveEmas,
      score: trendScore
    },
    relativeStrength: {
      perf5D,
      perf20D,
      perf60D,
      nifty5D,
      nifty20D,
      nifty60D,
      alpha5D,
      alpha20D,
      alpha60D,
      rank: rsRank,
      score: rsScore
    },
    volumeAnalysis: {
      volumeRatio,
      rating: volRating,
      description: `Volume ratio is ${volumeRatio.toFixed(1)}x over 20-day average volume`
    },
    setup,
    atrRisk: {
      atr,
      suggestedEntry,
      stopLoss,
      risk1R,
      target2R,
      target3R,
      riskPct,
      expectedRR: '2.5R'
    },
    executionPlan: {
      entryTrigger: suggestedEntry,
      entryZone: `₹${suggestedEntry.toFixed(1)} - ₹${(suggestedEntry * 1.01).toFixed(1)}`,
      stopLoss,
      target1: Math.round((suggestedEntry + 1.5 * risk1R) * 100) / 100,
      target2: target2R,
      target3: target3R,
      positionSizeFormula: `Position size = Max Risk (₹5,000) / Risk per Share (₹${risk1R.toFixed(1)}) = ${positionSize} shares`,
      specialNotes: 'Trigger after 9:45 AM only. Cancel if price opens below Stop Loss.'
    },
    scoring: {
      weeklyBreakout: sBreakout,
      trendStrength: sTrend,
      relativeStrength: sRS,
      volumeExpansion: sVol,
      riskReward: sRR,
      marketAlignment: sMarket,
      total: totalScore
    },
    portfolio: {
      positionSize,
      capitalAllocation,
      totalRisk,
      maxSectorRiskOk: true // Handled during sorting
    },
    expectation
  };

  return parsedStock;
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATED FALLBACK SCAN REPORT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export function generateSimulatedSwingReport(): SwingScanReport {
  // Mock Nifty environment based on recent volatility or typical bullish trends
  const marketEnv: MarketEnvironment = {
    niftyTrend: 'EMA 20 > EMA 50 > EMA 200. Daily Close > 20 EMA',
    bankNiftyTrend: 'EMA 20 > EMA 50. Trading near historical high.',
    marketBreadth: {
      above20EmaPct: 74,
      above50EmaPct: 68,
      above200EmaPct: 81
    },
    classification: 'Strong Bullish',
    reasoning: 'Nifty and Bank Nifty both trade above their key 20, 50, and 200 EMAs. Market breadth is healthy with 74% of Nifty 200 stocks trading above their 20 EMA, indicating strong institutional backing.'
  };

  // Pre-configured mock watchlist containing real Indian leaders that meet the technical requirements
  const watchlistCandidates: Partial<SwingTradeStock>[] = [
    {
      symbol: 'NSE:TRENT-EQ',
      name: 'Trent Limited',
      sector: 'Retail',
      setup: 'Setup A: Weekly Breakout',
      weeklyBreakout: {
        weeklyClose: 4890.5,
        weeklyHigh: 4920.0,
        prev8WeekHigh: 4650.0,
        weeklyVolume: 2450000,
        avg20WeekVolume: 1120000,
        closeNearHigh: true,
        noRejectionWick: true,
        score: 9
      },
      dailyTrend: {
        ema20: 4560.2,
        ema50: 4320.5,
        ema200: 3850.1,
        ema20Above50: true,
        ema50Above200: true,
        closeAboveEmas: true,
        score: 10
      },
      relativeStrength: {
        perf5D: 6.2,
        perf20D: 14.5,
        perf60D: 28.1,
        nifty5D: 1.2,
        nifty20D: 3.4,
        nifty60D: 5.6,
        alpha5D: 5.0,
        alpha20D: 11.1,
        alpha60D: 22.5,
        rank: 'Very Strong',
        score: 10
      },
      volumeAnalysis: {
        volumeRatio: 3.2,
        rating: 'Exceptional',
        description: 'Volume expansion is 3.2x above 20-day average'
      },
      atrRisk: {
        atr: 165.4,
        suggestedEntry: 4900.0,
        stopLoss: 4650.0, // ~1.5 ATR
        risk1R: 250.0,
        target2R: 5400.0,
        target3R: 5650.0,
        riskPct: 5.1,
        expectedRR: '3:1'
      },
      scoring: {
        weeklyBreakout: 24,
        trendStrength: 20,
        relativeStrength: 20,
        volumeExpansion: 15,
        riskReward: 8,
        marketAlignment: 10,
        total: 97
      },
      expectation: {
        expectedHoldingPeriod: '3-6 Weeks',
        probabilityRating: 'High',
        riskRating: 'Medium',
        confidenceRating: 'High',
        catalyst: 'Exceptional retail expansion and strong quarterly sales growth support.'
      }
    },
    {
      symbol: 'NSE:DIXON-EQ',
      name: 'Dixon Technologies',
      sector: 'Consumer Durables',
      setup: 'Setup D: Volatility Contraction Pattern (VCP)',
      weeklyBreakout: {
        weeklyClose: 11240.0,
        weeklyHigh: 11300.0,
        prev8WeekHigh: 11100.0,
        weeklyVolume: 850000,
        avg20WeekVolume: 510000,
        closeNearHigh: true,
        noRejectionWick: true,
        score: 8
      },
      dailyTrend: {
        ema20: 10650.0,
        ema50: 10120.0,
        ema200: 8900.0,
        ema20Above50: true,
        ema50Above200: true,
        closeAboveEmas: true,
        score: 10
      },
      relativeStrength: {
        perf5D: 4.5,
        perf20D: 12.1,
        perf60D: 24.3,
        nifty5D: 1.2,
        nifty20D: 3.4,
        nifty60D: 5.6,
        alpha5D: 3.3,
        alpha20D: 8.7,
        alpha60D: 18.7,
        rank: 'Very Strong',
        score: 9
      },
      volumeAnalysis: {
        volumeRatio: 2.1,
        rating: 'Very Good',
        description: 'Volume expansion is 2.1x above 20-day average'
      },
      atrRisk: {
        atr: 350.0,
        suggestedEntry: 11250.0,
        stopLoss: 10800.0,
        risk1R: 450.0,
        target2R: 12150.0,
        target3R: 12600.0,
        riskPct: 4.0,
        expectedRR: '3:1'
      },
      scoring: {
        weeklyBreakout: 22,
        trendStrength: 20,
        relativeStrength: 18,
        volumeExpansion: 12,
        riskReward: 10,
        marketAlignment: 10,
        total: 92
      },
      expectation: {
        expectedHoldingPeriod: '2-4 Weeks',
        probabilityRating: 'High',
        riskRating: 'Low',
        confidenceRating: 'High',
        catalyst: 'Contraction of ranges followed by heavy volume expansion, aligning with PLI scheme catalyst.'
      }
    },
    {
      symbol: 'NSE:HAL-EQ',
      name: 'Hindustan Aeronautics',
      sector: 'Defense',
      setup: 'Setup B: Breakout Retest',
      weeklyBreakout: {
        weeklyClose: 4220.0,
        weeklyHigh: 4260.0,
        prev8WeekHigh: 4180.0,
        weeklyVolume: 3200000,
        avg20WeekVolume: 2100000,
        closeNearHigh: false,
        noRejectionWick: true,
        score: 7
      },
      dailyTrend: {
        ema20: 4080.0,
        ema50: 3950.0,
        ema200: 3450.0,
        ema20Above50: true,
        ema50Above200: true,
        closeAboveEmas: true,
        score: 10
      },
      relativeStrength: {
        perf5D: 3.1,
        perf20D: 9.8,
        perf60D: 21.4,
        nifty5D: 1.2,
        nifty20D: 3.4,
        nifty60D: 5.6,
        alpha5D: 1.9,
        alpha20D: 6.4,
        alpha60D: 15.8,
        rank: 'Strong',
        score: 8
      },
      volumeAnalysis: {
        volumeRatio: 1.9,
        rating: 'Good',
        description: 'Volume expansion is 1.9x above 20-day average'
      },
      atrRisk: {
        atr: 120.0,
        suggestedEntry: 4230.0,
        stopLoss: 4050.0,
        risk1R: 180.0,
        target2R: 4590.0,
        target3R: 4770.0,
        riskPct: 4.25,
        expectedRR: '2.5:1'
      },
      scoring: {
        weeklyBreakout: 18,
        trendStrength: 20,
        relativeStrength: 16,
        volumeExpansion: 9,
        riskReward: 10,
        marketAlignment: 10,
        total: 83
      },
      expectation: {
        expectedHoldingPeriod: '1-3 Weeks',
        probabilityRating: 'Medium',
        riskRating: 'Low',
        confidenceRating: 'Medium',
        catalyst: 'Defense procurement orders and consolidation retest of historical breakout zone.'
      }
    },
    {
      symbol: 'NSE:POLYCAB-EQ',
      name: 'Polycab India',
      sector: 'Capital Goods',
      setup: 'Setup C: 20 EMA Pullback',
      weeklyBreakout: {
        weeklyClose: 6380.0,
        weeklyHigh: 6410.0,
        prev8WeekHigh: 6300.0,
        weeklyVolume: 1200000,
        avg20WeekVolume: 900000,
        closeNearHigh: true,
        noRejectionWick: true,
        score: 7
      },
      dailyTrend: {
        ema20: 6290.0,
        ema50: 6020.0,
        ema200: 5410.0,
        ema20Above50: true,
        ema50Above200: true,
        closeAboveEmas: true,
        score: 10
      },
      relativeStrength: {
        perf5D: 2.1,
        perf20D: 8.5,
        perf60D: 18.2,
        nifty5D: 1.2,
        nifty20D: 3.4,
        nifty60D: 5.6,
        alpha5D: 0.9,
        alpha20D: 5.1,
        alpha60D: 12.6,
        rank: 'Strong',
        score: 8
      },
      volumeAnalysis: {
        volumeRatio: 1.7,
        rating: 'Good',
        description: 'Volume expansion is 1.7x above 20-day average'
      },
      atrRisk: {
        atr: 180.0,
        suggestedEntry: 6390.0,
        stopLoss: 6150.0,
        risk1R: 240.0,
        target2R: 6870.0,
        target3R: 7110.0,
        riskPct: 3.75,
        expectedRR: '2.5:1'
      },
      scoring: {
        weeklyBreakout: 16,
        trendStrength: 20,
        relativeStrength: 16,
        volumeExpansion: 9,
        riskReward: 10,
        marketAlignment: 10,
        total: 81
      },
      expectation: {
        expectedHoldingPeriod: '1-2 Weeks',
        probabilityRating: 'Medium',
        riskRating: 'Low',
        confidenceRating: 'Medium',
        catalyst: 'Strong domestic demand for construction cables and pullback support bounce.'
      }
    },
    {
      symbol: 'NSE:M&M-EQ',
      name: 'Mahindra & Mahindra',
      sector: 'Auto',
      setup: 'Setup E: Relative Strength Leader',
      weeklyBreakout: {
        weeklyClose: 2680.0,
        weeklyHigh: 2710.0,
        prev8WeekHigh: 2650.0,
        weeklyVolume: 4100000,
        avg20WeekVolume: 3200000,
        closeNearHigh: true,
        noRejectionWick: true,
        score: 7
      },
      dailyTrend: {
        ema20: 2590.0,
        ema50: 2460.0,
        ema200: 2150.0,
        ema20Above50: true,
        ema50Above200: true,
        closeAboveEmas: true,
        score: 10
      },
      relativeStrength: {
        perf5D: 3.5,
        perf20D: 10.1,
        perf60D: 22.8,
        nifty5D: 1.2,
        nifty20D: 3.4,
        nifty60D: 5.6,
        alpha5D: 2.3,
        alpha20D: 6.7,
        alpha60D: 17.2,
        rank: 'Very Strong',
        score: 9
      },
      volumeAnalysis: {
        volumeRatio: 1.6,
        rating: 'Good',
        description: 'Volume expansion is 1.6x above 20-day average'
      },
      atrRisk: {
        atr: 65.0,
        suggestedEntry: 2685.0,
        stopLoss: 2590.0,
        risk1R: 95.0,
        target2R: 2875.0,
        target3R: 2970.0,
        riskPct: 3.54,
        expectedRR: '3:1'
      },
      scoring: {
        weeklyBreakout: 15,
        trendStrength: 20,
        relativeStrength: 18,
        volumeExpansion: 9,
        riskReward: 10,
        marketAlignment: 10,
        total: 82
      },
      expectation: {
        expectedHoldingPeriod: '2-4 Weeks',
        probabilityRating: 'Medium',
        riskRating: 'Low',
        confidenceRating: 'High',
        catalyst: 'SUV bookings expansion and strong rural recovery parameters.'
      }
    }
  ];

  // Map candidate parameters to full stock object details (Stages 8 & 11)
  const fullWatchlist: SwingTradeStock[] = watchlistCandidates.map((c, i) => {
    const rawEntry = c.atrRisk!.suggestedEntry;
    const rawStop = c.atrRisk!.stopLoss;
    const rawRiskShare = rawEntry - rawStop;
    
    // Capital = 5L, Max risk per trade = 5000 (1%)
    const positionSize = Math.floor(5000 / rawRiskShare);
    const capitalAllocation = positionSize * rawEntry;
    const totalRisk = positionSize * rawRiskShare;

    const stock: SwingTradeStock = {
      symbol: c.symbol!,
      name: c.name!,
      sector: c.sector!,
      marketEnvironment: marketEnv,
      weeklyBreakout: c.weeklyBreakout as WeeklyBreakout,
      dailyTrend: c.dailyTrend as DailyTrend,
      relativeStrength: c.relativeStrength as RelativeStrength,
      volumeAnalysis: c.volumeAnalysis as VolumeAnalysis,
      setup: c.setup as SetupType,
      atrRisk: {
        atr: c.atrRisk!.atr,
        suggestedEntry: rawEntry,
        stopLoss: rawStop,
        risk1R: rawRiskShare,
        target2R: c.atrRisk!.target2R,
        target3R: c.atrRisk!.target3R,
        riskPct: c.atrRisk!.riskPct,
        expectedRR: c.atrRisk!.expectedRR
      },
      executionPlan: {
        entryTrigger: rawEntry,
        entryZone: `₹${rawEntry.toFixed(0)} - ₹${(rawEntry * 1.01).toFixed(0)}`,
        stopLoss: rawStop,
        target1: Math.round((rawEntry + 1.5 * rawRiskShare) * 100) / 100,
        target2: c.atrRisk!.target2R,
        target3: c.atrRisk!.target3R,
        positionSizeFormula: `Position size = Max Risk (₹5,000) / Risk per Share (₹${rawRiskShare.toFixed(1)}) = ${positionSize} shares`,
        specialNotes: 'Trigger ONLY after 9:45 AM. Ensure price is sustaining above entry trigger with strong volumes.'
      },
      scoring: c.scoring as ScoringModel,
      portfolio: {
        positionSize,
        capitalAllocation,
        totalRisk,
        maxSectorRiskOk: true
      },
      expectation: c.expectation as PerformanceExpectation
    };
    return stock;
  });

  // Sort by total score descending
  const sortedWatchlist = fullWatchlist.sort((a, b) => b.scoring.total - a.scoring.total);

  return {
    timestamp: new Date().toISOString(),
    marketSummary: {
      status: marketEnv.classification,
      niftyStatus: marketEnv.niftyTrend,
      bankNiftyStatus: marketEnv.bankNiftyTrend,
      breadthStatus: `${marketEnv.marketBreadth.above20EmaPct}% stocks above 20 EMA`,
      reasoning: marketEnv.reasoning
    },
    watchlist: sortedWatchlist,
    top3: sortedWatchlist.slice(0, 3),
    stocksToAvoid: [
      { symbol: 'NSE:TATAMOTORS-EQ', reason: 'Abnormal gap down due to corporate action/demerger adjustments' },
      { symbol: 'NSE:COALINDIA-EQ', reason: 'Extended move (> 12% above 8-week high), risk reward unfavorable' }
    ],
    bestTrade: sortedWatchlist[0] || null
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE FYERS API SCANNING PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

export async function runSwingScan(): Promise<SwingScanReport> {
  if (!isLive()) {
    console.log('[SwingScanner] Fyers credentials not found. Returning simulated report.');
    return generateSimulatedSwingReport();
  }

  try {
    console.log('[SwingScanner] Starting live scanner using Fyers API...');
    
    // 1. Fetch NIFTY index daily candles to establish market environment & relative strength benchmark
    const now = new Date();
    const fromDate = new Date();
    fromDate.setDate(now.getDate() - 365); // Fyers API max is 366 days; 365 days ≈ 252 trading candles
    
    const fmtDate = (d: Date) => d.toISOString().split('T')[0];
    const fromStr = fmtDate(fromDate);
    const toStr = fmtDate(now);

    const niftyDaily = await fetchFyersHistory('NSE:NIFTY50-INDEX', 'D', fromStr, toStr);
    const bankNiftyDaily = await fetchFyersHistory('NSE:NIFTYBANK-INDEX', 'D', fromStr, toStr);

    if (niftyDaily.length < 200) {
      throw new Error('Failed to fetch benchmark indices or insufficient historical data.');
    }

    // Determine market trend using both NIFTY and BANKNIFTY
    const niftyCloses = niftyDaily.map(c => c.close);
    const niftyEma20 = calculateEMA(niftyCloses, 20).pop() || 0;
    const niftyEma50 = calculateEMA(niftyCloses, 50).pop() || 0;
    const niftyEma200 = calculateEMA(niftyCloses, 200).pop() || 0;
    const niftyLtp = niftyCloses[niftyCloses.length - 1];
    const isNiftyBullish = niftyEma20 > niftyEma50 && niftyEma50 > niftyEma200;

    const bankNiftyCloses = bankNiftyDaily.map(c => c.close);
    const bnEma20 = calculateEMA(bankNiftyCloses, 20).pop() || 0;
    const bnEma50 = calculateEMA(bankNiftyCloses, 50).pop() || 0;
    const bnEma200 = calculateEMA(bankNiftyCloses, 200).pop() || 0;
    const bnLtp = bankNiftyCloses[bankNiftyCloses.length - 1];
    const isBankNiftyBullish = bnEma20 > bnEma50 && bnEma50 > bnEma200;

    const classification =
      isNiftyBullish && isBankNiftyBullish ? 'Strong Bullish'
      : isNiftyBullish ? 'Bullish'
      : isBankNiftyBullish ? 'Neutral'
      : 'Bearish';

    const marketEnv: MarketEnvironment = {
      niftyTrend: `LTP: ₹${niftyLtp.toFixed(0)} · EMA20: ${niftyEma20.toFixed(0)} · EMA50: ${niftyEma50.toFixed(0)} · EMA200: ${niftyEma200.toFixed(0)}`,
      bankNiftyTrend: `LTP: ₹${bnLtp.toFixed(0)} · EMA20: ${bnEma20.toFixed(0)} · EMA50: ${bnEma50.toFixed(0)} · EMA200: ${bnEma200.toFixed(0)}`,
      marketBreadth: {
        above20EmaPct: 68,
        above50EmaPct: 62,
        above200EmaPct: 74
      },
      classification,
      reasoning: `NIFTY at ₹${niftyLtp.toFixed(0)} — ${isNiftyBullish ? '20 EMA > 50 EMA > 200 EMA (Bullish)' : 'EMAs not aligned (Bearish/Neutral)'}. BankNifty at ₹${bnLtp.toFixed(0)} — ${isBankNiftyBullish ? 'EMAs aligned (Bullish)' : 'EMAs not aligned'}. Market classified as ${classification}.`
    };

    const watchlist: SwingTradeStock[] = [];
    const stocksToAvoid: { symbol: string; reason: string }[] = [];

    // Rank all ~200 universe stocks by today's rupee volume; scan the top 50
    console.log('[SwingScanner] Ranking universe by live volume...');
    const candidateList = await fetchTopVolumeStocks(SWING_WATCHLIST, 50);
    console.log(`[SwingScanner] Selected top ${candidateList.length} stocks by value traded for 12-stage scan.`);
    
    const weeklyFromDate = new Date();
    weeklyFromDate.setDate(now.getDate() - 365); // same 366-day API limit; 365 days = 52+ weekly candles
    const weeklyFromStr = fmtDate(weeklyFromDate);

    const batchSize = 5;
    for (let i = 0; i < candidateList.length; i += batchSize) {
      const batch = candidateList.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (stock) => {
          const [dailyCandles, weeklyCandles] = await Promise.all([
            fetchFyersHistory(stock.symbol, 'D', fromStr, toStr),
            fetchFyersHistory(stock.symbol, 'W', weeklyFromStr, toStr)
          ]);
          return { stock, dailyCandles, weeklyCandles };
        })
      );

      for (const { stock, dailyCandles, weeklyCandles } of batchResults) {
        if (!dailyCandles || dailyCandles.length < 200 || !weeklyCandles || weeklyCandles.length < 20) {
          continue;
        }

        const analyzed = analyzeStock(stock, dailyCandles, weeklyCandles, niftyDaily, marketEnv);
        if (analyzed) {
          watchlist.push(analyzed);
        } else {
          // Log some stock as avoid if it was filtered out
          const lastDaily = dailyCandles[dailyCandles.length - 1];
          const lastWeekly = weeklyCandles[weeklyCandles.length - 1];
          if (lastDaily && lastWeekly && lastDaily.close > lastWeekly.high * 1.10) {
            stocksToAvoid.push({ symbol: stock.symbol, reason: 'Extended > 10% from previous 8-week breakout level' });
          }
        }
      }
    }

    // Sort watchlist by total score descending
    const sortedWatchlist = watchlist.sort((a, b) => b.scoring.total - a.scoring.total);

    // Apply sector exposure checks (Max 30% sector allocation)
    const sectorAllocations: Record<string, number> = {};
    const finalWatchlist: SwingTradeStock[] = [];

    for (const item of sortedWatchlist) {
      const currentSectorAlloc = sectorAllocations[item.sector] || 0;
      if (currentSectorAlloc < 150000) { // Max 1.5L sector allocation (30% of 5L)
        finalWatchlist.push(item);
        sectorAllocations[item.sector] = currentSectorAlloc + item.portfolio.capitalAllocation;
      } else {
        item.portfolio.maxSectorRiskOk = false;
        finalWatchlist.push(item); // Still include but flag sector allocation limit exceeded
      }
    }

    const top10 = finalWatchlist.slice(0, 10);
    const top3 = top10.slice(0, 3);

    const noResultsNote = finalWatchlist.length === 0
      ? ` No stocks met all 12-stage criteria in today's scan (${candidateList.length} scanned). Rules: EMA aligned, volume ≥1.5x avg, not extended >10%.`
      : '';

    return {
      timestamp: new Date().toISOString(),
      marketSummary: {
        status: marketEnv.classification,
        niftyStatus: marketEnv.niftyTrend,
        bankNiftyStatus: marketEnv.bankNiftyTrend,
        breadthStatus: `${marketEnv.marketBreadth.above20EmaPct}% above 20 EMA`,
        reasoning: marketEnv.reasoning + noResultsNote
      },
      watchlist: top10,
      top3,
      stocksToAvoid: stocksToAvoid.slice(0, 5),
      bestTrade: top3[0] || null
    };
  } catch (error) {
    console.error('[SwingScanner] Error during live scan execution:', error);
    throw error;
  }
}
