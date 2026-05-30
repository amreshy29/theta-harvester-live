// app/api/fyers/quote/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchQuotes, generateStrategySignals, classifyVixRegime, DEFAULT_WATCHLIST, isLive } from '@/lib/fyers';
import { paperEngine } from '@/lib/paperEngine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const demo = req.nextUrl.searchParams.get('demo') === 'true';

    const quotes = await fetchQuotes(DEFAULT_WATCHLIST);
    const signals = generateStrategySignals(quotes);

    const vix = quotes.find(q => q.symbol === 'NSE:INDIA VIX-INDEX')?.ltp || 15;
    const nifty = quotes.find(q => q.symbol === 'NSE:NIFTY50-INDEX');
    const regime = classifyVixRegime(vix);

    // Auto-tick paper positions with NIFTY price change
    if (nifty) {
      await paperEngine.tickAllPositions(demo, nifty.changePct);
    }

    const portfolioStats = await paperEngine.getPortfolioStats(demo);

    return NextResponse.json({
      success: true,
      quotes,
      signals,
      regime,
      vix,
      portfolioStats,
      isSimulated: !isLive(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
