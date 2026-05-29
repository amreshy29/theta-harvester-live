// app/api/fyers/stream/route.ts
// Server-Sent Events endpoint — streams real-time market ticks to the browser.
// Uses official fyers-api-v3 DataSocket to handle binary HSM protocol.

import { NextRequest } from 'next/server';
import os from 'os';
import { DEFAULT_WATCHLIST } from '@/lib/fyers';

export const dynamic = 'force-dynamic';

// Load fyers-api-v3 dynamically to bypass Next.js static build/compile analysis
let fyersDataSocket: any = null;
try {
  const fyersApi = eval("require('fyers-api-v3')");
  fyersDataSocket = fyersApi.fyersDataSocket;
} catch (err) {
  console.error('[Fyers Stream API] Critical error loading fyers-api-v3:', err);
}

// Keep registry of active stream controllers and socket instance in module scope
const activeControllers = new Set<ReadableStreamDefaultController>();
let sktInstance: any = null;
const encoder = new TextEncoder();

// Broadcast helper
function broadcast(event: string, payload: unknown) {
  const packet = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  for (const controller of activeControllers) {
    try {
      controller.enqueue(packet);
    } catch {
      // Controller is probably closed, will be removed in cancel
    }
  }
}

// Master message callback for fyersDataSocket
function masterMessageCallback(message: any) {
  if (!message) return;
  
  if (message.type === 'if' || message.type === 'sf' || message.type === 'dp') {
    const mappedTick = {
      symbol:    message.symbol,
      ltp:       message.ltp ?? 0,
      change:    message.ch ?? message.change ?? 0,
      changePct: message.chp ?? message.changePct ?? 0,
      open:      message.open_price ?? message.open ?? 0,
      high:      message.high_price ?? message.high ?? 0,
      low:       message.low_price ?? message.low ?? 0,
      close:     message.prev_close_price ?? message.close ?? 0,
      bid:       message.bid ?? 0,
      ask:       message.ask ?? 0,
      volume:    message.volume ?? 0,
      oi:        message.oi ?? 0,
      timestamp: (message.exch_feed_time ?? Date.now() / 1000) * 1000,
    };
    broadcast('tick', mappedTick);
  } else if (message.type === 'cn') {
    console.log('[Fyers Stream API] Master Socket auth successful');
    broadcast('status', { live: true, connected: true });
  } else if (message.type === 'sub') {
    console.log('[Fyers Stream API] Subscription confirmed for symbols');
  } else if (message.code && message.code !== 200) {
    console.error('[Fyers Stream API] SDK non-200 code received:', message);
    broadcast('status', { live: true, connected: false, error: message.message || `Error code ${message.code}` });
  }
}

export async function GET(req: NextRequest) {
  const appId       = process.env.FYERS_APP_ID       || '';
  const accessToken = process.env.FYERS_ACCESS_TOKEN || '';
  const live        = !!(appId && accessToken && accessToken !== 'your_access_token_here');

  if (!live) {
    return new Response(
      JSON.stringify({ success: false, error: 'Fyers credentials not configured.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!fyersDataSocket) {
    return new Response(
      JSON.stringify({ success: false, error: 'Fyers SDK could not be loaded.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let localController: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    async start(controller) {
      localController = controller;
      activeControllers.add(controller);
      console.log(`[Fyers Stream API] New client connected. Active clients: ${activeControllers.size}`);

      // Send initial status event to the newly connected client
      const isConnected = sktInstance && sktInstance.isConnected();
      controller.enqueue(
        encoder.encode(`event: status\ndata: ${JSON.stringify({ live: true, connected: !!isConnected })}\n\n`)
      );

      // If socket is not initialized, create it
      if (!sktInstance) {
        try {
          console.log('[Fyers Stream API] Initializing master fyersDataSocket connection...');
          const logPath = os.tmpdir();
          
          // Initialize singleton instance
          sktInstance = fyersDataSocket.getInstance(`${appId}:${accessToken}`, logPath, false);

          sktInstance.on('connect', () => {
            console.log('[Fyers Stream API] Master Socket connected successfully!');
            broadcast('status', { live: true, connected: true });
            
            // Subscribe to default watchlist (verify instance wasn't cleaned up during handshake)
            if (sktInstance) {
              console.log('[Fyers Stream API] Subscribing to default watchlist:', DEFAULT_WATCHLIST);
              try {
                sktInstance.subscribe(DEFAULT_WATCHLIST);
              } catch (e) {
                console.error('[Fyers Stream API] Error subscribing on connect:', e);
              }
            }
          });

          sktInstance.on('message', masterMessageCallback);

          sktInstance.on('error', (err: any) => {
            console.error('[Fyers Stream API] Master Socket error event:', err);
            broadcast('status', { live: true, connected: false, error: String(err) });
          });

          sktInstance.on('close', () => {
            console.log('[Fyers Stream API] Master Socket closed event');
            broadcast('status', { live: true, connected: false, error: 'Connection closed' });
            
            // Close all active client stream controllers to force browser EventSource reconnection
            for (const client of activeControllers) {
              try {
                client.close();
              } catch {}
            }
            activeControllers.clear();
            sktInstance = null; // Reset instance so it recreates on next client request
          });

          sktInstance.connect();

        } catch (err) {
          console.error('[Fyers Stream API] Error setting up socket connection:', err);
          controller.enqueue(
            encoder.encode(`event: status\ndata: ${JSON.stringify({ live: true, connected: false, error: String(err) })}\n\n`)
          );
        }
      } else {
        // If socket is already initialized but disconnected, try connecting it
        if (sktInstance && !sktInstance.isConnected()) {
          console.log('[Fyers Stream API] Socket exists but disconnected, reconnecting...');
          try {
            sktInstance.connect();
          } catch (err) {
            console.error('[Fyers Stream API] Error reconnecting existing socket:', err);
          }
        } else if (sktInstance) {
          // It's already connected, subscribe watchlist to ensure symbols are streaming
          try {
            sktInstance.subscribe(DEFAULT_WATCHLIST);
          } catch (e) {
            console.error('[Fyers Stream API] Error re-subscribing watchlist:', e);
          }
        }
      }
    },

    cancel(reason) {
      if (localController) {
        activeControllers.delete(localController);
      }
      console.log(`[Fyers Stream API] Client disconnected (reason: ${reason || 'unknown'}). Remaining clients: ${activeControllers.size}`);

      // Clean up the master connection if there are no more active clients listening
      if (activeControllers.size === 0 && sktInstance) {
        console.log('[Fyers Stream API] No more active clients. Closing master connection...');
        try {
          sktInstance.close();
        } catch (e) {
          console.error('[Fyers Stream API] Error closing master socket on idle:', e);
        }
        sktInstance = null;
      }
    },
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
