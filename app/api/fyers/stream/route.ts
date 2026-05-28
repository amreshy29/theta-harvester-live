// app/api/fyers/stream/route.ts
// Server-Sent Events endpoint — streams real-time market ticks to the browser.
// Live mode : connects to Fyers Data WebSocket → pipes ticks as SSE events.
// Simulated : generates random-walk ticks every second.
//
// Edge Runtime keeps the connection alive past the 10s serverless limit.

export const runtime = 'edge';

import { DEFAULT_WATCHLIST } from '@/lib/fyers';

// ── Types ─────────────────────────────────────────────────────────────────────
interface SimBase { ltp: number; drift: number }

const SIM_BASE: Record<string, SimBase> = {
  'NSE:NIFTY50-INDEX':    { ltp: 24850,  drift: 0 },
  'NSE:NIFTYBANK-INDEX':  { ltp: 53200,  drift: 0 },
  'NSE:INDIA VIX-INDEX':  { ltp: 14.8,   drift: 0 },
  'NSE:FINNIFTY-INDEX':   { ltp: 23640,  drift: 0 },
};

function simTick(symbol: string) {
  const s   = SIM_BASE[symbol] || { ltp: 100, drift: 0 };
  const chg = (Math.random() - 0.5) * s.ltp * 0.002 - s.drift * 0.1;
  s.drift  += chg;
  s.ltp     = Math.round((s.ltp + chg) * 100) / 100;
  SIM_BASE[symbol] = s;
  return {
    symbol,
    ltp:       s.ltp,
    change:    chg,
    changePct: (chg / (s.ltp - chg)) * 100,
    open:      s.ltp * (1 + (Math.random() - 0.5) * 0.005),
    high:      s.ltp * (1 + Math.random() * 0.008),
    low:       s.ltp * (1 - Math.random() * 0.008),
    close:     SIM_BASE[symbol]?.ltp ?? s.ltp,
    bid:       s.ltp - 0.05,
    ask:       s.ltp + 0.05,
    volume:    Math.floor(Math.random() * 5_000_000) + 500_000,
    oi:        symbol.includes('VIX') ? undefined : Math.floor(Math.random() * 1_000_000),
    timestamp: Date.now(),
  };
}

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
      send('status', { live, connected: false });

      // ── LIVE: Fyers WebSocket ──────────────────────────────────────────────
      if (live) {
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
            send('status', { live: true, connected: false, error: 'WebSocket error — falling back' });
            startSim(send);
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
          send('status', { live: false, error: String(err) });
          startSim(send);
        }

      // ── SIMULATED mode ─────────────────────────────────────────────────────
      } else {
        send('status', { live: false, connected: true, simulated: true });
        startSim(send);
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

// ── Simulated tick generator ──────────────────────────────────────────────────
function startSim(send: (e: string, d: unknown) => void) {
  const tick = () => {
    for (const sym of DEFAULT_WATCHLIST) {
      send('tick', simTick(sym));
    }
  };
  tick(); // immediate first tick
  const id = setInterval(tick, 1000);
  // Edge runtime doesn't allow process.on cleanup, but the stream cancel() closes it
  // We store on globalThis to allow cancel to reach it (best-effort in Edge)
  (globalThis as Record<string, unknown>).__simInterval = id;
}
