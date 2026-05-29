// app/api/paper/analytics/route.ts
import { NextResponse } from 'next/server';
import { readDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = readDb();
    const closedPositions = db.positions.filter(p => p.status === 'CLOSED');

    // 1. Equity Curve
    const equityCurve: { time: string; capital: number; pnl: number; strategy: string }[] = [];
    
    // Add initial state
    equityCurve.push({
      time: 'Start',
      capital: db.initialCapital,
      pnl: 0,
      strategy: 'Initial Capital'
    });

    let currentCapital = db.initialCapital;
    
    // Sort closed positions by close timestamp or entryDate
    const sortedClosed = [...closedPositions].sort((a, b) => {
      const aClose = db.trades.find(t => t.positionId === a.id && t.action === 'CLOSE');
      const bClose = db.trades.find(t => t.positionId === b.id && t.action === 'CLOSE');
      const aTime = aClose ? new Date(aClose.timestamp).getTime() : new Date(a.entryDate).getTime();
      const bTime = bClose ? new Date(bClose.timestamp).getTime() : new Date(b.entryDate).getTime();
      return aTime - bTime;
    });

    sortedClosed.forEach(pos => {
      currentCapital += pos.realizedPnl;
      const closeTrade = db.trades.find(t => t.positionId === pos.id && t.action === 'CLOSE');
      const timeStr = closeTrade 
        ? new Date(closeTrade.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
        : pos.entryDate;
      
      equityCurve.push({
        time: timeStr,
        capital: currentCapital,
        pnl: pos.realizedPnl,
        strategy: pos.strategy
      });
    });

    // 2. Strategy Breakdown
    const strategyStats: Record<string, { name: string; trades: number; wins: number; losses: number; pnl: number }> = {};
    closedPositions.forEach(pos => {
      const strat = pos.strategy || 'Unknown';
      if (!strategyStats[strat]) {
        strategyStats[strat] = { name: strat, trades: 0, wins: 0, losses: 0, pnl: 0 };
      }
      strategyStats[strat].trades++;
      strategyStats[strat].pnl += pos.realizedPnl;
      if (pos.realizedPnl > 0) {
        strategyStats[strat].wins++;
      } else {
        strategyStats[strat].losses++;
      }
    });
    const strategyData = Object.values(strategyStats);

    // 3. VIX Regime Success Rates
    const regimeStats: Record<string, { regime: string; trades: number; wins: number; pnl: number }> = {};
    closedPositions.forEach(pos => {
      const reg = pos.regime || 'NORMAL';
      if (!regimeStats[reg]) {
        regimeStats[reg] = { regime: reg, trades: 0, wins: 0, pnl: 0 };
      }
      regimeStats[reg].trades++;
      regimeStats[reg].pnl += pos.realizedPnl;
      if (pos.realizedPnl > 0) {
        regimeStats[reg].wins++;
      }
    });
    
    const regimeData = Object.values(regimeStats).map(r => ({
      ...r,
      winRate: r.trades > 0 ? Math.round((r.wins / r.trades) * 100) : 0
    }));

    return NextResponse.json({
      success: true,
      equityCurve,
      strategyData,
      regimeData
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
