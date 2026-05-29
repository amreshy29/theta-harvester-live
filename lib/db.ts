// lib/db.ts
import fs from 'fs';
import path from 'path';
import { PaperPosition, PaperTrade } from './paperEngine';

const DB_FILE = path.join(process.cwd(), 'db.json');

interface DbSchema {
  capital: number;
  initialCapital: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
  peakCapital: number;
  maxDrawdown: number;
}

const SAMPLE_POSITIONS: PaperPosition[] = [
  {
    id: "IC-NIFTY-1780004000000",
    strategy: "Iron Condor",
    symbol: "NIFTY",
    type: "IRON_CONDOR",
    legs: [
      { action: "SELL", optionType: "CE", strike: 24100, expiry: "2026-06-04", lotSize: 50, quantity: 1, entryPremium: 27.0, currentPremium: 22.0, legPnl: 250 },
      { action: "BUY", optionType: "CE", strike: 24200, expiry: "2026-06-04", lotSize: 50, quantity: 1, entryPremium: 8.0, currentPremium: 6.0, legPnl: -100 },
      { action: "SELL", optionType: "PE", strike: 23600, expiry: "2026-06-04", lotSize: 50, quantity: 1, entryPremium: 24.0, currentPremium: 18.0, legPnl: 300 },
      { action: "BUY", optionType: "PE", strike: 23500, expiry: "2026-06-04", lotSize: 50, quantity: 1, entryPremium: 7.0, currentPremium: 5.0, legPnl: -100 }
    ],
    entryDate: "2026-05-28",
    entryTime: "10:00:00",
    expiry: "2026-06-04",
    netCredit: 1800,
    maxRisk: 3200,
    maxProfit: 1800,
    probability: 68,
    status: "OPEN",
    currentValue: 1450,
    unrealizedPnl: 350,
    realizedPnl: 0,
    stopLossLevel: 3600,
    targetLevel: 1260,
    adjustmentCount: 0,
    notes: ["Entered at VIX regime: NORMAL. Net credit: ₹1800"],
    tags: ["IRON_CONDOR", "NORMAL"],
    regime: "NORMAL"
  },
  {
    id: "BCS-FINNIFTY-1780003000000",
    strategy: "Bear Call Spread",
    symbol: "FINNIFTY",
    type: "BEAR_CALL_SPREAD",
    legs: [
      { action: "SELL", optionType: "CE", strike: 25900, expiry: "2026-05-28", lotSize: 40, quantity: 1, entryPremium: 48.0, currentPremium: 5.0, legPnl: 1720 },
      { action: "BUY", optionType: "CE", strike: 26000, expiry: "2026-05-28", lotSize: 40, quantity: 1, entryPremium: 15.0, currentPremium: 1.0, legPnl: -560 }
    ],
    entryDate: "2026-05-27",
    entryTime: "13:30:00",
    expiry: "2026-05-28",
    netCredit: 1320,
    maxRisk: 2680,
    maxProfit: 1320,
    probability: 70,
    status: "CLOSED",
    currentValue: 160,
    unrealizedPnl: 0,
    realizedPnl: 1160,
    stopLossLevel: 1980,
    targetLevel: 924,
    adjustmentCount: 0,
    notes: ["Entered at VIX regime: ELEVATED. Net credit: ₹1320", "Closed: Profit booked at target"],
    tags: ["BEAR_CALL_SPREAD", "ELEVATED"],
    regime: "ELEVATED"
  },
  {
    id: "IC-NIFTY-1780002000000",
    strategy: "Iron Condor",
    symbol: "NIFTY",
    type: "IRON_CONDOR",
    legs: [
      { action: "SELL", optionType: "CE", strike: 24200, expiry: "2026-05-28", lotSize: 50, quantity: 1, entryPremium: 30.0, currentPremium: 82.0, legPnl: -2600 },
      { action: "BUY", optionType: "CE", strike: 24300, expiry: "2026-05-28", lotSize: 50, quantity: 1, entryPremium: 9.0, currentPremium: 42.0, legPnl: 1650 },
      { action: "SELL", optionType: "PE", strike: 23700, expiry: "2026-05-28", lotSize: 50, quantity: 1, entryPremium: 26.0, currentPremium: 0.05, legPnl: 1297.5 },
      { action: "BUY", optionType: "PE", strike: 23600, expiry: "2026-05-28", lotSize: 50, quantity: 1, entryPremium: 8.0, currentPremium: 0.05, legPnl: -397.5 }
    ],
    entryDate: "2026-05-26",
    entryTime: "10:15:00",
    expiry: "2026-05-28",
    netCredit: 1950,
    maxRisk: 3050,
    maxProfit: 1950,
    probability: 64,
    status: "CLOSED",
    currentValue: 2000,
    unrealizedPnl: 0,
    realizedPnl: -50,
    stopLossLevel: 3900,
    targetLevel: 1365,
    adjustmentCount: 0,
    notes: ["Entered at VIX regime: ELEVATED. Net credit: ₹1950", "Closed: Exit due to range breach near 24220"],
    tags: ["IRON_CONDOR", "ELEVATED"],
    regime: "ELEVATED"
  },
  {
    id: "IC-FINNIFTY-1780000210000",
    strategy: "Iron Condor",
    symbol: "FINNIFTY",
    type: "IRON_CONDOR",
    legs: [
      { action: "SELL", optionType: "CE", strike: 25800, expiry: "2026-05-26", lotSize: 40, quantity: 1, entryPremium: 24.0, currentPremium: 0.05, legPnl: 958 },
      { action: "BUY", optionType: "CE", strike: 25900, expiry: "2026-05-26", lotSize: 40, quantity: 1, entryPremium: 7.0, currentPremium: 0.05, legPnl: -278 },
      { action: "SELL", optionType: "PE", strike: 25200, expiry: "2026-05-26", lotSize: 40, quantity: 1, entryPremium: 25.0, currentPremium: 0.05, legPnl: 998 },
      { action: "BUY", optionType: "PE", strike: 25100, expiry: "2026-05-26", lotSize: 40, quantity: 1, entryPremium: 6.0, currentPremium: 0.05, legPnl: -238 }
    ],
    entryDate: "2026-05-22",
    entryTime: "09:30:00",
    expiry: "2026-05-26",
    netCredit: 1440,
    maxRisk: 2560,
    maxProfit: 1440,
    probability: 70,
    status: "CLOSED",
    currentValue: 8,
    unrealizedPnl: 0,
    realizedPnl: 1440,
    stopLossLevel: 2880,
    targetLevel: 1008,
    adjustmentCount: 0,
    notes: ["Entered at VIX regime: NORMAL. Net credit: ₹1440", "Closed: Expiry settlement at max profit"],
    tags: ["IRON_CONDOR", "NORMAL"],
    regime: "NORMAL"
  },
  {
    id: "BPS-BANKNIFTY-1780001000000",
    strategy: "Bull Put Spread",
    symbol: "BANKNIFTY",
    type: "BULL_PUT_SPREAD",
    legs: [
      { action: "SELL", optionType: "PE", strike: 54400, expiry: "2026-05-28", lotSize: 15, quantity: 1, entryPremium: 62.0, currentPremium: 0.05, legPnl: 929.25 },
      { action: "BUY", optionType: "PE", strike: 54200, expiry: "2026-05-28", lotSize: 15, quantity: 1, entryPremium: 21.0, currentPremium: 0.05, legPnl: -314.25 }
    ],
    entryDate: "2026-05-25",
    entryTime: "11:45:00",
    expiry: "2026-05-28",
    netCredit: 615,
    maxRisk: 2385,
    maxProfit: 615,
    probability: 72,
    status: "CLOSED",
    currentValue: 1.5,
    unrealizedPnl: 0,
    realizedPnl: 615,
    stopLossLevel: 922,
    targetLevel: 430,
    adjustmentCount: 0,
    notes: ["Entered at VIX regime: NORMAL. Net credit: ₹615", "Closed: Expiry settlement at max profit"],
    tags: ["BULL_PUT_SPREAD", "NORMAL"],
    regime: "NORMAL"
  },
  {
    id: "IC-NIFTY-1780000000000",
    strategy: "Iron Condor",
    symbol: "NIFTY",
    type: "IRON_CONDOR",
    legs: [
      { action: "SELL", optionType: "CE", strike: 24150, expiry: "2026-05-28", lotSize: 50, quantity: 1, entryPremium: 28.5, currentPremium: 0.05, legPnl: 1422.5 },
      { action: "BUY", optionType: "CE", strike: 24250, expiry: "2026-05-28", lotSize: 50, quantity: 1, entryPremium: 8.5, currentPremium: 0.05, legPnl: -422.5 },
      { action: "SELL", optionType: "PE", strike: 23650, expiry: "2026-05-28", lotSize: 50, quantity: 1, entryPremium: 25.0, currentPremium: 0.05, legPnl: 1247.5 },
      { action: "BUY", optionType: "PE", strike: 23550, expiry: "2026-05-28", lotSize: 50, quantity: 1, entryPremium: 7.0, currentPremium: 0.05, legPnl: -347.5 }
    ],
    entryDate: "2026-05-25",
    entryTime: "09:20:00",
    expiry: "2026-05-28",
    netCredit: 1900,
    maxRisk: 3100,
    maxProfit: 1900,
    probability: 68,
    status: "CLOSED",
    currentValue: 10,
    unrealizedPnl: 0,
    realizedPnl: 1900,
    stopLossLevel: 3800,
    targetLevel: 1330,
    adjustmentCount: 0,
    notes: ["Entered at VIX regime: NORMAL. Net credit: ₹1900", "Closed: Expiry settlement at max profit"],
    tags: ["IRON_CONDOR", "NORMAL"],
    regime: "NORMAL"
  },
  {
    id: "IC-NIFTY-1780000180000",
    strategy: "Iron Condor",
    symbol: "NIFTY",
    type: "IRON_CONDOR",
    legs: [
      { action: "SELL", optionType: "CE", strike: 24000, expiry: "2026-05-21", lotSize: 50, quantity: 1, entryPremium: 25.0, currentPremium: 0.05, legPnl: 1247.5 },
      { action: "BUY", optionType: "CE", strike: 24100, expiry: "2026-05-21", lotSize: 50, quantity: 1, entryPremium: 7.5, currentPremium: 0.05, legPnl: -372.5 },
      { action: "SELL", optionType: "PE", strike: 23500, expiry: "2026-05-21", lotSize: 50, quantity: 1, entryPremium: 24.0, currentPremium: 0.05, legPnl: 1197.5 },
      { action: "BUY", optionType: "PE", strike: 23400, expiry: "2026-05-21", lotSize: 50, quantity: 1, entryPremium: 6.5, currentPremium: 0.05, legPnl: -322.5 }
    ],
    entryDate: "2026-05-18",
    entryTime: "09:20:00",
    expiry: "2026-05-21",
    netCredit: 1750,
    maxRisk: 3250,
    maxProfit: 1750,
    probability: 68,
    status: "CLOSED",
    currentValue: 10,
    unrealizedPnl: 0,
    realizedPnl: 1750,
    stopLossLevel: 3500,
    targetLevel: 1225,
    adjustmentCount: 0,
    notes: ["Entered at VIX regime: CRUSHED. Net credit: ₹1750", "Closed: Expiry settlement at max profit"],
    tags: ["IRON_CONDOR", "CRUSHED"],
    regime: "CRUSHED"
  },
  {
    id: "BPS-BANKNIFTY-1780000190000",
    strategy: "Bull Put Spread",
    symbol: "BANKNIFTY",
    type: "BULL_PUT_SPREAD",
    legs: [
      { action: "SELL", optionType: "PE", strike: 54200, expiry: "2026-05-21", lotSize: 15, quantity: 1, entryPremium: 55.0, currentPremium: 0.05, legPnl: 824.25 },
      { action: "BUY", optionType: "PE", strike: 54000, expiry: "2026-05-21", lotSize: 15, quantity: 1, entryPremium: 20.0, currentPremium: 0.05, legPnl: -299.25 }
    ],
    entryDate: "2026-05-19",
    entryTime: "10:30:00",
    expiry: "2026-05-21",
    netCredit: 525,
    maxRisk: 2475,
    maxProfit: 525,
    probability: 72,
    status: "CLOSED",
    currentValue: 1.5,
    unrealizedPnl: 0,
    realizedPnl: 525,
    stopLossLevel: 787,
    targetLevel: 367,
    adjustmentCount: 0,
    notes: ["Entered at VIX regime: NORMAL. Net credit: ₹525", "Closed: Expiry settlement at max profit"],
    tags: ["BULL_PUT_SPREAD", "NORMAL"],
    regime: "NORMAL"
  },
  {
    id: "BCS-NIFTY-1780000200000",
    strategy: "Bear Call Spread",
    symbol: "NIFTY",
    type: "BEAR_CALL_SPREAD",
    legs: [
      { action: "SELL", optionType: "CE", strike: 24050, expiry: "2026-05-21", lotSize: 50, quantity: 1, entryPremium: 45.0, currentPremium: 90.0, legPnl: -2250 },
      { action: "BUY", optionType: "CE", strike: 24150, expiry: "2026-05-21", lotSize: 50, quantity: 1, entryPremium: 21.0, currentPremium: 30.0, legPnl: 450 }
    ],
    entryDate: "2026-05-20",
    entryTime: "11:00:00",
    expiry: "2026-05-21",
    netCredit: 1200,
    maxRisk: 3800,
    maxProfit: 1200,
    probability: 60,
    status: "CLOSED",
    currentValue: 3000,
    unrealizedPnl: 0,
    realizedPnl: -1800,
    stopLossLevel: 1800,
    targetLevel: 840,
    adjustmentCount: 0,
    notes: ["Entered at VIX regime: EXTREME. Net credit: ₹1200", "Closed: Exit due to stop loss breach near strike 24080"],
    tags: ["BEAR_CALL_SPREAD", "EXTREME"],
    regime: "EXTREME"
  }
];

