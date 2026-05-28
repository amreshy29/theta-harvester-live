// app/api/fyers/stream/route.ts
// Server-Sent Events endpoint — streams real-time market ticks to the browser.
// Live mode : connects to Fyers Data WebSocket → pipes ticks as SSE events.
//
// Edge Runtime keeps the connection alive past the 10s serverless limit.

export const runtime = 'edge';

import { DEFAULT_WATCHLIST } from '@/lib/fyers';

// ── Fyers WebSocket message parser ────────────────────────────────────────────
// Fyers streams raw binary frames; the text frames are JSON.
// We handle the JSON text frames (heartbeats, confirmations, data ticks).
function parseFyersTick(raw: string) {
  try {
    const msg = JSON.parse(raw);
    // Data tick: { T: 'if', n: 'NSE:NIFTY50-INDEX', v: { lp, ch, chp, ... } }
    if (msg.T === 'if' && msg.v) {
      const v = msg.v;
      return {
        symbol:    msg.n  || '',
        ltp:       v.lp   ?? v.ltp ?? 0,
        change:    v.ch   ?? 0,
        changePct: v.chp  ?? 0,
        open:      v.op   ?? v.open_price   ?? 0,
        high:      v.h    ?? v.high_price   ?? 0,
        low:       v.l    ?? v.low_price    ?? 0,
        close:     v.c    ?? v.prev_close_price ?? 0,
        bid:       v.bp   ?? v.bid ?? 0,
        ask:       v.ap   ?? v.ask ?? 0,
        volume:    v.v    ?? v.volume ?? 0,
        oi:        v.oi,
        timestamp: (v.tt  ?? Date.now() / 1000) * 1000,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Profile fetch (needed for WebSocket user_id) ──────────────────────────────
async function getFyersUserId(appId: string, accessToken: string): Promise<string> {
  try {
    const res = await fetch('https://api-t1.fyers.in/api/v3/profile', {
      headers: { Authorization: `${appId}:${accessToken}` },
    });
    const j = await res.json();
    return j?.data?.fy_id || j?.data?.client_id || appId.split('-')[0] || '';
  } catch {
    return appId.split('-')[0] || '';
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET() {
  const appId       = process.env.FYERS_APP_ID       || '';
  const accessToken = process.env.FYERS_ACCESS_TOKEN || '';
  const live        = !!(appId && accessToken && accessToken !== 'your_access_token_here');

  if (!live) {
    return new Response(
      JSON.stringify({ success: false, error: 'Fyers credentials not configured.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();
  let closed    = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        } catch { closed = true; }
      };

      // Initial status event
      send('status', { live: true, connected: false });

      // ── LIVE: Fyers WebSocket ──────────────────────────────────────────────
      try {
        const userId = await getFyersUserId(appId, accessToken);
        const wsUrl  =
          `wss://api-t2.fyers.in/socket/2.0/dataSock` +
          `?access_token=${encodeURIComponent(`${appId}:${accessToken}`)}` +
          `&user_id=${encodeURIComponent(userId)}`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          send('status', { live: true, connected: true, userId });
          // Subscribe to all watchlist symbols (level 1 quote + OI)
          ws.send(JSON.stringify({
            T:      'SUB_L2',
            L2: {
              t:      'l2',
              SUB_T:  1,
              TICKER: DEFAULT_WATCHLIST,
            },
          }));
        };

        ws.onmessage = (e) => {
          if (typeof e.data !== 'string') return;
          const tick = parseFyersTick(e.data);
          if (tick) send('tick', tick);
        };

        ws.onerror = () => {
          send('status', { live: true, connected: false, error: 'WebSocket error' });
        };

        ws.onclose = () => {
          if (!closed) send('status', { live: true, connected: false, error: 'WebSocket closed' });
        };

        // Keep-alive ping every 25s (Fyers drops idle connections after 30s)
        const ping = setInterval(() => {
          if (closed || ws.readyState !== WebSocket.OPEN) { clearInterval(ping); return; }
          ws.send(JSON.stringify({ T: 'HB' }));
        }, 25_000);

      } catch (err) {
        send('status', { live: true, connected: false, error: String(err) });
      }
    },

    cancel() { closed = true; },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',      // disable nginx buffering on Vercel
    },
  });
}
