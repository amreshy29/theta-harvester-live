// app/api/swing/scan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { runSwingScan, generateSimulatedSwingReport } from '@/swing/scanner';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const CACHE_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function GET(req: NextRequest) {
  try {
    const demo = req.nextUrl.searchParams.get('demo') === 'true';

    if (demo) {
      const simulatedReport = generateSimulatedSwingReport();
      return NextResponse.json({ success: true, ...simulatedReport, isCached: false, isDemo: true });
    }

    // Serve cached scan only if fresh (< 4 hours old) and not a simulated fallback
    const latestScan = await prisma.swingScan.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (latestScan) {
      const ageMs = Date.now() - new Date(latestScan.createdAt).getTime();
      const isFake = (latestScan.data as any)?.isDemo === true;
      if (ageMs < CACHE_MAX_AGE_MS && !isFake) {
        return NextResponse.json({
          success: true,
          ...(latestScan.data as any),
          id: latestScan.id,
          isCached: true,
          scannedAt: latestScan.createdAt.toISOString()
        });
      }
    }

    // Cache missing, stale, or was simulated — run a fresh live scan
    const newReport = await runSwingScan();
    const saved = await prisma.swingScan.create({
      data: { data: newReport as any }
    });

    return NextResponse.json({
      success: true,
      ...newReport,
      id: saved.id,
      isCached: false,
      scannedAt: saved.createdAt.toISOString()
    });
  } catch (error) {
    console.error('[API] Error in swing scan GET:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const demo = req.nextUrl.searchParams.get('demo') === 'true';

    if (demo) {
      const simulatedReport = generateSimulatedSwingReport();
      return NextResponse.json({ success: true, ...simulatedReport, isCached: false, isDemo: true });
    }

    console.log('[API] Force running a fresh swing scan...');
    const freshReport = await runSwingScan();

    const saved = await prisma.swingScan.create({
      data: {
        data: freshReport as any
      }
    });

    return NextResponse.json({
      success: true,
      ...freshReport,
      id: saved.id,
      isCached: false,
      scannedAt: saved.createdAt.toISOString()
    });
  } catch (error) {
    console.error('[API] Error in swing scan POST:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
