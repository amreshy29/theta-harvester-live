// app/api/fyers/auth/route.ts
// GET  /api/fyers/auth  → returns the Fyers OAuth login URL
// POST /api/fyers/auth  { auth_code } → exchanges code for access_token

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const APP_ID     = process.env.FYERS_APP_ID     || '';
const APP_SECRET = process.env.FYERS_APP_SECRET || '';

// ── Redirect URI — must match EXACTLY what is registered in Fyers API dashboard ──
const REDIRECT_URI =
  process.env.FYERS_REDIRECT_URI ||
  'https://theta-harvester-live.vercel.app/fyers-login';

// ── GET: build + return the Fyers OAuth login URL ─────────────────────────────
export async function GET() {
  if (!APP_ID) {
    return NextResponse.json(
      { success: false, error: 'FYERS_APP_ID not set in environment' },
      { status: 500 }
    );
  }

  const authUrl =
    `https://api-t1.fyers.in/api/v3/generate-authcode` +
    `?client_id=${encodeURIComponent(APP_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&state=theta_harvester`;

  return NextResponse.json({ success: true, authUrl, appId: APP_ID, redirectUri: REDIRECT_URI });
}

// ── POST: exchange auth_code → access_token ───────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { auth_code } = await req.json();

    if (!auth_code) {
      return NextResponse.json(
        { success: false, error: 'auth_code is required' },
        { status: 400 }
      );
    }
    if (!APP_ID || !APP_SECRET) {
      return NextResponse.json(
        { success: false, error: 'FYERS_APP_ID or FYERS_APP_SECRET not configured' },
        { status: 500 }
      );
    }

    // Fyers API v3: appIdHash = SHA-256(app_id + ":" + secret_key)
    // This is a static credential hash — NOT the auth_code
    const appHash = crypto
      .createHash('sha256')
      .update(`${APP_ID}:${APP_SECRET}`)
      .digest('hex');

    const res = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        grant_type: 'authorization_code',
        appIdHash:  appHash,
        code:       auth_code,
      }),
    });

    const data = await res.json();

    if (data.s !== 'ok' || !data.access_token) {
      return NextResponse.json(
        { success: false, error: data.message || 'Token generation failed', raw: data },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success:      true,
      access_token: data.access_token,
      message:      'Set FYERS_ACCESS_TOKEN in your .env or Vercel dashboard.',
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
