// app/api/fyers/ping/route.ts
import { NextResponse } from 'next/server';
import { getFyersHeaders } from '@/lib/fyers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch('https://api-t1.fyers.in/api/v3/profile', {
      headers: getFyersHeaders(),
      cache: 'no-store'
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `HTTP error ${res.status}` });
    }

    const data = await res.json();
    if (data.s === 'ok' && data.data) {
      return NextResponse.json({
        success: true,
        name: data.data.name || data.data.display_name,
        clientCode: data.data.client_id || data.data.fy_id
      });
    } else {
      return NextResponse.json({ success: false, error: data.message || 'Invalid token response' });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) });
  }
}
