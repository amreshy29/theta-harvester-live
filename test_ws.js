// test_ws.js
// Test WebSocket connection using Fyers v3 endpoints
const fs = require('fs');
const path = require('path');

let WebSocket;
try {
  WebSocket = require('ws');
} catch (err) {
  WebSocket = require('./node_modules/ws');
}

// Load .env
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const getEnvVar = (name) => {
  const match = envContent.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
};

const appId = getEnvVar('FYERS_APP_ID');
const accessToken = getEnvVar('FYERS_ACCESS_TOKEN');
const userId = 'XA30694';

console.log('App ID:', appId);
console.log('User ID:', userId);

// We will test both query param URLs and sending auth JSON message after connection
const tests = [
  {
    name: 'v2 api.fyers.in dataSock with query params',
    url: `wss://api.fyers.in/socket/2.0/dataSock?access_token=${encodeURIComponent(`${appId}:${accessToken}`)}&user_id=${encodeURIComponent(userId)}`
  },
  {
    name: 'v2 api-t1.fyers.in dataSock with query params',
    url: `wss://api-t1.fyers.in/socket/2.0/dataSock?access_token=${encodeURIComponent(`${appId}:${accessToken}`)}&user_id=${encodeURIComponent(userId)}`
  },
  {
    name: 'v3 api.fyers.in data with query params',
    url: `wss://api.fyers.in/socket/v2/data?access_token=${encodeURIComponent(`${appId}:${accessToken}`)}&user_id=${encodeURIComponent(userId)}`
  },
  {
    name: 'v3 api-t1.fyers.in data with query params',
    url: `wss://api-t1.fyers.in/socket/v2/data?access_token=${encodeURIComponent(`${appId}:${accessToken}`)}&user_id=${encodeURIComponent(userId)}`
  },
  {
    name: 'v3 api.fyers.in data/ with query params',
    url: `wss://api.fyers.in/socket/v2/data/?access_token=${encodeURIComponent(`${appId}:${accessToken}`)}&user_id=${encodeURIComponent(userId)}`
  },
  {
    name: 'v3 socket.fyers.in/hsm/v1-5/prod with query params',
    url: `wss://socket.fyers.in/hsm/v1-5/prod?access_token=${encodeURIComponent(`${appId}:${accessToken}`)}&user_id=${encodeURIComponent(userId)}`
  },
  {
    name: 'v3 api.fyers.in data/ using auth message post-connection',
    url: 'wss://api.fyers.in/socket/v2/data/',
    sendAuth: true
  },
  {
    name: 'v3 api-t1.fyers.in data/ using auth message post-connection',
    url: 'wss://api-t1.fyers.in/socket/v2/data/',
    sendAuth: true
  }
];

function runTest(t) {
  return new Promise((resolve) => {
    console.log(`\n----------------------------------------\nTesting: ${t.name}`);
    console.log(`URL: ${t.url.slice(0, 100)}...`);
    
    let resolved = false;
    let ws;
    try {
      ws = new WebSocket(t.url);
    } catch (e) {
      console.error('Instantiation failed:', e.message);
      return resolve(false);
    }

    ws.on('open', () => {
      console.log('✅ Connected!');
      if (t.sendAuth) {
        console.log('Sending auth packet...');
        // Fyers v3 auth message payload is usually {"token": "appId:accessToken", "type": "connect"} 
        // or {"token": "appId:accessToken", "type": "auth"}
        const payload = JSON.stringify({
          token: `${appId}:${accessToken}`,
          type: 'connect'
        });
        ws.send(payload);
      } else {
        ws.close();
        resolved = true;
        resolve(true);
      }
    });

    ws.on('message', (data) => {
      console.log('Received message:', data.toString());
      if (t.sendAuth) {
        ws.close();
        resolved = true;
        resolve(true);
      }
    });

    ws.on('unexpected-response', (req, res) => {
      console.error(`❌ Unexpected response: Status Code = ${res.statusCode}`);
      res.on('data', (d) => console.log('Response Body:', d.toString()));
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket Error:', err.message || err);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`Closed (Code: ${code}, Reason: ${reason.toString() || 'none'})`);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        console.log('⏳ TIMEOUT');
        ws.terminate();
        resolve(false);
      }
    }, 6000);
  });
}

(async () => {
  for (const t of tests) {
    await runTest(t);
  }
})();
