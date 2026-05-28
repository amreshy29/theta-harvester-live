// test_ws_headers.js
// Test WebSocket connection using Authorization headers instead of query parameters
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

const testEndpoints = [
  { url: 'wss://api.fyers.in/socket/2.0/dataSock', name: 'api.fyers.in v2 dataSock' },
  { url: 'wss://api-t1.fyers.in/socket/2.0/dataSock', name: 'api-t1.fyers.in v2 dataSock' },
  { url: 'wss://api.fyers.in/socket/v2/data', name: 'api.fyers.in v3 data' },
  { url: 'wss://api.fyers.in/socket/v2/data/', name: 'api.fyers.in v3 data/' },
  { url: 'wss://api-t1.fyers.in/socket/v2/data', name: 'api-t1.fyers.in v3 data' },
  { url: 'wss://api-t1.fyers.in/socket/v2/data/', name: 'api-t1.fyers.in v3 data/' }
];

function runTest(t) {
  return new Promise((resolve) => {
    console.log(`\n----------------------------------------\nTesting: ${t.name}`);
    console.log(`URL: ${t.url}`);
    
    let resolved = false;
    let ws;
    try {
      ws = new WebSocket(t.url, {
        headers: {
          'Authorization': `${appId}:${accessToken}`,
          'User-Agent': 'Mozilla/5.0'
        }
      });
    } catch (e) {
      console.error('Instantiation failed:', e.message);
      return resolve(false);
    }

    ws.on('open', () => {
      console.log('✅ Connected!');
      ws.close();
      resolved = true;
      resolve(true);
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
    }, 5000);
  });
}

(async () => {
  for (const t of testEndpoints) {
    await runTest(t);
  }
})();
