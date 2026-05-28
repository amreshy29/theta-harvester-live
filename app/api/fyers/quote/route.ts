// app/api/fyers/quote/route.ts
import { NextResponse } from 'next/server';
import { fetchQuotes, generateStrategySignals, classifyVixRegime, DEFAULT_WATCHLIST } from '@/lib/fyers';
import { paperEngine } from '@/lib/paperEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const quotes = await fetchQuotes(DEFAULT_WATCHLIST);
    const signals = generateStrategySignals(quotes);

    const vix = quotes.find(q => q.symbol === 'NSE:INDIA VIX-INDEX')?.ltp || 15;
    const nifty = quotes.find(q => q.symbol === 'NSE:NIFTY50-INDEX');
    const regime = classifyVixRegime(vix);

    // Auto-tick paper positions with NIFTY price change
    if (nifty) {
      paperEngine.tickAllPositions(nifty.changePct);
    }

    const portfolioStats = paperEngine.getPortfolioStats();

    return NextResponse.json({
      success: true,
      quotes,
      signals,
      regime,
      vix,
      portfolioStats,
      isSimulated: !process.env.FYERS_ACCESS_TOKEN,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
