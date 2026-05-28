// lib/paperEngine.ts
// In-memory paper trading engine with full P&L tracking

export interface PaperPosition {
  id: string;
  strategy: string;
  symbol: string;
  type: string;
  legs: PaperLeg[];
  entryDate: string;
  entryTime: string;
  expiry: string;
  netCredit: number;       // Total credit received (positive = credit)
  maxRisk: number;
  maxProfit: number;
  probability: number;
  status: 'OPEN' | 'CLOSED' | 'EXPIRED' | 'STOPPED';
  currentValue: number;    // Current cost to close
  unrealizedPnl: number;
  realizedPnl: number;
  stopLossLevel: number;   // Exit at 2× premium for IC, 1.5× for spreads
  targetLevel: number;     // Book profit at 70% of max profit
  adjustmentCount: number;
  notes: string[];
  tags: string[];
  regime: string;
}

export interface PaperLeg {
  action: 'BUY' | 'SELL';
  optionType: 'CE' | 'PE';
  strike: number;
  expiry: string;
  lotSize: number;
  quantity: number;
  entryPremium: number;
  currentPremium: number;
  legPnl: number;
}

export interface PaperTrade {
  id: string;
  positionId: string;
  action: 'OPEN' | 'CLOSE' | 'ADJUST';
  strategy: string;
  symbol: string;
  netCredit: number;
  pnl: number;
  timestamp: string;
  reason: string;
  regime: string;
}

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
  portfolioHeat: number;  // % of capital at risk
}

// Singleton in-memory store (persists within serverless warm instances)
// For production: replace with Redis/DB
class PaperTradingEngine {
  private positions: Map<string, PaperPosition> = new Map();
  private trades: PaperTrade[] = [];
  private capital = 500000; // ₹5 lakhs
  private initialCapital = 500000;
  private dailyPnl = 0;
  private peakCapital = 500000;
  private maxDrawdown = 0;

  getPortfolioStats(): PortfolioStats {
    const openPositions = Array.from(this.positions.values()).filter(p => p.status === 'OPEN');
    const closedPositions = Array.from(this.positions.values()).filter(p => p.status === 'CLOSED');

    const unrealizedPnl = openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const realizedPnl = closedPositions.reduce((sum, p) => sum + p.realizedPnl, 0);
    const deployed = openPositions.reduce((sum, p) => sum + p.maxRisk, 0);
    const cash = this.capital - deployed;

    const wins = closedPositions.filter(p => p.realizedPnl > 0);
    const losses = closedPositions.filter(p => p.realizedPnl <= 0);
    const winRate = closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + p.realizedPnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, p) => s + p.realizedPnl, 0) / losses.length) : 0;
    const expectancy = winRate / 100 * avgWin - (1 - winRate / 100) * avgLoss;

    const dailyTheta = openPositions.reduce((sum, p) => {
      const daysToExpiry = Math.max(1, Math.ceil((new Date(p.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      return sum + p.netCredit / daysToExpiry * 0.3;
    }, 0);

    const currentCapital = this.capital + unrealizedPnl + realizedPnl;
    if (currentCapital > this.peakCapital) this.peakCapital = currentCapital;
    const drawdown = ((this.peakCapital - currentCapital) / this.peakCapital) * 100;
    this.maxDrawdown = Math.max(this.maxDrawdown, drawdown);

    const monthlyReturn = ((currentCapital - this.initialCapital) / this.initialCapital) * 100;
    const portfolioHeat = (deployed / this.capital) * 100;

    // Simplified Sharpe (using expectancy as proxy)
    const sharpeEstimate = avgLoss > 0 ? expectancy / avgLoss : 0;

    return {
      capital: this.capital,
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
      maxDrawdown: this.maxDrawdown,
      dailyTheta,
      monthlyReturn,
      sharpeEstimate,
      portfolioHeat,
    };
  }

  openPosition(signal: {
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
  }): PaperPosition {
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

    this.positions.set(position.id, position);
    this.trades.push({
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

  updatePositionPrices(positionId: string, priceMultiplier: number): PaperPosition | null {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'OPEN') return null;

    // Simulate theta decay + price movement
    const timeDecay = 0.995; // ~0.5% daily decay on option premiums
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

    // Check stop loss
    if (Math.abs(position.unrealizedPnl) >= position.stopLossLevel) {
      position.notes.push(`⚠ Stop loss triggered at ₹${position.unrealizedPnl.toFixed(0)} P&L`);
    }

    // Check target
    if (position.unrealizedPnl >= position.targetLevel) {
      position.notes.push(`✅ Target (70% max profit) achieved: ₹${position.unrealizedPnl.toFixed(0)}`);
    }

    this.positions.set(positionId, position);
    return position;
  }

  closePosition(positionId: string, reason: string): PaperPosition | null {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'OPEN') return null;

    position.status = 'CLOSED';
    position.realizedPnl = position.unrealizedPnl;
    position.unrealizedPnl = 0;
    position.notes.push(`Closed: ${reason}`);

    this.trades.push({
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

    this.positions.set(positionId, position);
    return position;
  }

  tickAllPositions(niftyChangePct: number): void {
    const multiplier = Math.abs(niftyChangePct) * 10;
    Array.from(this.positions.values())
      .filter(p => p.status === 'OPEN')
      .forEach(p => this.updatePositionPrices(p.id, multiplier));
  }

  getPositions(): PaperPosition[] {
    return Array.from(this.positions.values()).sort((a, b) =>
      new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
    );
  }

  getTrades(): PaperTrade[] {
    return [...this.trades].reverse().slice(0, 50);
  }

  reset(): void {
    this.positions.clear();
    this.trades = [];
    this.capital = 500000;
    this.initialCapital = 500000;
    this.dailyPnl = 0;
    this.peakCapital = 500000;
    this.maxDrawdown = 0;
  }
}

// Global singleton
export const paperEngine = new PaperTradingEngine();
