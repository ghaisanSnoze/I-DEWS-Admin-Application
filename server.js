const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('I-DEWS Real-time Gateway Server is running...\n');
});

const wss = new WebSocket.Server({ server });
const PORT = 8080;

let systemAlertActive = false;

setInterval(() => {
  let seismicValue;

  if (systemAlertActive) {
    seismicValue = parseFloat((7.0 + Math.random() * 2.1).toFixed(1));
  } else {
    seismicValue = parseFloat((0.8 + Math.random() * 0.7).toFixed(1));
  }

  const telemetryPayload = JSON.stringify({
    type: 'TELEMETRY',
    sensor: 'ST04',
    value: seismicValue,
    alert: systemAlertActive,
    timestamp: new Date().toLocaleTimeString()
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(telemetryPayload);
    }
  });
}, 500);

wss.on('connection', (ws) => {
  console.log('📱 Mobile Admin Connected!');

  ws.send(JSON.stringify({
    type: 'SYSTEM_STATUS',
    alert: systemAlertActive
  }));

  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message);
      console.log(`📥 Received Command from Mobile App:`, payload);

      if (payload.type === 'TRIGGER_CAO_OVERRIDE') {
        systemAlertActive = payload.active;
        console.log(`🚨 ALERT STATUS CHANGED GLOBALLY TO: ${systemAlertActive ? 'ACTIVE' : 'INACTIVE'}`);

        const statusBroadcast = JSON.stringify({
          type: 'SYSTEM_STATUS',
          alert: systemAlertActive
        });

        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(statusBroadcast);
          }
        });
      }
    } catch (err) {
      console.error('Error parsing client message:', err);
    }
  });

  ws.on('close', () => {
    console.log('❌ Client Disconnected.');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ======================================================
     📡 I-DEWS REAL-TIME GATEWAY SERVER RUNNING
     Port: ${PORT}
     Websocket Endpoint: ws://YOUR_LAPTOP_IP:${PORT}
  ======================================================
  `);
});