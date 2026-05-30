// lib/paperEngine.ts
// Asynchronous paper trading engine interfacing with dual-mode DAL (Supabase / db.json)

import {
  getPortfolioState,
  savePortfolioState,
  getPositions as dbGetPositions,
  addPosition as dbAddPosition,
  updatePosition as dbUpdatePosition,
  addTrade as dbAddTrade,
  getTrades as dbGetTrades,
  resetDatabase as dbResetDatabase,
  PaperPosition,
  PaperLeg,
  PaperTrade
} from './db';

export interface PortfolioStats {
  capital: number;
  deployed: number;
  cash: number;
  totalPnl: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openPositions: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  maxDrawdown: number;
  dailyTheta: number;
  monthlyReturn: number;
  sharpeEstimate: number;
  portfolioHeat: number;
}

class PaperTradingEngine {
  async getPortfolioStats(demo: boolean): Promise<PortfolioStats> {
    const state = await getPortfolioState(demo);
    const positions = await dbGetPositions(demo);

    const openPositions = positions.filter(p => p.status === 'OPEN');
    // Closed positions are those whose statuses represent realized trades
    const closedPositions = positions.filter(p => p.status !== 'OPEN' && p.status !== 'CANCELLED');

    const unrealizedPnl = openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const realizedPnl = closedPositions.reduce((sum, p) => sum + p.realizedPnl, 0);
    const deployed = openPositions.reduce((sum, p) => sum + p.maxRisk, 0);
    const cash = state.capital - deployed;

    const wins = closedPositions.filter(p => p.realizedPnl > 0);
    const losses = closedPositions.filter(p => p.realizedPnl <= 0);
    const winRate = closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + p.realizedPnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, p) => s + p.realizedPnl, 0) / losses.length) : 0;
    const expectancy = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;

    const dailyTheta = openPositions.reduce((sum, p) => {
      const daysToExpiry = Math.max(1, Math.ceil((new Date(p.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      return sum + (p.netCredit / daysToExpiry) * 0.3;
    }, 0);

    const currentCapital = state.capital + unrealizedPnl + realizedPnl;
    let peakCapital = state.peakCapital;
    if (currentCapital > peakCapital) {
      peakCapital = currentCapital;
    }
    const drawdown = ((peakCapital - currentCapital) / peakCapital) * 100;
    const maxDrawdown = Math.max(state.maxDrawdown, drawdown);

    // Persist peak capital and max drawdown updates
    await savePortfolioState(demo, {
      capital: state.capital,
      initialCapital: state.initialCapital,
      peakCapital,
      maxDrawdown,
    });

    const monthlyReturn = ((currentCapital - state.initialCapital) / state.initialCapital) * 100;
    const portfolioHeat = (deployed / state.capital) * 100;
    const sharpeEstimate = avgLoss > 0 ? expectancy / avgLoss : 0;

    return {
      capital: state.capital,
      deployed,
      cash,
      totalPnl: unrealizedPnl + realizedPnl,
      unrealizedPnl,
      realizedPnl,
      openPositions: openPositions.length,
      winCount: wins.length,
      lossCount: losses.length,
      winRate,
      avgWin,
      avgLoss,
      expectancy,
      maxDrawdown,
      dailyTheta,
      monthlyReturn,
      sharpeEstimate,
      portfolioHeat,
    };
  }

  async openPosition(demo: boolean, signal: {
    id: string;
    strategy: string;
    symbol: string;
    type: string;
    legs: { action: string; optionType: string; strike: number; expiry: string; lotSize: number; quantity: number; premium: number }[];
    netCredit: number;
    maxRisk: number;
    maxProfit: number;
    probability: number;
    regime: string;
  }): Promise<PaperPosition> {
    const now = new Date();
    const position: PaperPosition = {
      id: signal.id,
      strategy: signal.strategy,
      symbol: signal.symbol,
      type: signal.type,
      legs: signal.legs.map(leg => ({
        action: leg.action as 'BUY' | 'SELL',
        optionType: leg.optionType as 'CE' | 'PE',
        strike: leg.strike,
        expiry: leg.expiry,
        lotSize: leg.lotSize,
        quantity: leg.quantity,
        entryPremium: leg.premium,
        currentPremium: leg.premium,
        legPnl: 0,
      })),
      entryDate: now.toISOString().split('T')[0],
      entryTime: now.toTimeString().split(' ')[0],
      expiry: signal.legs[0]?.expiry || '',
      netCredit: signal.netCredit,
      maxRisk: signal.maxRisk,
      maxProfit: signal.maxProfit,
      probability: signal.probability,
      status: 'OPEN',
      currentValue: signal.netCredit,
      unrealizedPnl: 0,
      realizedPnl: 0,
      stopLossLevel: signal.type === 'IRON_CONDOR' ? signal.netCredit * 2 : signal.netCredit * 1.5,
      targetLevel: signal.maxProfit * 0.7,
      adjustmentCount: 0,
      notes: [`Entered at VIX regime: ${signal.regime}. Net credit: ₹${signal.netCredit.toFixed(0)}`],
      tags: [signal.type, signal.regime],
      regime: signal.regime,
    };

    await dbAddPosition(demo, position);
    await dbAddTrade(demo, {
      id: `T-${Date.now()}`,
      positionId: position.id,
      action: 'OPEN',
      strategy: position.strategy,
      symbol: position.symbol,
      netCredit: position.netCredit,
      pnl: 0,
      timestamp: now.toISOString(),
      reason: `Paper trade opened: ${position.strategy} on ${position.symbol}`,
      regime: signal.regime,
    });

    return position;
  }

  async updatePositionPrices(demo: boolean, positionId: string, priceMultiplier: number): Promise<PaperPosition | null> {
    const positions = await dbGetPositions(demo);
    const position = positions.find(p => p.id === positionId);
    if (!position || position.status !== 'OPEN') return null;

    const timeDecay = 0.995; // ~0.5% daily decay
    let currentValue = 0;

    position.legs.forEach(leg => {
      const priceChange = (Math.random() - 0.5) * 0.1 * priceMultiplier;
      leg.currentPremium = Math.max(0.05, leg.currentPremium * (timeDecay + priceChange));
      const signedPnl = leg.action === 'SELL'
        ? (leg.entryPremium - leg.currentPremium) * leg.lotSize * leg.quantity
        : (leg.currentPremium - leg.entryPremium) * leg.lotSize * leg.quantity;
      leg.legPnl = signedPnl;
      currentValue += leg.action === 'SELL' ? leg.currentPremium : -leg.currentPremium;
    });

    position.currentValue = currentValue * (position.legs[0]?.lotSize || 50);
    position.unrealizedPnl = position.legs.reduce((sum, l) => sum + l.legPnl, 0);

    // Automatically trigger Stop Loss limit exit
    if (Math.abs(position.unrealizedPnl) >= position.stopLossLevel) {
      position.status = 'STOP_LOSS_HIT';
      position.realizedPnl = position.unrealizedPnl;
      position.unrealizedPnl = 0;
      position.notes.push(`⚠ Stop loss triggered at ₹${position.realizedPnl.toFixed(0)} P&L`);

      await dbUpdatePosition(demo, position);
      await dbAddTrade(demo, {
        id: `T-${Date.now()}`,
        positionId: position.id,
        action: 'CLOSE',
        strategy: position.strategy,
        symbol: position.symbol,
        netCredit: position.netCredit,
        pnl: position.realizedPnl,
        timestamp: new Date().toISOString(),
        reason: `Stop loss triggered automatically at stop limit level`,
        regime: position.regime,
      });
    }
    // Automatically trigger Target reached exit
    else if (position.unrealizedPnl >= position.targetLevel) {
      position.status = 'TARGET_HIT';
      position.realizedPnl = position.unrealizedPnl;
      position.unrealizedPnl = 0;
      position.notes.push(`✅ Target achieved: ₹${position.realizedPnl.toFixed(0)}`);

      await dbUpdatePosition(demo, position);
      await dbAddTrade(demo, {
        id: `T-${Date.now()}`,
        positionId: position.id,
        action: 'CLOSE',
        strategy: position.strategy,
        symbol: position.symbol,
        netCredit: position.netCredit,
        pnl: position.realizedPnl,
        timestamp: new Date().toISOString(),
        reason: `Target hit automatically at 70% of max profit`,
        regime: position.regime,
      });
    } else {
      await dbUpdatePosition(demo, position);
    }

    return position;
  }

  async closePosition(demo: boolean, positionId: string, reason: string): Promise<PaperPosition | null> {
    const positions = await dbGetPositions(demo);
    const position = positions.find(p => p.id === positionId);
    if (!position || position.status !== 'OPEN') return null;

    position.status = 'CLOSED';
    position.realizedPnl = position.unrealizedPnl;
    position.unrealizedPnl = 0;
    position.notes.push(`Closed: ${reason}`);

    await dbUpdatePosition(demo, position);
    await dbAddTrade(demo, {
      id: `T-${Date.now()}`,
      positionId,
      action: 'CLOSE',
      strategy: position.strategy,
      symbol: position.symbol,
      netCredit: position.netCredit,
      pnl: position.realizedPnl,
      timestamp: new Date().toISOString(),
      reason,
      regime: position.regime,
    });

    return position;
  }

  async cancelPosition(demo: boolean, positionId: string, reason: string): Promise<PaperPosition | null> {
    const positions = await dbGetPositions(demo);
    const position = positions.find(p => p.id === positionId);
    if (!position || position.status !== 'OPEN') return null;

    position.status = 'CANCELLED';
    position.realizedPnl = 0;
    position.unrealizedPnl = 0;
    position.notes.push(`Cancelled: ${reason}`);

    await dbUpdatePosition(demo, position);
    await dbAddTrade(demo, {
      id: `T-${Date.now()}`,
      positionId,
      action: 'CLOSE', // Log close trade record for journal tracking
      strategy: position.strategy,
      symbol: position.symbol,
      netCredit: position.netCredit,
      pnl: 0,
      timestamp: new Date().toISOString(),
      reason: `Cancelled: ${reason}`,
      regime: position.regime,
    });

    return position;
  }

  async tickAllPositions(demo: boolean, niftyChangePct: number): Promise<void> {
    const positions = await dbGetPositions(demo);
    const multiplier = Math.abs(niftyChangePct) * 10;
    const timeDecay = 0.995;

    for (const position of positions) {
      if (position.status !== 'OPEN') continue;
      let currentValue = 0;

      position.legs.forEach(leg => {
        const priceChange = (Math.random() - 0.5) * 0.1 * multiplier;
        leg.currentPremium = Math.max(0.05, leg.currentPremium * (timeDecay + priceChange));
        const signedPnl = leg.action === 'SELL'
          ? (leg.entryPremium - leg.currentPremium) * leg.lotSize * leg.quantity
          : (leg.currentPremium - leg.entryPremium) * leg.lotSize * leg.quantity;
        leg.legPnl = signedPnl;
        currentValue += leg.action === 'SELL' ? leg.currentPremium : -leg.currentPremium;
      });

      position.currentValue = currentValue * (position.legs[0]?.lotSize || 50);
      position.unrealizedPnl = position.legs.reduce((sum, l) => sum + l.legPnl, 0);

      // Check Target achieved automatically during ticks
      if (position.unrealizedPnl >= position.targetLevel) {
        position.status = 'TARGET_HIT';
        position.realizedPnl = position.unrealizedPnl;
        position.unrealizedPnl = 0;
        position.notes.push(`✅ Target achieved: ₹${position.realizedPnl.toFixed(0)}`);

        await dbUpdatePosition(demo, position);
        await dbAddTrade(demo, {
          id: `T-${Date.now()}`,
          positionId: position.id,
          action: 'CLOSE',
          strategy: position.strategy,
          symbol: position.symbol,
          netCredit: position.netCredit,
          pnl: position.realizedPnl,
          timestamp: new Date().toISOString(),
          reason: `Target hit automatically at 70% of max profit`,
          regime: position.regime,
        });
      }
      // Check Stop Loss limit triggered during ticks
      else if (Math.abs(position.unrealizedPnl) >= position.stopLossLevel) {
        position.status = 'STOP_LOSS_HIT';
        position.realizedPnl = position.unrealizedPnl;
        position.unrealizedPnl = 0;
        position.notes.push(`⚠ Stop loss triggered at ₹${position.realizedPnl.toFixed(0)} P&L`);

        await dbUpdatePosition(demo, position);
        await dbAddTrade(demo, {
          id: `T-${Date.now()}`,
          positionId: position.id,
          action: 'CLOSE',
          strategy: position.strategy,
          symbol: position.symbol,
          netCredit: position.netCredit,
          pnl: position.realizedPnl,
          timestamp: new Date().toISOString(),
          reason: `Stop loss triggered automatically at stop limit level`,
          regime: position.regime,
        });
      } else {
        await dbUpdatePosition(demo, position);
      }
    }
  }

  async getPositions(demo: boolean): Promise<PaperPosition[]> {
    const pos = await dbGetPositions(demo);
    return pos.sort((a, b) =>
      new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
    );
  }

  async getTrades(demo: boolean): Promise<PaperTrade[]> {
    const trades = await dbGetTrades(demo);
    return trades.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ).slice(0, 50);
  }

  async reset(demo: boolean): Promise<void> {
    await dbResetDatabase(demo);
  }
}

// Global singleton
export const paperEngine = new PaperTradingEngine();
export type { PaperPosition, PaperLeg, PaperTrade };
