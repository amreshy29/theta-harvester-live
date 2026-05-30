// lib/db.ts
import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';

const DB_FILE = path.join(process.cwd(), 'db.json');

export interface PaperPosition {
  id: string;
  strategy: string;
  symbol: string;
  type: string;
  legs: PaperLeg[];
  entryDate: string;
  entryTime: string;
  expiry: string;
  netCredit: number;
  maxRisk: number;
  maxProfit: number;
  probability: number;
  status: 'OPEN' | 'TARGET_HIT' | 'STOP_LOSS_HIT' | 'CLOSED' | 'CANCELLED';
  currentValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  stopLossLevel: number;
  targetLevel: number;
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

export interface DbSchema {
  capital: number;
  initialCapital: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
  peakCapital: number;
  maxDrawdown: number;
}

// Helper: Check if request has demo flag
export function isDemoMode(reqUrl?: string): boolean {
  if (!reqUrl) return false;
  try {
    const url = new URL(reqUrl);
    return url.searchParams.get('demo') === 'true';
  } catch {
    return reqUrl.includes('demo=true');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL JSON FALLBACK (DEMO MODE) HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function readDbJson(): DbSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      throw new Error('db.json not found');
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data) as DbSchema;
  } catch (err) {
    console.error('[DB-Local] Error reading database:', err);
    // Return empty schema if fails
    return {
      capital: 500000,
      initialCapital: 500000,
      positions: [],
      trades: [],
      peakCapital: 500000,
      maxDrawdown: 0,
    };
  }
}

function writeDbJson(db: DbSchema): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB-Local] Error writing database:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DUAL-MODE ASYNC DATA ACCESS LAYER (DAL)
// ─────────────────────────────────────────────────────────────────────────────

export async function getPortfolioState(demo: boolean) {
  if (demo) {
    const db = readDbJson();
    return {
      capital: db.capital,
      initialCapital: db.initialCapital,
      peakCapital: db.peakCapital,
      maxDrawdown: db.maxDrawdown,
    };
  } else {
    // Read from Supabase singleton
    let state = await prisma.portfolioState.findUnique({ where: { id: 1 } });
    if (!state) {
      state = await prisma.portfolioState.create({
        data: {
          id: 1,
          capital: 500000,
          initialCapital: 500000,
          peakCapital: 500000,
          maxDrawdown: 0,
        },
      });
    }
    return {
      capital: state.capital,
      initialCapital: state.initialCapital,
      peakCapital: state.peakCapital,
      maxDrawdown: state.maxDrawdown,
    };
  }
}

export async function savePortfolioState(
  demo: boolean,
  state: { capital: number; initialCapital: number; peakCapital: number; maxDrawdown: number }
): Promise<void> {
  if (demo) {
    const db = readDbJson();
    db.capital = state.capital;
    db.initialCapital = state.initialCapital;
    db.peakCapital = state.peakCapital;
    db.maxDrawdown = state.maxDrawdown;
    writeDbJson(db);
  } else {
    await prisma.portfolioState.upsert({
      where: { id: 1 },
      update: {
        capital: state.capital,
        initialCapital: state.initialCapital,
        peakCapital: state.peakCapital,
        maxDrawdown: state.maxDrawdown,
      },
      create: {
        id: 1,
        capital: state.capital,
        initialCapital: state.initialCapital,
        peakCapital: state.peakCapital,
        maxDrawdown: state.maxDrawdown,
      },
    });
  }
}

export async function getPositions(demo: boolean): Promise<PaperPosition[]> {
  if (demo) {
    const db = readDbJson();
    return db.positions as PaperPosition[];
  } else {
    const positions = await prisma.position.findMany({
      include: { legs: true },
    });
    return positions.map((pos) => ({
      id: pos.id,
      strategy: pos.strategy,
      symbol: pos.symbol,
      type: pos.type,
      legs: pos.legs.map((leg) => ({
        action: leg.action as 'BUY' | 'SELL',
        optionType: leg.optionType as 'CE' | 'PE',
        strike: leg.strike,
        expiry: leg.expiry,
        lotSize: leg.lotSize,
        quantity: leg.quantity,
        entryPremium: leg.entryPremium,
        currentPremium: leg.currentPremium,
        legPnl: leg.legPnl,
      })),
      entryDate: pos.entryDate,
      entryTime: pos.entryTime,
      expiry: pos.expiry,
      netCredit: pos.netCredit,
      maxRisk: pos.maxRisk,
      maxProfit: pos.maxProfit,
      probability: pos.probability,
      status: pos.status as PaperPosition['status'],
      currentValue: pos.currentValue,
      unrealizedPnl: pos.unrealizedPnl,
      realizedPnl: pos.realizedPnl,
      stopLossLevel: pos.stopLossLevel,
      targetLevel: pos.targetLevel,
      adjustmentCount: pos.adjustmentCount,
      notes: pos.notes,
      tags: pos.tags,
      regime: pos.regime,
    }));
  }
}

