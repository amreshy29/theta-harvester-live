// app/api/paper/trade/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { paperEngine } from '@/lib/paperEngine';
import { fetchQuotes } from '@/lib/fyers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, signal, positionId, reason } = body;

    if (action === 'OPEN' && signal) {
      const position = paperEngine.openPosition(signal);
      return NextResponse.json({ success: true, position });
    }

    if (action === 'CLOSE' && positionId) {
      const position = paperEngine.closePosition(positionId, reason || 'Manual close');
      if (!position) return NextResponse.json({ success: false, error: 'Position not found' }, { status: 404 });
      return NextResponse.json({ success: true, position });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const quotes = await fetchQuotes(['NSE:NIFTY50-INDEX']);
    const nifty = quotes.find(q => q.symbol === 'NSE:NIFTY50-INDEX');
    if (nifty) {
      paperEngine.tickAllPositions(nifty.changePct);
    }
  } catch (error) {
    // Ignore quote fetch error, fallback to returning current positions
  }

  const positions = paperEngine.getPositions();
  const trades = paperEngine.getTrades();
  const stats = paperEngine.getPortfolioStats();
  return NextResponse.json({ success: true, positions, trades, stats });
}

