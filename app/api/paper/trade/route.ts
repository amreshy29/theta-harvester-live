// app/api/paper/trade/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { paperEngine } from '@/lib/paperEngine';
import { fetchQuotes } from '@/lib/fyers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const demo = req.nextUrl.searchParams.get('demo') === 'true';
    const body = await req.json();
    const { action, signal, positionId, reason } = body;

    // Support demo flag in body or query param
    const isDemo = demo || body.demo === true;

    if (action === 'OPEN' && signal) {
      const position = await paperEngine.openPosition(isDemo, signal);
      return NextResponse.json({ success: true, position });
    }

    if (action === 'CLOSE' && positionId) {
      const position = await paperEngine.closePosition(isDemo, positionId, reason || 'Manual close');
      if (!position) return NextResponse.json({ success: false, error: 'Position not found' }, { status: 404 });
      return NextResponse.json({ success: true, position });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const demo = req.nextUrl.searchParams.get('demo') === 'true';

  try {
    const quotes = await fetchQuotes(['NSE:NIFTY50-INDEX']);
    const nifty = quotes.find(q => q.symbol === 'NSE:NIFTY50-INDEX');
    if (nifty) {
      await paperEngine.tickAllPositions(demo, nifty.changePct);
    }
  } catch (error) {
    // Ignore quote fetch error, fallback to returning current positions
  }

  const positions = await paperEngine.getPositions(demo);
  const trades = await paperEngine.getTrades(demo);
  const stats = await paperEngine.getPortfolioStats(demo);
  return NextResponse.json({ success: true, positions, trades, stats });
}