export async function addPosition(demo: boolean, position: PaperPosition): Promise<void> {
  if (demo) {
    const db = readDbJson();
    db.positions.push(position);
    writeDbJson(db);
  } else {
    await prisma.position.create({
      data: {
        id: position.id,
        strategy: position.strategy,
        symbol: position.symbol,
        type: position.type,
        entryDate: position.entryDate,
        entryTime: position.entryTime,
        expiry: position.expiry,
        netCredit: position.netCredit,
        maxRisk: position.maxRisk,
        maxProfit: position.maxProfit,
        probability: position.probability,
        status: position.status,
        currentValue: position.currentValue,
        unrealizedPnl: position.unrealizedPnl,
        realizedPnl: position.realizedPnl,
        stopLossLevel: position.stopLossLevel,
        targetLevel: position.targetLevel,
        adjustmentCount: position.adjustmentCount,
        notes: position.notes,
        tags: position.tags,
        regime: position.regime,
        legs: {
          create: position.legs.map((leg) => ({
            action: leg.action,
            optionType: leg.optionType,
            strike: leg.strike,
            expiry: leg.expiry,
            lotSize: leg.lotSize,
            quantity: leg.quantity,
            entryPremium: leg.entryPremium,
            currentPremium: leg.currentPremium,
            legPnl: leg.legPnl,
          })),
        },
      },
    });
  }
}

export async function updatePosition(demo: boolean, position: PaperPosition): Promise<void> {
  if (demo) {
    const db = readDbJson();
    const idx = db.positions.findIndex((p) => p.id === position.id);
    if (idx !== -1) {
      db.positions[idx] = position;
      writeDbJson(db);
    }
  } else {
    // Update position details
    await prisma.position.update({
      where: { id: position.id },
      data: {
        status: position.status,
        currentValue: position.currentValue,
        unrealizedPnl: position.unrealizedPnl,
        realizedPnl: position.realizedPnl,
        notes: position.notes,
        tags: position.tags,
        adjustmentCount: position.adjustmentCount,
      },
    });

    // Update associated legs in parallel
    for (const leg of position.legs) {
      await prisma.leg.updateMany({
        where: {
          positionId: position.id,
          strike: leg.strike,
          optionType: leg.optionType,
          action: leg.action,
        },
        data: {
          currentPremium: leg.currentPremium,
          legPnl: leg.legPnl,
        },
      });
    }
  }
}

export async function addTrade(demo: boolean, trade: PaperTrade): Promise<void> {
  if (demo) {
    const db = readDbJson();
    db.trades.push(trade);
    writeDbJson(db);
  } else {
    await prisma.trade.create({
      data: {
        id: trade.id,
        positionId: trade.positionId,
        action: trade.action,
        strategy: trade.strategy,
        symbol: trade.symbol,
        netCredit: trade.netCredit,
        pnl: trade.pnl,
        timestamp: new Date(trade.timestamp),
        reason: trade.reason,
        regime: trade.regime,
      },
    });
  }
}

export async function getTrades(demo: boolean): Promise<PaperTrade[]> {
  if (demo) {
    const db = readDbJson();
    return db.trades as PaperTrade[];
  } else {
    const trades = await prisma.trade.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    return trades.map((t) => ({
      id: t.id,
      positionId: t.positionId,
      action: t.action as 'OPEN' | 'CLOSE' | 'ADJUST',
      strategy: t.strategy,
      symbol: t.symbol,
      netCredit: t.netCredit,
      pnl: t.pnl,
      timestamp: t.timestamp.toISOString(),
      reason: t.reason,
      regime: t.regime,
    }));
  }
}

export async function resetDatabase(demo: boolean): Promise<void> {
  if (demo) {
    const DEFAULT_DB: DbSchema = {
      capital: 500000,
      initialCapital: 500000,
      positions: [],
      trades: [],
      peakCapital: 500000,
      maxDrawdown: 0,
    };
    writeDbJson(DEFAULT_DB);
  } else {
    // Reset Supabase DB tables for paper trading
    await prisma.leg.deleteMany({});
    await prisma.trade.deleteMany({});
    await prisma.position.deleteMany({});
    await prisma.portfolioState.upsert({
      where: { id: 1 },
      update: {
        capital: 500000,
        initialCapital: 500000,
        peakCapital: 500000,
        maxDrawdown: 0,
      },
      create: {
        id: 1,
        capital: 500000,
        initialCapital: 500000,
        peakCapital: 500000,
        maxDrawdown: 0,
      },
    });
  }
}
