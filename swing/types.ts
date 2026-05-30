// swing/types.ts

export type MarketClassification = 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strong Bearish';

export interface MarketEnvironment {
  niftyTrend: string;
  bankNiftyTrend: string;
  marketBreadth: {
    above20EmaPct: number;
    above50EmaPct: number;
    above200EmaPct: number;
  };
  classification: MarketClassification;
  reasoning: string;
}

export interface WeeklyBreakout {
  weeklyClose: number;
  weeklyHigh: number;
  prev8WeekHigh: number;
  weeklyVolume: number;
  avg20WeekVolume: number;
  closeNearHigh: boolean;
  noRejectionWick: boolean;
  score: number; // 1-10
}

export interface DailyTrend {
  ema20: number;
  ema50: number;
  ema200: number;
  ema20Above50: boolean;
  ema50Above200: boolean;
  closeAboveEmas: boolean;
  score: number; // 1-10
}

export interface RelativeStrength {
  perf5D: number;
  perf20D: number;
  perf60D: number;
  nifty5D: number;
  nifty20D: number;
  nifty60D: number;
  alpha5D: number;
  alpha20D: number;
  alpha60D: number;
  rank: 'Very Strong' | 'Strong' | 'Neutral' | 'Weak';
  score: number; // 1-10
}

export interface VolumeAnalysis {
  volumeRatio: number;
  rating: 'Reject' | 'Good' | 'Very Good' | 'Exceptional';
  description: string;
}

export type SetupType =
  | 'Setup A: Weekly Breakout'
  | 'Setup B: Breakout Retest'
  | 'Setup C: 20 EMA Pullback'
  | 'Setup D: Volatility Contraction Pattern (VCP)'
  | 'Setup E: Relative Strength Leader';

export interface AtrRiskManagement {
  atr: number;
  suggestedEntry: number;
  stopLoss: number;
  risk1R: number;
  target2R: number;
  target3R: number;
  riskPct: number;
  expectedRR: string;
}

export interface NextDayExecution {
  entryTrigger: number;
  entryZone: string;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  positionSizeFormula: string;
  specialNotes: string;
}

export interface ScoringModel {
  weeklyBreakout: number; // Max 25
  trendStrength: number;  // Max 20
  relativeStrength: number; // Max 20
  volumeExpansion: number; // Max 15
  riskReward: number;      // Max 10
  marketAlignment: number;  // Max 10
  total: number;           // Max 100
}

export interface PortfolioAllocation {
  positionSize: number;
  capitalAllocation: number;
  totalRisk: number;
  maxSectorRiskOk: boolean;
}

export interface PerformanceExpectation {
  expectedHoldingPeriod: string;
  probabilityRating: 'High' | 'Medium' | 'Low';
  riskRating: 'Low' | 'Medium' | 'High';
  confidenceRating: 'High' | 'Medium' | 'Low';
  catalyst: string;
}

export interface SwingTradeStock {
  symbol: string;
  name: string;
  sector: string;
  marketEnvironment: MarketEnvironment;
  weeklyBreakout: WeeklyBreakout;
  dailyTrend: DailyTrend;
  relativeStrength: RelativeStrength;
  volumeAnalysis: VolumeAnalysis;
  setup: SetupType;
  atrRisk: AtrRiskManagement;
  executionPlan: NextDayExecution;
  scoring: ScoringModel;
  portfolio: PortfolioAllocation;
  expectation: PerformanceExpectation;
}

export interface SwingScanReport {
  id?: string;
  timestamp: string;
  marketSummary: {
    status: MarketClassification;
    niftyStatus: string;
    bankNiftyStatus: string;
    breadthStatus: string;
    reasoning: string;
  };
  watchlist: SwingTradeStock[]; // Top 10 Ranked Stocks
  top3: SwingTradeStock[];     // Top 3 Detailed Analysis
  stocksToAvoid: { symbol: string; reason: string }[];
  bestTrade: SwingTradeStock | null;
}
