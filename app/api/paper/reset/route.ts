// app/api/paper/reset/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { paperEngine } from '@/lib/paperEngine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const demo = req.nextUrl.searchParams.get('demo') === 'true';
  await paperEngine.reset(demo);
  return NextResponse.json({ success: true, message: `Paper trading account reset to ₹5,00,000 (${demo ? 'Demo Mode' : 'Live DB Mode'})` });
}