const SAMPLE_TRADES: PaperTrade[] = [
  {
    id: "T-1780001000001",
    positionId: "BPS-BANKNIFTY-1780001000000",
    action: "CLOSE",
    strategy: "Bull Put Spread",
    symbol: "BANKNIFTY",
    netCredit: 615,
    pnl: 615,
    timestamp: "2026-05-28T15:30:00.000Z",
    reason: "Closed: Expiry settlement at max profit",
    regime: "NORMAL"
  },
  {
    id: "T-1780000000001",
    positionId: "IC-NIFTY-1780000000000",
    action: "CLOSE",
    strategy: "Iron Condor",
    symbol: "NIFTY",
    netCredit: 1900,
    pnl: 1900,
    timestamp: "2026-05-28T15:30:00.000Z",
    reason: "Closed: Expiry settlement at max profit",
    regime: "NORMAL"
  },
  {
    id: "T-1780003000001",
    positionId: "BCS-FINNIFTY-1780003000000",
    action: "CLOSE",
    strategy: "Bear Call Spread",
    symbol: "FINNIFTY",
    netCredit: 1320,
    pnl: 1160,
    timestamp: "2026-05-28T15:15:00.000Z",
    reason: "Closed: Profit booked at target",
    regime: "ELEVATED"
  },
  {
    id: "T-1780004000000",
    positionId: "IC-NIFTY-1780004000000",
    action: "OPEN",
    strategy: "Iron Condor",
    symbol: "NIFTY",
    netCredit: 1800,
    pnl: 0,
    timestamp: "2026-05-28T10:00:00.000Z",
    reason: "Paper trade opened: Iron Condor on NIFTY",
    regime: "NORMAL"
  },
  {
    id: "T-1780003000000",
    positionId: "BCS-FINNIFTY-1780003000000",
    action: "OPEN",
    strategy: "Bear Call Spread",
    symbol: "FINNIFTY",
    netCredit: 1320,
    pnl: 0,
    timestamp: "2026-05-27T13:30:00.000Z",
    reason: "Paper trade opened: Bear Call Spread on FINNIFTY",
    regime: "ELEVATED"
  },
  {
    id: "T-1780002000001",
    positionId: "IC-NIFTY-1780002000000",
    action: "CLOSE",
    strategy: "Iron Condor",
    symbol: "NIFTY",
    netCredit: 1950,
    pnl: -50,
    timestamp: "2026-05-27T11:00:00.000Z",
    reason: "Closed: Exit due to range breach near 24220",
    regime: "ELEVATED"
  },
  {
    id: "T-1780002000000",
    positionId: "IC-NIFTY-1780002000000",
    action: "OPEN",
    strategy: "Iron Condor",
    symbol: "NIFTY",
    netCredit: 1950,
    pnl: 0,
    timestamp: "2026-05-26T10:15:00.000Z",
    reason: "Paper trade opened: Iron Condor on NIFTY",
    regime: "ELEVATED"
  },
  {
    id: "T-1780000210001",
    positionId: "IC-FINNIFTY-1780000210000",
    action: "CLOSE",
    strategy: "Iron Condor",
    symbol: "FINNIFTY",
    netCredit: 1440,
    pnl: 1440,
    timestamp: "2026-05-26T15:30:00.000Z",
    reason: "Closed: Expiry settlement at max profit",
    regime: "NORMAL"
  },
  {
    id: "T-1780001000000",
    positionId: "BPS-BANKNIFTY-1780001000000",
    action: "OPEN",
    strategy: "Bull Put Spread",
    symbol: "BANKNIFTY",
    netCredit: 615,
    pnl: 0,
    timestamp: "2026-05-25T11:45:00.000Z",
    reason: "Paper trade opened: Bull Put Spread on BANKNIFTY",
    regime: "NORMAL"
  },
  {
    id: "T-1780000000000",
    positionId: "IC-NIFTY-1780000000000",
    action: "OPEN",
    strategy: "Iron Condor",
    symbol: "NIFTY",
    netCredit: 1900,
    pnl: 0,
    timestamp: "2026-05-25T09:20:00.000Z",
    reason: "Paper trade opened: Iron Condor on NIFTY",
    regime: "NORMAL"
  },
  {
    id: "T-1780000210000",
    positionId: "IC-FINNIFTY-1780000210000",
    action: "OPEN",
    strategy: "Iron Condor",
    symbol: "FINNIFTY",
    netCredit: 1440,
    pnl: 0,
    timestamp: "2026-05-22T09:30:00.000Z",
    reason: "Paper trade opened: Iron Condor on FINNIFTY",
    regime: "NORMAL"
  },
  {
    id: "T-1780000180001",
    positionId: "IC-NIFTY-1780000180000",
    action: "CLOSE",
    strategy: "Iron Condor",
    symbol: "NIFTY",
    netCredit: 1750,
    pnl: 1750,
    timestamp: "2026-05-21T15:30:00.000Z",
    reason: "Closed: Expiry settlement at max profit",
    regime: "CRUSHED"
  },
  {
    id: "T-1780000190001",
    positionId: "BPS-BANKNIFTY-1780000190000",
    action: "CLOSE",
    strategy: "Bull Put Spread",
    symbol: "BANKNIFTY",
    netCredit: 525,
    pnl: 525,
    timestamp: "2026-05-21T15:30:00.000Z",
    reason: "Closed: Expiry settlement at max profit",
    regime: "NORMAL"
  },
  {
    id: "T-1780000200001",
    positionId: "BCS-NIFTY-1780000200000",
    action: "CLOSE",
    strategy: "Bear Call Spread",
    symbol: "NIFTY",
    netCredit: 1200,
    pnl: -1800,
    timestamp: "2026-05-20T14:30:00.000Z",
    reason: "Closed: Exit due to stop loss breach near strike 24080",
    regime: "EXTREME"
  },
  {
    id: "T-1780000200000",
    positionId: "BCS-NIFTY-1780000200000",
    action: "OPEN",
    strategy: "Bear Call Spread",
    symbol: "NIFTY",
    netCredit: 1200,
    pnl: 0,
    timestamp: "2026-05-20T11:00:00.000Z",
    reason: "Paper trade opened: Bear Call Spread on NIFTY",
    regime: "EXTREME"
  },
  {
    id: "T-1780000190000",
    positionId: "BPS-BANKNIFTY-1780000190000",
    action: "OPEN",
    strategy: "Bull Put Spread",
    symbol: "BANKNIFTY",
    netCredit: 525,
    pnl: 0,
    timestamp: "2026-05-19T10:30:00.000Z",
    reason: "Paper trade opened: Bull Put Spread on BANKNIFTY",
    regime: "NORMAL"
  },
  {
    id: "T-1780000180000",
    positionId: "IC-NIFTY-1780000180000",
    action: "OPEN",
    strategy: "Iron Condor",
    symbol: "NIFTY",
    netCredit: 1750,
    pnl: 0,
    timestamp: "2026-05-18T09:20:00.000Z",
    reason: "Paper trade opened: Iron Condor on NIFTY",
    regime: "CRUSHED"
  }
];

const DEFAULT_DB: DbSchema = {
  capital: 505540, // ₹5,00,000 + realized PnL of settled trades (-1800 + 525 + 1750 + 1440 - 50 + 1160 + 1900 + 615)
  initialCapital: 500000,
  positions: SAMPLE_POSITIONS,
  trades: SAMPLE_TRADES,
  peakCapital: 505540,
  maxDrawdown: 0.36 // Drawdown of ₹1800 on ₹500,000 capital (0.36%)
};

export function readDb(): DbSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      return DEFAULT_DB;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(data) as DbSchema;
    
    // Auto-upgrade empty databases to include sample data on first start
    if (parsed.positions.length === 0 && parsed.trades.length === 0 && parsed.capital === 500000) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      return DEFAULT_DB;
    }
    
    return parsed;
  } catch (err) {
    console.error('[DB] Error reading database, returning default:', err);
    return DEFAULT_DB;
  }
}

export function writeDb(db: DbSchema): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Error writing database:', err);
  }
}
