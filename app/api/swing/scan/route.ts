// app/api/swing/scan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { runSwingScan, generateSimulatedSwingReport } from '@/swing/scanner';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const demo = req.nextUrl.searchParams.get('demo') === 'true';

    // If demo mode is active, bypass DB and return simulated report
    if (demo) {
      const simulatedReport = generateSimulatedSwingReport();
      return NextResponse.json({ success: true, ...simulatedReport, isCached: false, isDemo: true });
    }

    // Try to load the latest cached swing scan from the database
    const latestScan = await prisma.swingScan.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (latestScan) {
      return NextResponse.json({
        success: true,
        ...(latestScan.data as any),
        id: latestScan.id,
        isCached: true,
        scannedAt: latestScan.createdAt.toISOString()
      });
    }

    // No scan exists, run a new one and cache it
    const newReport = await runSwingScan();
    const saved = await prisma.swingScan.create({
      data: {
        data: newReport as any
      }
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
    // Fallback to simulated report on failure
    const fallback = generateSimulatedSwingReport();
    return NextResponse.json({ success: true, ...fallback, error: String(error), isDemo: true });
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
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
