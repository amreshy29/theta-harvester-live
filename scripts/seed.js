// scripts/seed.js
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DB_FILE = path.join(__dirname, '..', 'db.json');

async function main() {
  console.log('Starting Supabase Seeding / Migration...');

  if (!fs.existsSync(DB_FILE)) {
    console.log('No db.json file found in root. Nothing to seed.');
    return;
  }

  const data = fs.readFileSync(DB_FILE, 'utf8');
  const dbData = JSON.parse(data);

  // 1. Seed PortfolioState
  console.log('Seeding PortfolioState...');
  const portfolioState = await prisma.portfolioState.upsert({
    where: { id: 1 },
    update: {
      capital: dbData.capital ?? 500000,
      initialCapital: dbData.initialCapital ?? 500000,
      peakCapital: dbData.peakCapital ?? 500000,
      maxDrawdown: dbData.maxDrawdown ?? 0,
    },
    create: {
      id: 1,
      capital: dbData.capital ?? 500000,
      initialCapital: dbData.initialCapital ?? 500000,
      peakCapital: dbData.peakCapital ?? 500000,
      maxDrawdown: dbData.maxDrawdown ?? 0,
    },
  });
  console.log('PortfolioState seeded:', portfolioState);

  // 2. Seed Positions & Legs
  console.log(`Seeding ${dbData.positions?.length || 0} positions...`);
  if (dbData.positions && dbData.positions.length > 0) {
    for (const pos of dbData.positions) {
      // Map statuses from old format to the new requested format
      let status = 'CLOSED';
      if (pos.status === 'OPEN') status = 'OPEN';
      else if (pos.status === 'CLOSED') status = 'CLOSED';
      else if (pos.status === 'STOPPED') status = 'STOP_LOSS_HIT';
      else if (pos.status === 'EXPIRED') status = 'CLOSED';

      await prisma.position.upsert({
        where: { id: pos.id },
        update: {
          strategy: pos.strategy,
          symbol: pos.symbol,
          type: pos.type,
          entryDate: pos.entryDate,
          entryTime: pos.entryTime,
          expiry: pos.expiry,
          netCredit: pos.netCredit,
          maxRisk: pos.maxRisk,
          maxProfit: pos.maxProfit,
          probability: pos.probability,
          status: status,
          currentValue: pos.currentValue,
          unrealizedPnl: pos.unrealizedPnl,
          realizedPnl: pos.realizedPnl,
          stopLossLevel: pos.stopLossLevel,
          targetLevel: pos.targetLevel,
          adjustmentCount: pos.adjustmentCount ?? 0,
          notes: pos.notes ?? [],
          tags: pos.tags ?? [],
          regime: pos.regime ?? 'NORMAL',
        },
        create: {
          id: pos.id,
          strategy: pos.strategy,
          symbol: pos.symbol,
          type: pos.type,
          entryDate: pos.entryDate,
          entryTime: pos.entryTime,
          expiry: pos.expiry,
          netCredit: pos.netCredit,
          maxRisk: pos.maxRisk,
          maxProfit: pos.maxProfit,
          probability: pos.probability,
          status: status,
          currentValue: pos.currentValue,
          unrealizedPnl: pos.unrealizedPnl,
          realizedPnl: pos.realizedPnl,
          stopLossLevel: pos.stopLossLevel,
          targetLevel: pos.targetLevel,
          adjustmentCount: pos.adjustmentCount ?? 0,
          notes: pos.notes ?? [],
          tags: pos.tags ?? [],
          regime: pos.regime ?? 'NORMAL',
        },
      });

      // Clear existing legs for this position to avoid duplicates
      await prisma.leg.deleteMany({ where: { positionId: pos.id } });

      if (pos.legs && pos.legs.length > 0) {
        for (const leg of pos.legs) {
          await prisma.leg.create({
            data: {
              positionId: pos.id,
              action: leg.action,
              optionType: leg.optionType,
              strike: Number(leg.strike),
              expiry: leg.expiry,
              lotSize: Number(leg.lotSize),
              quantity: Number(leg.quantity),
              entryPremium: Number(leg.entryPremium),
              currentPremium: Number(leg.currentPremium),
              legPnl: Number(leg.legPnl),
            },
          });
        }
      }
    }
  }

  // 3. Seed Trades
  console.log(`Seeding ${dbData.trades?.length || 0} trades...`);
  if (dbData.trades && dbData.trades.length > 0) {
    for (const trade of dbData.trades) {
      await prisma.trade.upsert({
        where: { id: trade.id },
        update: {
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
        create: {
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

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
