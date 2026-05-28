// test_hsm.js
// Test HSM WebSocket connection and subscribe to tickers to see stream data
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

const wsUrl = `wss://socket.fyers.in/hsm/v1-5/prod?access_token=${encodeURIComponent(`${appId}:${accessToken}`)}&user_id=${encodeURIComponent(userId)}`;
console.log(`Connecting to HSM: ${wsUrl.slice(0, 100)}...`);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ Connected to HSM WebSocket!');
  
  // Send subscription packet
  const subMsg = JSON.stringify({
    T: 'SUB_L2',
    L2: {
      t: 'l2',
      SUB_T: 1,
      TICKER: [
        'NSE:NIFTY50-INDEX',
        'NSE:NIFTYBANK-INDEX',
        'NSE:INDIA VIX-INDEX'
      ]
    }
  });
  console.log('Sending subscription:', subMsg);
  ws.send(subMsg);
});

ws.on('message', (data) => {
  console.log('Received message of type:', typeof data, 'Length:', data.length);
  try {
    // Try to decode as string
    const str = data.toString();
    console.log('As string:', str.slice(0, 300));
    const json = JSON.parse(str);
    console.log('As JSON:', json);
  } catch (err) {
    console.log('Could not decode message as JSON string, raw bytes:', data);
  }
});

ws.on('error', (err) => {
  console.error('❌ Error:', err.message || err);
});

ws.on('close', (code, reason) => {
  console.log(`Connection closed: ${code} - ${reason.toString() || 'no reason'}`);
});

setTimeout(() => {
  console.log('Closing connection after 10s...');
  ws.close();
}, 10000);
