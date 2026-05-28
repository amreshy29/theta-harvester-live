// app/api/paper/reset/route.ts
import { NextResponse } from 'next/server';
import { paperEngine } from '@/lib/paperEngine';

export const dynamic = 'force-dynamic';

export async function POST() {
  paperEngine.reset();
  return NextResponse.json({ success: true, message: 'Paper trading account reset to ₹5,00,000' });
}
